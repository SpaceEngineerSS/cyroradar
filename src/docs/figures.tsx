/* Figures for the documentation. Drawn as SVG so they follow the theme, and
 * where a figure shows a physical relation it is computed with the same code
 * the app uses, so the pictures cannot drift from the maths. */

import type { ReactNode } from 'react';
import { fresnelReflection } from '../core/physics/fresnel';
import { lossDbPerMeter } from '../core/physics/attenuation';
import { sceneModels } from '../core/pipeline/synthetic-generator';
import { getAllColormaps, colormapCss } from '../core/colormaps/colormaps';
import { getMaterial } from '../core/physics/dielectric';

const INK = 'var(--c-ink)';
const DIM = 'var(--c-dim)';
const FAINT = 'var(--c-faint)';
const LINE = 'var(--c-line-strong)';
const ACCENT = 'var(--c-accent)';
const WATER = 'var(--c-water)';
const MONO = 'var(--font-mono)';

export function Figure({ children, caption, wide }: { children: ReactNode; caption: ReactNode; wide?: boolean }) {
  return (
    <figure className={`doc-figure my-8 ${wide ? 'lg:-mr-24' : ''}`}>
      <div className="border border-line bg-raised p-4">{children}</div>
      <figcaption className="mt-2 text-xs text-dim">{caption}</figcaption>
    </figure>
  );
}

function T({ x, y, children, anchor = 'start', color = FAINT, size = 10.5 }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; color?: string; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={size} fill={color}>
      {children}
    </text>
  );
}

/* Sounding geometry -------------------------------------------------------- */

export function SoundingGeometry() {
  return (
    <svg viewBox="0 0 640 300" className="h-auto w-full" role="img" aria-label="Orbiter sounding layered ice; nadir echo and an off-nadir clutter path">
      <g stroke={INK} strokeWidth={1.25} fill="none">
        <rect x={300} y={14} width={40} height={16} />
        <path d="M268 22h32M340 22h32" />
      </g>
      <T x={384} y={26} color={DIM}>orbiter, 300–800 km up</T>
      {/* nadir ray with refraction kept vertical */}
      <path d="M320 30V250" stroke={ACCENT} strokeWidth={1.5} />
      <path d="M314 120l6 10 6-10" stroke={ACCENT} fill="none" strokeWidth={1.25} />
      {/* off-nadir path to a hill */}
      <path d="M320 30 520 132" stroke={FAINT} strokeDasharray="4 4" />
      <T x={440} y={92}>off-nadir path to a slope</T>
      {/* surface with a hill */}
      <path d="M20 150C160 146 260 152 400 150S500 116 560 130 620 150 630 150" stroke={INK} strokeWidth={1.25} fill="none" />
      <T x={24} y={142}>surface: vacuum → ice, first echo</T>
      {/* layers */}
      <path d="M20 150C160 146 260 152 400 150S500 116 560 130 620 150 630 150V290H20Z" fill="var(--c-sunken)" opacity={0.7} />
      <path d="M20 190c150-6 400 6 610-2" stroke={LINE} fill="none" />
      <path d="M20 214c180 5 420-5 610 1" stroke={LINE} fill="none" />
      <T x={24} y={184}>dust-rich ice packet, weak echo</T>
      <path d="M20 250h610" stroke={INK} strokeWidth={1.25} />
      <path d="M260 250h120" stroke={WATER} strokeWidth={4} />
      <T x={24} y={244}>base of the ice</T>
      <T x={392} y={268} color={WATER}>bright if the base is wet</T>
      <T x={330} y={200} color={DIM}>travel at c/√ε</T>
    </svg>
  );
}

/* Time to depth ------------------------------------------------------------ */

