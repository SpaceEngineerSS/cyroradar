/* WebGPU backend for the envelope FWI. Runs the same scheme as the CPU
 * backend in model.ts, one compute dispatch per time step, all steps of a pass
 * recorded into a single compute pass. Per-step parameters live in one
 * uniform buffer addressed with dynamic offsets. */

import shaderSource from '../../gpu/fwi.wgsl?raw';
import type { FWIBackend, FWIGrid, FineFields } from './model';

const STEP_STRIDE = 256;

/** Our arrays never sit on a SharedArrayBuffer; tell the WebGPU typings so. */
const plain = (a: Float32Array) => a as Float32Array<ArrayBuffer>;

export async function createWebGpuBackend(grid: FWIGrid): Promise<FWIBackend | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) return null;

  const N = grid.nx * grid.nz;
  const snapBytes = grid.ntc * 3 * N * 4;
  if (snapBytes > adapter.limits.maxStorageBufferBindingSize || snapBytes > adapter.limits.maxBufferSize) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, Math.max(snapBytes, 128 << 20)),
        maxBufferSize: Math.min(adapter.limits.maxBufferSize, Math.max(snapBytes, 256 << 20)),
      },
    });
  } catch {
    return null;
  }
  let lost = false;
  void device.lost.then(() => {
    lost = true;
  });

  const S = GPUBufferUsage.STORAGE;
  const buf = (size: number, usage: number) => device.createBuffer({ size: Math.max(16, size), usage });
  const fieldBytes = N * 4;

  const gridBuf = buf(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const stepBuf = buf(grid.steps * STEP_STRIDE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const c2Buf = buf(fieldBytes, S | GPUBufferUsage.COPY_DST);
  const rhoBuf = buf(fieldBytes, S | GPUBufferUsage.COPY_DST);
  const etaBuf = buf(fieldBytes, S | GPUBufferUsage.COPY_DST);
  const ring = [0, 1, 2].map(() => buf(fieldBytes, S | GPUBufferUsage.COPY_DST));
  const recBuf = buf(grid.ntc * grid.nx * 4, S | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  const adjBuf = buf(grid.ntc * grid.nx * 4, S | GPUBufferUsage.COPY_DST);
  const gradBuf = buf(2 * fieldBytes, S | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  const snapBuf = buf(snapBytes, S | GPUBufferUsage.COPY_DST);
  const readRec = buf(grid.ntc * grid.nx * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const readGrad = buf(2 * fieldBytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const all = [gridBuf, stepBuf, c2Buf, rhoBuf, etaBuf, ...ring, recBuf, adjBuf, gradBuf, snapBuf, readRec, readGrad];

  const g = new ArrayBuffer(32);
  const gu = new Uint32Array(g);
  const gf = new Float32Array(g);
  gu[0] = grid.nx;
  gu[1] = grid.nz;
  gu[2] = grid.recvRow;
  gu[3] = grid.K;
  gf[4] = grid.dt * grid.dt;
  gf[5] = 1 / (grid.dxn * grid.dxn);
  gu[6] = grid.ntc;
  device.queue.writeBuffer(gridBuf, 0, g);
  device.queue.writeBuffer(etaBuf, 0, plain(grid.eta));

  const module = device.createShaderModule({ code: shaderSource });
  const storage = (type: GPUBufferBindingType): GPUBindGroupLayoutEntry['buffer'] => ({ type });
  const layout0 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: storage('read-only-storage') },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: storage('read-only-storage') },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: storage('read-only-storage') },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: storage('read-only-storage') },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: storage('storage') },
    ],
  });
  const layout1 = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 16 } }],
  });
  const layout2 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: storage('read-only-storage') },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: storage('storage') },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: storage('storage') },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout0, layout1, layout2] });
  const forwardPipe = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'forward_step' } });
  const adjointPipe = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: 'adjoint_step' } });

  const rotations = [0, 1, 2].map(r =>
    device.createBindGroup({
      layout: layout0,
      entries: [
        { binding: 0, resource: { buffer: gridBuf } },
        { binding: 1, resource: { buffer: c2Buf } },
        { binding: 2, resource: { buffer: etaBuf } },
        { binding: 3, resource: { buffer: ring[r % 3] } },
        { binding: 4, resource: { buffer: ring[(r + 1) % 3] } },
        { binding: 5, resource: { buffer: ring[(r + 2) % 3] } },
      ],
    }),
  );
  const stepGroup = device.createBindGroup({ layout: layout1, entries: [{ binding: 0, resource: { buffer: stepBuf, size: 16 } }] });
  const forwardAux = device.createBindGroup({
    layout: layout2,
    entries: [
      { binding: 0, resource: { buffer: rhoBuf } },
      { binding: 1, resource: { buffer: recBuf } },
      { binding: 2, resource: { buffer: snapBuf } },
    ],
  });
  const adjointAux = device.createBindGroup({
    layout: layout2,
    entries: [
      { binding: 0, resource: { buffer: adjBuf } },
      { binding: 1, resource: { buffer: gradBuf } },
      { binding: 2, resource: { buffer: snapBuf } },
    ],
  });

  const wgX = Math.ceil(grid.nx / 8);
  const wgY = Math.ceil(grid.nz / 8);
  const stepData = new ArrayBuffer(grid.steps * STEP_STRIDE);
  const stepF = new Float32Array(stepData);
  const stepI = new Int32Array(stepData);
  const at = (n: number) => (n * STEP_STRIDE) / 4;

  const check = async () => {
    const err = await device.popErrorScope();
    if (err) throw new Error(`WebGPU: ${err.message}`);
    if (lost) throw new Error('WebGPU device was lost');
  };

  const uploadFields = (f: FineFields) => {
    device.queue.writeBuffer(c2Buf, 0, plain(f.c2));
    device.queue.writeBuffer(rhoBuf, 0, plain(f.rho));
  };

  const runForward = async (withSnapshots: boolean): Promise<void> => {
    const { K, ntc, steps, wavelet } = grid;
    for (let n = 0; n < steps - 1; n++) {
      const m = n + 1;
      const o = at(n);
      stepF[o] = wavelet[n];
      stepI[o + 1] = m % K === 0 && m / K < ntc ? m / K : -1;
      let snap = -1;
      if (withSnapshots) {
        const c = Math.round(m / K);
        const off = m - c * K;
        if (c >= 1 && c < ntc && off >= -1 && off <= 1) snap = c * 3 + off + 1;
      }
      stepI[o + 2] = snap;
      stepI[o + 3] = -1;
    }
    device.queue.writeBuffer(stepBuf, 0, stepData, 0, (steps - 1) * STEP_STRIDE);

    device.pushErrorScope('validation');
    const enc = device.createCommandEncoder();
    for (const b of ring) enc.clearBuffer(b);
    enc.clearBuffer(recBuf);
    const pass = enc.beginComputePass();
    pass.setPipeline(forwardPipe);
    pass.setBindGroup(2, forwardAux);
    for (let n = 0; n < steps - 1; n++) {
      pass.setBindGroup(0, rotations[n % 3]);
      pass.setBindGroup(1, stepGroup, [n * STEP_STRIDE]);
      pass.dispatchWorkgroups(wgX, wgY);
    }
    pass.end();
    enc.copyBufferToBuffer(recBuf, 0, readRec, 0, grid.ntc * grid.nx * 4);
    device.queue.submit([enc.finish()]);
    await check();
  };

  const readFloat = async (b: GPUBuffer, length: number) => {
    await b.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(b.getMappedRange(0, length * 4).slice(0));
    b.unmap();
    return out;
  };

  return {
    kind: 'webgpu',
    async forward(fields) {
      uploadFields(fields);
      await runForward(false);
      return readFloat(readRec, grid.ntc * grid.nx);
    },
    async gradient(fields, adjoint) {
      uploadFields(fields);
      await runForward(true);
      device.queue.writeBuffer(adjBuf, 0, plain(adjoint));

      const { K, ntc, steps, wavelet } = grid;
      let j = 0;
      for (let n = steps - 1; n >= 1; n--, j++) {
        const o = at(j);
        stepF[o] = wavelet[n - 1];
        stepI[o + 1] = -1;
        stepI[o + 2] = n % K === 0 && n / K >= 1 && n / K < ntc ? n / K : -1;
        stepI[o + 3] = n % K === 0 && n / K < ntc ? n / K : -1;
      }
      device.queue.writeBuffer(stepBuf, 0, stepData, 0, j * STEP_STRIDE);

      device.pushErrorScope('validation');
      const enc = device.createCommandEncoder();
      for (const b of ring) enc.clearBuffer(b);
      enc.clearBuffer(gradBuf);
      const pass = enc.beginComputePass();
      pass.setPipeline(adjointPipe);
      pass.setBindGroup(2, adjointAux);
      for (let k = 0; k < j; k++) {
        pass.setBindGroup(0, rotations[k % 3]);
        pass.setBindGroup(1, stepGroup, [k * STEP_STRIDE]);
        pass.dispatchWorkgroups(wgX, wgY);
      }
      pass.end();
      enc.copyBufferToBuffer(gradBuf, 0, readGrad, 0, 2 * fieldBytes);
      device.queue.submit([enc.finish()]);
      await check();
      const both = await readFloat(readGrad, 2 * N);
      return { gRho: both.subarray(0, N), gC2: both.subarray(N, 2 * N) };
    },
    dispose() {
      for (const b of all) b.destroy();
      device.destroy();
    },
  };
}
