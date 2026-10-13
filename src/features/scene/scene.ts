/* Three.js scene: the radargram hung as a curtain below the surface profile.
 *
 * Each curtain column starts at that trace's surface echo and goes down, and
 * its vertical position comes from the depth conversion, so the curtain
 * follows the topography the way the subsurface does. The ribbon on top is
 * the measured surface profile only (no invented cross-track relief), coloured
 * by along-track slope as a rough guide to where clutter is likely.
 * Contrast and colour table are shader uniforms. Rendering happens on demand. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CryoDataset, AnomalyResult, ColormapId } from '../../types/types';
import { getColormap } from '../../core/colormaps/colormaps';
import { timeToDepth, type VelocityLayer } from '../../core/physics/depth-conversion';
import { surfaceSlopesDeg } from '../../core/analysis/anomaly-detector';

const TRACK_LEN = 4;

const CURTAIN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const CURTAIN_FRAG = /* glsl */ `
  uniform sampler2D uData;
  uniform sampler2D uLut;
  uniform vec2 uRange;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float v = texture2D(uData, vUv).r;
    float t = clamp((v - uRange.x) / max(1e-4, uRange.y - uRange.x), 0.0, 1.0);
    vec3 c = texture2D(uLut, vec2(t * 0.99609 + 0.00195, 0.5)).rgb;
    gl_FragColor = vec4(c, uOpacity);
  }`;

export interface SceneOptions {
  segments: number;
  model: VelocityLayer[];
  bulkPermittivity: number;
}