export function TimeToDepth() {
  const layers = [
    { label: 'cover', eps: 4.2, d: 20 },
    { label: 'ice', eps: 3.0, d: 60 },
    { label: 'rock', eps: 6.5, d: 0 },
  ];
  const c = 299.792458; // m/µs
  let t = 0;
  let z = 0;
  const marks: { t: number; z: number; label: string }[] = [{ t: 0, z: 0, label: 'surface' }];
  for (const l of layers.slice(0, -1)) {
    t += (2 * l.d * Math.sqrt(l.eps)) / c;
    z += l.d;
    marks.push({ t, z, label: `base of ${l.label}` });
  }
  const tMax = t * 1.25;
  const zMax = z * 1.25;
  const ty = (v: number) => 40 + (v / tMax) * 220;
  const zy = (v: number) => 40 + (v / zMax) * 220;
  return (
    <svg viewBox="0 0 640 290" className="h-auto w-full" role="img" aria-label="Echo delays mapped to depths through a three-layer model">
      <T x={70} y={24} color={DIM}>round-trip delay</T>
      <T x={430} y={24} color={DIM}>depth</T>
      <path d={`M120 40V260M460 40V260`} stroke={LINE} />
      {marks.map(m => (
        <g key={m.label}>
          <path d={`M112 ${ty(m.t)}h16M452 ${zy(m.z)}h16`} stroke={INK} />
          <path d={`M128 ${ty(m.t)}C 300 ${ty(m.t)}, 290 ${zy(m.z)}, 452 ${zy(m.z)}`} stroke={FAINT} strokeDasharray="3 3" fill="none" />
          <T x={104} y={ty(m.t) + 4} anchor="end" color={INK}>{m.t.toFixed(2)} µs</T>
          <T x={476} y={zy(m.z) + 4} color={INK}>{m.z} m</T>
          <T x={530} y={zy(m.z) + 4}>{m.label}</T>
        </g>
      ))}
      {layers.slice(0, -1).map((l, i) => (
        <T key={l.label} x={300} y={(ty(marks[i].t) + ty(marks[i + 1].t)) / 2 + 26} anchor="middle" color={ACCENT}>
          ε = {l.eps}: {((2 * Math.sqrt(l.eps)) / c * 1000).toFixed(1)} ns per metre
        </T>
      ))}
    </svg>
  );
}

/* Fresnel ------------------------------------------------------------------ */

export function FresnelCurves() {
  const W = 600;
  const H = 260;
  const x = (eps: number) => 50 + (Math.log(eps) / Math.log(100)) * (W - 70);
  const y = (db: number) => 20 + ((-db) / 30) * (H - 50);
  const curve = (above: number) =>
    Array.from({ length: 200 }, (_, i) => {
      const eps = Math.exp((i / 199) * Math.log(100)) || 1;
      const r = fresnelReflection(above, Math.max(1, eps)).reflectionDb;
      return `${i ? 'L' : 'M'}${x(Math.max(1, eps)).toFixed(1)} ${y(Math.max(-30, r)).toFixed(1)}`;
    }).join('');
  const bands: [number, number, string][] = [[6, 15, 'hydrated'], [15, 25, 'wet'], [25, 100, 'water / brine']];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Power reflectivity against permittivity of the lower medium">
      {bands.map(([a, b, label]) => (
        <g key={label}>
          <rect x={x(a)} y={20} width={x(b) - x(a)} height={H - 50} fill={label.startsWith('water') ? WATER : FAINT} opacity={0.08} />
          <T x={(x(a) + x(b)) / 2} y={34} anchor="middle">{label}</T>
        </g>
      ))}
      {[0, -5, -10, -15, -20, -25, -30].map(d => (
        <g key={d}>
          <path d={`M50 ${y(d)}H${W - 20}`} stroke="var(--c-line)" />
          <T x={44} y={y(d) + 4} anchor="end">{d}</T>
        </g>
      ))}
      {[1, 2, 3, 6, 10, 15, 25, 40, 100].map(e => (
        <T key={e} x={x(e)} y={H - 12} anchor="middle">{e}</T>
      ))}
      <T x={W - 20} y={H - 26} anchor="end" color={DIM}>ε of the lower medium</T>
      <T x={8} y={14} color={DIM}>R, dB</T>
      <path d={curve(1)} stroke={INK} fill="none" strokeWidth={1.5} />
      <path d={curve(3.15)} stroke={ACCENT} fill="none" strokeWidth={1.5} />
      <T x={x(4.5)} y={y(fresnelReflection(1, 4.5).reflectionDb) - 8} color={INK}>from vacuum (surface)</T>
      <T x={x(30)} y={y(fresnelReflection(3.15, 30).reflectionDb) + 18} color={ACCENT}>from ice, ε 3.15 (base)</T>
    </svg>
  );
}

