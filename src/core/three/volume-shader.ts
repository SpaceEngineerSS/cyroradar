/* CRYORADAR — Volumetric Ray Marching Shader (v7.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * GLSL shaders for volumetric rendering of subsurface 3D data.
 * Uses front-to-back ray marching through a Data3DTexture with
 * adaptive step size for 60 FPS performance. */

export const volumeVertexShader = /* glsl */`
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0));
    vDirection = position - vOrigin;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const volumeFragmentShader = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D u_data;
  uniform float u_threshold;
  uniform float u_opacity;
  uniform float u_steps;
  uniform vec3 u_colorLow;
  uniform vec3 u_colorMid;
  uniform vec3 u_colorHigh;

  varying vec3 vOrigin;
  varying vec3 vDirection;

  vec2 hitBox(vec3 orig, vec3 dir) {
    vec3 box_min = vec3(-0.5);
    vec3 box_max = vec3(0.5);
    vec3 inv_dir = 1.0 / dir;
    vec3 tmin_tmp = (box_min - orig) * inv_dir;
    vec3 tmax_tmp = (box_max - orig) * inv_dir;
    vec3 tmin = min(tmin_tmp, tmax_tmp);
    vec3 tmax = max(tmin_tmp, tmax_tmp);
    float t0 = max(tmin.x, max(tmin.y, tmin.z));
    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
  }

  vec4 transferFunction(float value) {
    float v = clamp(value, 0.0, 1.0);
    vec3 color;
    if (v < 0.4) {
      color = mix(u_colorLow, u_colorMid, v / 0.4);
    } else {
      color = mix(u_colorMid, u_colorHigh, (v - 0.4) / 0.6);
    }
    float alpha = smoothstep(u_threshold, u_threshold + 0.1, v) * u_opacity;
    return vec4(color, alpha);
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 bounds = hitBox(vOrigin, rayDir);

    if (bounds.x > bounds.y) discard;

    bounds.x = max(bounds.x, 0.0);
    float stepSize = 1.732 / u_steps;

    vec4 accumulated = vec4(0.0);

    for (float t = bounds.x; t < bounds.y; t += stepSize) {
      vec3 pos = vOrigin + t * rayDir + 0.5;

      if (pos.x < 0.0 || pos.x > 1.0 ||
          pos.y < 0.0 || pos.y > 1.0 ||
          pos.z < 0.0 || pos.z > 1.0) continue;

      float density = texture(u_data, pos).r;
      vec4 sampleColor = transferFunction(density);

      accumulated.rgb += (1.0 - accumulated.a) * sampleColor.a * sampleColor.rgb;
      accumulated.a += (1.0 - accumulated.a) * sampleColor.a;

      if (accumulated.a > 0.99) break;
    }

    if (accumulated.a < 0.01) discard;

    gl_FragColor = accumulated;
  }
`;
