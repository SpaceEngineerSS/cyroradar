// Scalar-wave time stepping for the envelope FWI (see fwi/model.ts).
// Same scheme as the CPU backend:
//   next = (2·curr − (1 − η)·prev + dt²·s²·(∇²curr + src)) / (1 + η)
// forward_step advances u and records receivers / snapshots.
// adjoint_step advances λ backwards and accumulates both gradients.

struct Grid {
  nx: u32,
  nz: u32,
  recvRow: u32,
  K: u32,
  dt2: f32,
  ix2: f32,
  ntc: u32,
  pad0: u32,
};

struct Step {
  w: f32,       // wavelet sample paired with this step
  record: i32,  // receiver row to write (forward) / −1
  snap: i32,    // snapshot slot (forward) or coarse sample for gradient (adjoint) / −1
  inject: i32,  // adjoint source row / −1
};

@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> c2: array<f32>;
@group(0) @binding(2) var<storage, read> eta: array<f32>;
@group(0) @binding(3) var<storage, read> prev: array<f32>;
@group(0) @binding(4) var<storage, read> curr: array<f32>;
@group(0) @binding(5) var<storage, read_write> next: array<f32>;

@group(1) @binding(0) var<uniform> stepp: Step;

// forward: aux0 = rho, aux1 = receivers, aux2 = snapshots
// adjoint: aux0 = adjoint source, aux1 = gradients (gRho then gC2), aux2 = snapshots
@group(2) @binding(0) var<storage, read> aux0: array<f32>;
@group(2) @binding(1) var<storage, read_write> aux1: array<f32>;
@group(2) @binding(2) var<storage, read_write> aux2: array<f32>;

fn laplacian(x: u32, z: u32, i: u32) -> f32 {
  let u = curr[i];
  var l = u;
  var r = u;
  var up = 0.0;
  var dn = 0.0;
  if (x > 0u) { l = curr[i - 1u]; }
  if (x + 1u < grid.nx) { r = curr[i + 1u]; }
  if (z > 0u) { up = curr[i - grid.nx]; }
  if (z + 1u < grid.nz) { dn = curr[i + grid.nx]; }
  return (l + r - 2.0 * u) * grid.ix2 + (up + dn - 2.0 * u);
}

@compute @workgroup_size(8, 8)
fn forward_step(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let z = id.y;
  if (x >= grid.nx || z >= grid.nz) { return; }
  let i = z * grid.nx + x;
  let f = aux0[i] * stepp.w;
  let e = eta[i];
  let v = (2.0 * curr[i] - (1.0 - e) * prev[i] + grid.dt2 * c2[i] * (laplacian(x, z, i) + f)) / (1.0 + e);
  next[i] = v;
  if (stepp.record >= 0 && z == grid.recvRow) {
    aux1[u32(stepp.record) * grid.nx + x] = v;
  }
  if (stepp.snap >= 0) {
    aux2[u32(stepp.snap) * grid.nx * grid.nz + i] = v;
  }
}

@compute @workgroup_size(8, 8)
fn adjoint_step(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let z = id.y;
  if (x >= grid.nx || z >= grid.nz) { return; }
  let i = z * grid.nx + x;
  let n = grid.nx * grid.nz;
  var src = 0.0;
  if (stepp.inject >= 0 && z == grid.recvRow) {
    src = aux0[u32(stepp.inject) * grid.nx + x] / (grid.dt2 * c2[i]);
  }
  let e = eta[i];
  let lam = curr[i];
  next[i] = (2.0 * lam - (1.0 - e) * prev[i] + grid.dt2 * c2[i] * (laplacian(x, z, i) + src)) / (1.0 + e);

  aux1[i] = aux1[i] + lam * stepp.w * grid.dt2 * c2[i];
  if (stepp.snap >= 1) {
    let b = u32(stepp.snap) * 3u * n;
    let d2 = aux2[b + 2u * n + i] - 2.0 * aux2[b + n + i] + aux2[b + i];
    aux1[n + i] = aux1[n + i] + f32(grid.K) * lam * d2 / c2[i];
  }
}