/* Attenuation -------------------------------------------------------------- */

export function AttenuationCurves() {
  const W = 600;
  const H = 240;
  const maxDepth = 3000;
  const cases = [
    { f: 20e6, eps: 3.15, tan: 5e-4, label: 'SHARAD, clean cold ice' },
    { f: 20e6, eps: 3.4, tan: 4e-3, label: 'SHARAD, dusty ice' },
    { f: 4e6, eps: 3.4, tan: 4e-3, label: 'MARSIS, dusty ice' },
    { f: 20e6, eps: 6, tan: 1e-2, label: 'SHARAD, regolith' },
  ];
  const maxLoss = 80;
  const x = (d: number) => 50 + (d / maxDepth) * (W - 70);
  const y = (l: number) => 16 + (Math.min(maxLoss, l) / maxLoss) * (H - 46);
  const colors = [INK, ACCENT, WATER, FAINT];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Two-way loss against depth for four media">
      {[0, 20, 40, 60, 80].map(l => (
        <g key={l}>
          <path d={`M50 ${y(l)}H${W - 20}`} stroke="var(--c-line)" />
          <T x={44} y={y(l) + 4} anchor="end">{l}</T>
        </g>
      ))}
      {[0, 1000, 2000, 3000].map(d => (
        <T key={d} x={x(d)} y={H - 12} anchor="middle">{d / 1000} km</T>
      ))}
      <T x={8} y={12} color={DIM}>two-way loss, dB</T>
      {cases.map((c, i) => {
        const a = 2 * lossDbPerMeter(c.f, c.eps, c.tan);
        const end = Math.min(maxDepth, maxLoss / a);
        return <path key={c.label} d={`M${x(0)} ${y(0)}L${x(end)} ${y(a * end)}`} stroke={colors[i]} strokeWidth={1.5} />;
      })}
      {/* Legend in the empty lower-right corner, away from the lines. */}
      {cases.map((c, i) => {
        const a = 2 * lossDbPerMeter(c.f, c.eps, c.tan);
        const ly = H - 120 + i * 18;
        return (
          <g key={`l-${c.label}`}>
            <path d={`M${W - 250} ${ly - 4}h18`} stroke={colors[i]} strokeWidth={2} />
            <T x={W - 226} y={ly} color={colors[i]}>{c.label}, {(a * 1000).toFixed(1)} dB/km</T>
          </g>
        );
      })}
    </svg>
  );
}

/* Detection chain ---------------------------------------------------------- */

function Box({ x, y, w, h = 40, title, sub, accent }: { x: number; y: number; w: number; h?: number; title: string; sub?: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--c-sunken)" stroke={accent ? ACCENT : LINE} />
      <text x={x + 10} y={y + (sub ? 17 : 24)} fontSize={12} fill={INK} fontFamily="var(--font-sans)" fontWeight={500}>
        {title}
      </text>
      {sub && <T x={x + 10} y={y + 32}>{sub}</T>}
    </g>
  );
}

const Arrow = ({ d }: { d: string }) => <path d={d} stroke={FAINT} fill="none" markerEnd="url(#arrow)" />;

function ArrowDefs() {
  return (
    <defs>
      <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M0 0 8 4 0 8" fill="none" stroke={FAINT} />
      </marker>
    </defs>
  );
}