export interface CryoScene {
  setColormap(id: ColormapId): void;
  /** Contrast as fractions of the dB range. */
  setContrast(lo: number, hi: number): void;
  setDetections(anomalies: AnomalyResult[]): void;
  setPinned(trace: number | null): void;
  resize(w: number, h: number, dpr: number): void;
  render(): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement, ds: CryoDataset, opt: SceneOptions, bg: string): CryoScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setClearColor(new THREE.Color(bg), 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.set(2.6, 1.7, 3.6);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.target.set(0, -0.35, 0);
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.minDistance = 1;
  controls.maxDistance = 12;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1df, 1.1);
  sun.position.set(-3, 5, 2);
  scene.add(sun);

  const { radargram: r, geometry: g, surfaceEcho } = ds;
  const W = r.width;
  const H = r.height;

  // Depth of the deepest sample under the median surface sets the vertical scale.
  const surf = surfaceEcho.indices;
  const median = Array.from(surf).sort((a, b) => a - b)[Math.floor(W / 2)];
  const maxDepth = Math.max(10, timeToDepth((H - median) * r.sampleInterval, opt.model, opt.bulkPermittivity));
  const elev = g.surfaceElevation;
  let eMin = Infinity;
  let eMax = -Infinity;
  for (const e of elev) {
    eMin = Math.min(eMin, e);
    eMax = Math.max(eMax, e);
  }
  const vScale = 1.2 / Math.max(maxDepth, eMax - eMin);
  const eMid = (eMin + eMax) / 2;
  const X = (t: number) => (t / (W - 1) - 0.5) * TRACK_LEN;
  const Ysurf = (t: number) => (elev[t] - eMid) * vScale;

  /* Curtain ----------------------------------------------------------------- */
  const tex8 = new Uint8Array(W * H);
  const span = r.powerMax - r.powerMin || 1;
  for (let i = 0; i < tex8.length; i++) tex8[i] = Math.max(0, Math.min(255, Math.round(((r.data[i] - r.powerMin) / span) * 255)));
  const dataTex = new THREE.DataTexture(tex8, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  dataTex.minFilter = THREE.LinearFilter;
  dataTex.magFilter = THREE.LinearFilter;
  dataTex.flipY = false;
  dataTex.needsUpdate = true;
  const lutTex = new THREE.DataTexture(new Uint8Array(getColormap('grayscale').rgba), 256, 1, THREE.RGBAFormat);
  lutTex.minFilter = THREE.LinearFilter;
  lutTex.magFilter = THREE.LinearFilter;
  lutTex.needsUpdate = true;

  const cols = Math.min(W, opt.segments);
  const rows = 96;
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uv = new Float32Array((cols + 1) * (rows + 1) * 2);
  const index: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const t = Math.round((c / cols) * (W - 1));
    const s0 = surf[t];
    for (let k = 0; k <= rows; k++) {
      const row = s0 + ((H - s0) * k) / rows;
      const depth = timeToDepth((row - s0) * r.sampleInterval, opt.model, opt.bulkPermittivity);
      const i = c * (rows + 1) + k;
      pos.set([X(t), Ysurf(t) - depth * vScale, 0], i * 3);
      uv.set([(t + 0.5) / W, (row + 0.5) / H], i * 2);
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let k = 0; k < rows; k++) {
      const a = c * (rows + 1) + k;
      const b = a + rows + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const curtainGeo = new THREE.BufferGeometry();
  curtainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  curtainGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  curtainGeo.setIndex(index);
  const curtainMat = new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VERT,
    fragmentShader: CURTAIN_FRAG,
    uniforms: { uData: { value: dataTex }, uLut: { value: lutTex }, uRange: { value: new THREE.Vector2(0.3, 1) }, uOpacity: { value: 1 } },
    side: THREE.DoubleSide,
  });
  const curtain = new THREE.Mesh(curtainGeo, curtainMat);
  scene.add(curtain);

  /* Surface ribbon coloured by slope ---------------------------------------- */
  const slopes = surfaceSlopesDeg(elev, W, r.traceSpacingM);
  const ribbonPos = new Float32Array((cols + 1) * 2 * 3);
  const ribbonCol = new Float32Array((cols + 1) * 2 * 3);
  const flat = new THREE.Color('#8a8276');
  const steep = new THREE.Color('#d9692f');
  const tmp = new THREE.Color();
  const ribbonIdx: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const t = Math.round((c / cols) * (W - 1));
    const y = Ysurf(t) + 0.002;
    ribbonPos.set([X(t), y, -0.18, X(t), y, 0.18], c * 6);
    tmp.copy(flat).lerp(steep, Math.min(1, slopes[t] / 3));
    ribbonCol.set([tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b], c * 6);
    if (c < cols) {
      const a = c * 2;
      ribbonIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
  ribbonGeo.setAttribute('color', new THREE.BufferAttribute(ribbonCol, 3));
  ribbonGeo.setIndex(ribbonIdx);
  ribbonGeo.computeVertexNormals();
  const ribbonMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(ribbonGeo, ribbonMat));

  /* Reference grid under the scene ------------------------------------------ */
  const grid = new THREE.GridHelper(TRACK_LEN * 1.25, 10, 0x433e37, 0x2c2925);
  grid.position.y = -1.6;
  scene.add(grid);

  /* Detections and pinned trace -------------------------------------------- */
  const markGeo = new THREE.BufferGeometry();
  const markMat = new THREE.PointsMaterial({ color: 0x7fb0de, size: 5, sizeAttenuation: false });
  const marks = new THREE.Points(markGeo, markMat);
  marks.position.z = 0.003;
  scene.add(marks);
  const pinGeo = new THREE.BufferGeometry();
  const pinMat = new THREE.LineBasicMaterial({ color: 0xe2a43b });
  const pin = new THREE.Line(pinGeo, pinMat);
  pin.position.z = 0.004;
  scene.add(pin);

  const rowToY = (t: number, row: number) => Ysurf(t) - timeToDepth((row - surf[t]) * r.sampleInterval, opt.model, opt.bulkPermittivity) * vScale;

  let frame = 0;
  const render = () => {
    frame = 0;
    renderer.render(scene, camera);
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener('change', request);

  return {
    setColormap(id) {
      (lutTex.image.data as Uint8Array).set(getColormap(id).rgba);
      lutTex.needsUpdate = true;
      request();
    },
    setContrast(lo, hi) {
      curtainMat.uniforms.uRange.value.set(lo, hi);
      request();
    },
    setDetections(anomalies) {
      const p = new Float32Array(anomalies.length * 3);
      anomalies.forEach((a, i) => p.set([X(a.traceIndex), rowToY(a.traceIndex, a.sampleIndex), 0], i * 3));
      markGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      markGeo.computeBoundingSphere();
      request();
    },
    setPinned(t) {
      pin.visible = t != null;
      if (t != null) {
        pinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([X(t), Ysurf(t) + 0.05, 0, X(t), rowToY(t, H - 1), 0]), 3));
        pinGeo.computeBoundingSphere();
      }
      request();
    },
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      request();
    },
    render: request,
    dispose() {
      cancelAnimationFrame(frame);
      controls.removeEventListener('change', request);
      controls.dispose();
      for (const o of [curtainGeo, curtainMat, dataTex, lutTex, ribbonGeo, ribbonMat, markGeo, markMat, pinGeo, pinMat]) o.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}
