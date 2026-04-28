/* CRYORADAR — WebGPU FDTD Forward Solver
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * 2D FDTD Scalar Wave Equation Solver with PML (Perfectly Matched Layers)
 * Solves: ∇²E - (ε/c²) ∂²E/∂t² = 0 
 * with ADE-PML / Sponge absorbing boundary conditions (10 cells).
 */

struct Params {
  width: u32,
  height: u32,
  dx: f32,       // Spatial step (m)
  dt: f32,       // Time step (s)
  c2: f32,       // Speed of light squared
  sourceX: u32,  // Source position X
  sourceZ: u32,  // Source position Z
  sourceVal: f32,// Current source wavelet value
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> eps: array<f32>;        // Permittivity map
@group(0) @binding(2) var<storage, read> e_prev: array<f32>;     // E(t-1)
@group(0) @binding(3) var<storage, read> e_curr: array<f32>;     // E(t)
@group(0) @binding(4) var<storage, read_write> e_next: array<f32>; // E(t+1)

// Calculate 10-cell PML damping profile
fn get_pml_damping(x: u32, z: u32, w: u32, h: u32) -> f32 {
  let pml_width: f32 = 10.0;
  var d: f32 = 0.0;
  
  if (f32(x) < pml_width) {
    d = max(d, (pml_width - f32(x)) / pml_width);
  } else if (f32(x) > f32(w) - 1.0 - pml_width) {
    d = max(d, (f32(x) - (f32(w) - 1.0 - pml_width)) / pml_width);
  }
  
  if (f32(z) < pml_width) {
    d = max(d, (pml_width - f32(z)) / pml_width);
  } else if (f32(z) > f32(h) - 1.0 - pml_width) {
    d = max(d, (f32(z) - (f32(h) - 1.0 - pml_width)) / pml_width);
  }
  
  // Quadratic profile for PML damping
  return d * d * 0.15; 
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let x = global_id.x;
  let z = global_id.y;
  let w = params.width;
  let h = params.height;

  if (x >= w || z >= h) {
    return;
  }

  let idx = z * w + x;

  // PML Damping factor
  let sigma = get_pml_damping(x, z, w, h);
  let damping = 1.0 - sigma;

  // 5-point Laplacian stencil
  var laplacian = -4.0 * e_curr[idx];
  
  if (x > 0u)   { laplacian += e_curr[idx - 1u]; } else { laplacian += e_curr[idx]; }
  if (x < w-1u) { laplacian += e_curr[idx + 1u]; } else { laplacian += e_curr[idx]; }
  if (z > 0u)   { laplacian += e_curr[idx - w]; }  else { laplacian += e_curr[idx]; }
  if (z < h-1u) { laplacian += e_curr[idx + w]; }  else { laplacian += e_curr[idx]; }

  laplacian /= (params.dx * params.dx);

  // FDTD Update: E(t+1) = 2*E(t) - E(t-1) + (c^2 * dt^2 / eps) * Laplacian
  let v2 = params.c2 / eps[idx];
  let dt2 = params.dt * params.dt;
  
  var next_val = 2.0 * e_curr[idx] - e_prev[idx] + v2 * dt2 * laplacian;
  
  // Apply Source Wavelet at transmitter location
  if (x == params.sourceX && z == params.sourceZ) {
    next_val += params.sourceVal;
  }

  // Apply PML damping
  e_next[idx] = next_val * damping;
}