export function DetectionChain() {
  return (
    <svg viewBox="0 0 640 230" className="h-auto w-full" role="img" aria-label="From echo powers to a basal permittivity and a hypothesis">
      <ArrowDefs />
      <Box x={10} y={20} w={150} title="Surface echo P_s" sub="peak at the picked row" />
      <Box x={10} y={80} w={150} title="Deep echo P_b" sub="largest corrected peak" />
      <Box x={200} y={50} w={170} title="ΔP = P_b − P_s" sub="dB, so gains cancel" />
      <Box x={410} y={20} w={220} title="+ R_s − T_s² + L(z)" sub="surface Fresnel, transmission, loss" />
      <Box x={410} y={90} w={220} title="R_b, basal reflectivity" sub="threshold, ≤ 0 dB, ≥ 3 traces" accent />
      <Box x={200} y={160} w={170} title="ε below the base" sub="Fresnel, solved for ε₂" />
      <Box x={410} y={160} w={220} title="Class and hypotheses" sub="water · clay · clutter" />
      <Arrow d="M160 40H185V64H198" />
      <Arrow d="M160 100H185V76H198" />
      <Arrow d="M370 70H390V40H408" />
      <Arrow d="M520 60V88" />
      <Arrow d="M520 130V145H285V158" />
      <Arrow d="M370 180H408" />
    </svg>
  );
}

/* Architecture ------------------------------------------------------------- */

export function Architecture() {
  return (
    <svg viewBox="0 0 640 300" className="h-auto w-full" role="img" aria-label="Main thread, store, renderers and the compute worker">
      <ArrowDefs />
      <rect x={6} y={6} width={392} height={288} fill="none" stroke="var(--c-line)" strokeDasharray="4 4" />
      <T x={16} y={24} color={DIM}>main thread</T>
      <Box x={20} y={40} w={170} title="React interface" sub="panels, lazy views" />
      <Box x={20} y={120} w={170} title="Zustand store" sub="narrow selectors" accent />
      <Box x={210} y={40} w={170} title="Viewport store" sub="pan, zoom, cursor" />
      <Box x={210} y={120} w={170} title="Radargram renderer" sub="WebGL2 or Canvas 2D" />
      <Box x={20} y={200} w={170} title="three.js scene" sub="on-demand frames" />
      <Box x={210} y={200} w={170} title="Exports" sub="PNG, CSV, JSON, PDF" />
      <rect x={414} y={6} width={220} height={288} fill="none" stroke="var(--c-line)" strokeDasharray="4 4" />
      <T x={424} y={24} color={DIM}>compute worker, one per job</T>
      <Box x={428} y={40} w={192} title="Scenes and PDS decode" />
      <Box x={428} y={90} w={192} title="Detection, CRISM, PolSAR" />
      <Box x={428} y={140} w={192} title="Migration, Monte Carlo" />
      <Box x={428} y={190} w={192} title="Inversion (FWI)" sub="WebGPU, else CPU" accent />
      <T x={428} y={262} color={DIM}>cancel = terminate the worker</T>
      <Arrow d="M105 80V118" />
      <Arrow d="M295 80V118" />
      <Arrow d="M190 140H208" />
      <Arrow d="M190 150C300 250 330 250 426 210" />
      <Arrow d="M426 60C380 60 380 130 192 132" />
    </svg>
  );
}

/* FWI loop ----------------------------------------------------------------- */

export function FwiLoop() {
  return (
    <svg viewBox="0 0 640 220" className="h-auto w-full" role="img" aria-label="Forward model, misfit, adjoint, gradient, update">
      <ArrowDefs />
      <Box x={10} y={20} w={180} title="Model ln ε" sub="coarse grid, one row per sample" accent />
      <Box x={230} y={20} w={180} title="Forward wave equation" sub="exploding reflectors" />
      <Box x={450} y={20} w={180} title="Envelope misfit" sub="α|u| vs observed amplitude" />
      <Box x={450} y={140} w={180} title="Adjoint field λ" sub="residual run backwards" />
      <Box x={230} y={140} w={180} title="Gradient" sub="λ·w (ρ) and λ·∂²u/∂t² (s²)" />
      <Box x={10} y={140} w={180} title="Line search" sub="+ blocky, denser-down prior" />
      <Arrow d="M190 40H228" />
      <Arrow d="M410 40H448" />
      <Arrow d="M540 60V138" />
      <Arrow d="M450 160H412" />
      <Arrow d="M230 160H192" />
      <Arrow d="M100 140V62" />
    </svg>
  );
}

