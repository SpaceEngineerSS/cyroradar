/* CRYORADAR — WebGPU FWI Adjoint & Gradient Solver
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Adjoint-State time-reversal backward propagation.
 * Residual energy is injected at receiver locations and propagated
 * backward through the domain. Gradient is accumulated.
 * Ref: Tarantola (1984), Virieux & Operto (2009).
 */

struct Params {
  width: u32,
  height: u32,
  dx: f32,
  dt: f32,
  c2: f32,
  rxX: u32,       // Receiver position X
  rxZ: u32,       // Receiver position Z
  residual: f32,  // Difference between synthetic and real data
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> eps: array<f32>;        // Permittivity map
@group(0) @binding(2) var<storage, read> lambda_next: array<f32>;// λ(t+1) (Backward in time)
@group(0) @binding(3) var<storage, read> lambda_curr: array<f32>;// λ(t)
@group(0) @binding(4) var<storage, read_write> lambda_prev: array<f32>;// λ(t-1)
@group(0) @binding(5) var<storage, read> e_fwd: array<f32>;      // Forward wavefield E(t)
@group(0) @binding(6) var<storage, read_write> gradient: array<f32>; // Accumulated gradient ∇ε

fn get_pml_damping(x: u32, z: u32, w: u32, h: u32) -> f32 {
  let pml_width: f32 = 10.0;
  var d: f32 = 0.0;
  if (f32(x) < pml_width) { d = max(d, (pml_width - f32(x)) / pml_width); }
  else if (f32(x) > f32(w) - 1.0 - pml_width) { d = max(d, (f32(x) - (f32(w) - 1.0 - pml_width)) / pml_width); }
  if (f32(z) < pml_width) { d = max(d, (pml_width - f32(z)) / pml_width); }
  else if (f32(z) > f32(h) - 1.0 - pml_width) { d = max(d, (f32(z) - (f32(h) - 1.0 - pml_width)) / pml_width); }
  return d * d * 0.15; 
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let x = global_id.x;
  let z = global_id.y;
  let w = params.width;
  let h = params.height;

  if (x >= w || z >= h) { return; }

  let idx = z * w + x;
  let sigma = get_pml_damping(x, z, w, h);
  let damping = 1.0 - sigma;

  // Laplacian for Adjoint Wavefield
  var laplacian = -4.0 * lambda_curr[idx];
  if (x > 0u)   { laplacian += lambda_curr[idx - 1u]; } else { laplacian += lambda_curr[idx]; }
  if (x < w-1u) { laplacian += lambda_curr[idx + 1u]; } else { laplacian += lambda_curr[idx]; }
  if (z > 0u)   { laplacian += lambda_curr[idx - w]; }  else { laplacian += lambda_curr[idx]; }
  if (z < h-1u) { laplacian += lambda_curr[idx + w]; }  else { laplacian += lambda_curr[idx]; }
  laplacian /= (params.dx * params.dx);

  let v2 = params.c2 / eps[idx];
  let dt2 = params.dt * params.dt;
  
  // Backward propagation step (Adjoint equation)
  var prev_val = 2.0 * lambda_curr[idx] - lambda_next[idx] + v2 * dt2 * laplacian;
  
  // Inject residual as source at receiver
  if (x == params.rxX && z == params.rxZ) {
    prev_val += params.residual;
  }

  lambda_prev[idx] = prev_val * damping;

  // Cross-correlation imaging condition (Gradient accumulation)
  // ∇ε = - ∫ λ(t) * (∂²E/∂t²) dt
  // We approximate ∂²E/∂t² with E_fwd (assuming slowly varying envelope)
  // To avoid huge buffers, we correlate λ_curr with E_fwd(t) stored via synchronous buffer read/writes.
  
  let grad_contrib = lambda_curr[idx] * e_fwd[idx] * params.dt;
  gradient[idx] += grad_contrib;
}
