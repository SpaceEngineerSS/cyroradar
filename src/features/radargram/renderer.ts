/* Radargram image renderer.
 *
 * WebGL2 path: the dB field is a half-float texture, the colour table a
 * 256 × 1 texture, and pan, zoom, contrast and per-trace static shifts are
 * uniforms. Changing any of them costs one draw call.
 *
 * Canvas 2D path (no WebGL2, or a field larger than the GPU's texture limit):
 * the field is colourised once into an offscreen bitmap with a packed lookup
 * table, then scaled with drawImage on pan and zoom. */

import { getColormap } from '../../core/colormaps/colormaps';
import { colorIndex } from '../../core/colormaps/colormaps';
import type { ColormapId } from '../../types/types';
import type { DisplayField } from '../../store/derived';
import type { Viewport } from '../../store/viewport';

export interface RadargramRenderer {
  readonly kind: 'webgl2' | 'canvas2d';
  setField(field: DisplayField): void;
  setColormap(id: ColormapId): void;
  /** Absolute dB values mapped to the ends of the colour table. */
  setRange(lo: number, hi: number): void;
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  draw(v: Viewport): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_data;
uniform sampler2D u_lut;
uniform sampler2D u_shift;
uniform vec2 u_offset;
uniform vec2 u_scale;
uniform float u_canvasH;
uniform vec2 u_size;
uniform vec2 u_range;
uniform bool u_useShift;
uniform vec3 u_bg;
out vec4 o;
void main() {
  vec2 px = vec2(gl_FragCoord.x, u_canvasH - gl_FragCoord.y);
  vec2 d = (px - u_offset) / u_scale;
  if (d.x < 0.0 || d.y < 0.0 || d.x >= u_size.x || d.y >= u_size.y) { o = vec4(u_bg, 1.0); return; }
  float shift = u_useShift ? texelFetch(u_shift, ivec2(int(d.x), 0), 0).r : 0.0;
  float row = d.y + shift;
  float t = 0.0;
  if (row >= 0.0 && row < u_size.y) {
    float v = texture(u_data, vec2(d.x / u_size.x, row / u_size.y)).r;
    t = clamp((v - u_range.x) / max(1e-6, u_range.y - u_range.x), 0.0, 1.0);
  }
  o = texture(u_lut, vec2((t * 255.0 + 0.5) / 256.0, 0.5));
}`;

function cssColor(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#080807';
  const n = parseInt(v.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed');
  return s;
}

function createWebGL(canvas: HTMLCanvasElement): RadargramRenderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
  } catch (err) {
    console.warn('[CryoRadar] WebGL2 radargram renderer unavailable, using Canvas 2D.', err);
    return null;
  }

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (n: string) => gl.getUniformLocation(program, n);
  const U = {
    data: u('u_data'), lut: u('u_lut'), shift: u('u_shift'), offset: u('u_offset'), scale: u('u_scale'), canvasH: u('u_canvasH'),
    size: u('u_size'), range: u('u_range'), useShift: u('u_useShift'), bg: u('u_bg'),
  };

  const makeTex = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  };
  const dataTex = makeTex();
  const lutTex = makeTex();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const shiftTex = makeTex();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  let size: [number, number] = [1, 1];
  let range: [number, number] = [0, 1];
  let useShift = false;
  let bg = cssColor('--c-plot-bg');
  let cssH = 1;
  let dpr = 1;
  let ok = true;

  return {
    kind: 'webgl2',
    setField(f) {
      if (f.width > maxTex || f.height > maxTex) {
        ok = false;
        return;
      }
      ok = true;
      size = [f.width, f.height];
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, dataTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, f.width, f.height, 0, gl.RED, gl.FLOAT, f.data);
      useShift = !!f.shifts;
      if (f.shifts) {
        const s = new Float32Array(f.width);
        for (let i = 0; i < f.width; i++) s[i] = f.shifts[i] ?? 0;
        gl.bindTexture(gl.TEXTURE_2D, shiftTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, f.width, 1, 0, gl.RED, gl.FLOAT, s);
      }
    },
    setColormap(id) {
      gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, getColormap(id).rgba);
      bg = cssColor('--c-plot-bg');
    },
    setRange(lo, hi) {
      range = [lo, hi];
    },
    resize(w, h, ratio) {
      dpr = ratio;
      cssH = h;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(v) {
      if (!ok) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dataTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, shiftTex);
      gl.uniform1i(U.data, 0);
      gl.uniform1i(U.lut, 1);
      gl.uniform1i(U.shift, 2);
      gl.uniform2f(U.offset, v.offsetX * dpr, v.offsetY * dpr);
      gl.uniform2f(U.scale, v.scaleX * dpr, v.scaleY * dpr);
      gl.uniform1f(U.canvasH, cssH * dpr);
      gl.uniform2f(U.size, size[0], size[1]);
      gl.uniform2f(U.range, range[0], range[1]);
      gl.uniform1i(U.useShift, useShift ? 1 : 0);
      gl.uniform3f(U.bg, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteTexture(dataTex);
      gl.deleteTexture(lutTex);
      gl.deleteTexture(shiftTex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      // No loseContext(): the canvas may be reused by the next mount (StrictMode
      // mounts twice), and a lost context cannot be recovered on the same canvas.
    },
  };
}

function create2D(canvas: HTMLCanvasElement): RadargramRenderer {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const bitmap = document.createElement('canvas');
  const bctx = bitmap.getContext('2d')!;
  let field: DisplayField | null = null;
  let colormap: ColormapId = 'grayscale';
  let range: [number, number] = [0, 1];
  let dirty = true;
  let dpr = 1;
  let bg = getComputedStyle(document.documentElement).getPropertyValue('--c-plot-bg').trim() || '#080807';

  const paint = () => {
    if (!field) return;
    const { width: W, height: H, data, shifts } = field;
    bitmap.width = W;
    bitmap.height = H;
    const img = bctx.createImageData(W, H);
    const px = new Uint32Array(img.data.buffer);
    const lut = getColormap(colormap).packed;
    const [lo, hi] = range;
    for (let t = 0; t < W; t++) {
      const s0 = shifts ? shifts[t] : 0;
      for (let r = 0; r < H; r++) {
        const src = r + s0;
        px[r * W + t] = lut[src >= 0 && src < H ? colorIndex(data[src * W + t], lo, hi) : 0];
      }
    }
    bctx.putImageData(img, 0, 0);
    dirty = false;
  };

  return {
    kind: 'canvas2d',
    setField(f) {
      field = f;
      dirty = true;
    },
    setColormap(id) {
      colormap = id;
      bg = getComputedStyle(document.documentElement).getPropertyValue('--c-plot-bg').trim() || bg;
      dirty = true;
    },
    setRange(lo, hi) {
      range = [lo, hi];
      dirty = true;
    },
    resize(w, h, ratio) {
      dpr = ratio;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    },
    draw(v) {
      if (dirty) paint();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!field) return;
      ctx.imageSmoothingEnabled = v.scaleX < 1 || v.scaleY < 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(bitmap, v.offsetX, v.offsetY, field.width * v.scaleX, field.height * v.scaleY);
    },
    dispose() {
      bitmap.width = bitmap.height = 0;
    },
  };
}

/**
 * A canvas keeps the first kind of context it hands out, so if the WebGL path
 * fails after creating a context, the 2D renderer gets a fresh canvas that
 * takes the old one's place in the DOM.
 */
export function createRenderer(canvas: HTMLCanvasElement, field: DisplayField | null): { renderer: RadargramRenderer; canvas: HTMLCanvasElement } {
  const tooLarge = field && (field.width > 8192 || field.height > 8192);
  if (!tooLarge) {
    const gl = createWebGL(canvas);
    if (gl) return { renderer: gl, canvas };
  }
  let target = canvas;
  if (!canvas.getContext('2d')) {
    target = document.createElement('canvas');
    target.className = canvas.className;
    canvas.replaceWith(target);
  }
  return { renderer: create2D(target), canvas: target };
}