/* Scene models ------------------------------------------------------------- */

export function SceneModels() {
  const models = sceneModels();
  const colW = 110;
  const H = 260;
  return (
    <svg viewBox={`0 0 ${models.length * (colW + 16)} ${H - 20}`} className="h-auto w-full" role="img" aria-label="Layer stacks of the five simulated scenes">
      {models.map((m, i) => {
        const finite = m.layers.slice(0, -1);
        const total = finite.reduce((a, l) => a + l.thicknessM, 0);
        const scale = (H - 60) / Math.max(1, total * 1.15);
        let y = 30;
        const x0 = i * (colW + 16) + 4;
        return (
          <g key={m.id}>
            <text x={x0} y={14} fontSize={11.5} fill={INK} fontFamily="var(--font-sans)" fontWeight={600}>{m.title}</text>
            <T x={x0} y={26} size={9.5}>{m.instrument}, {total.toLocaleString('en')} m</T>
            {finite.map(l => {
              const h = Math.max(3, l.thicknessM * scale);
              const color = colorFor(l.permittivity);
              const g = (
                <g key={l.label + y}>
                  <rect x={x0} y={y + 4} width={colW} height={h} fill={color} stroke="var(--c-line)" />
                  {h > 12 && <T x={x0 + 4} y={y + 4 + Math.min(h - 3, 12)} size={9} color="#14110e">ε {l.permittivity}</T>}
                </g>
              );
              y += h;
              return g;
            })}
            {(() => {
              const base = m.layers[m.layers.length - 1];
              return (
                <g>
                  <rect x={x0} y={y + 4} width={colW} height={20} fill={colorFor(base.permittivity)} stroke="var(--c-line)" />
                  {base.patches?.map((_p, k) => <rect key={k} x={x0 + colW * (0.45 + k * 0.24)} y={y + 4} width={colW * 0.18} height={6} fill={WATER} />)}
                  <T x={x0 + 4} y={y + 18} size={9} color="#f2eee5">ε {base.permittivity}{base.patches ? ', brine patches' : ''}</T>
                </g>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

function colorFor(eps: number): string {
  if (eps >= 20) return getMaterial('liquid-water')?.color ?? '#3f6f9a';
  if (eps >= 7) return getMaterial('basalt-dense')?.color ?? '#5a4436';
  if (eps >= 5) return getMaterial('regolith-porous')?.color ?? '#b97a45';
  if (eps >= 3.9) return getMaterial('mars-soil')?.color ?? '#a65a35';
  if (eps >= 3.3) return getMaterial('dusty-ice')?.color ?? '#8fa3ad';
  return getMaterial('water-ice')?.color ?? '#a9c6d3';
}

/* Colour tables ------------------------------------------------------------ */

export function ColourTables() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {getAllColormaps().map(c => (
        <div key={c.id} className="flex items-center gap-3">
          <span className="h-4 flex-1" style={{ background: colormapCss(c.id) }} />
          <span className="w-20 text-xs text-dim">{c.name}</span>
        </div>
      ))}
    </div>
  );
}

/* Screenshot --------------------------------------------------------------- */

export function Shot({ src, alt, caption }: { src: string; alt: string; caption: ReactNode }) {
  return (
    <figure className="doc-figure my-8 lg:-mr-24">
      <img src={`/media/${src}`} alt={alt} loading="lazy" decoding="async" className="block w-full border border-line" />
      <figcaption className="mt-2 text-xs text-dim">{caption}</figcaption>
    </figure>
  );
}

export function Aside({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <aside className="my-6 border-l-2 border-signal bg-raised py-3 pr-4 pl-4 text-sm text-dim">
      {title && <p className="label mb-1 text-signal">{title}</p>}
      {children}
    </aside>
  );
}
