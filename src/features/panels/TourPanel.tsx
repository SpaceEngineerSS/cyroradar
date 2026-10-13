/* Guided tour. Every number in the text is read from the scene the simulator
 * actually built, so what you are told matches what is on the screen. */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../store/app';
import { viewport, fitViewport } from '../../store/viewport';
import { fresnelReflection } from '../../core/physics/fresnel';
import { twoWayLossDb } from '../../core/physics/attenuation';
import { SPEED_OF_LIGHT } from '../../core/physics/constants';
import { Button, EmptyState, Progress } from '../../ui/controls';
import type { CryoDataset } from '../../types/types';

interface Step {
  title: string;
  body: (ds: CryoDataset) => ReactNode;
  /** Runs when the step opens. */
  enter?: (ds: CryoDataset) => void | Promise<void>;
}

const fmt = (n: number, d = 0) => n.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d });

function zoomRows(ds: CryoDataset, rowFrom: number, rowTo: number) {
  const v = viewport.getState();
  fitViewport(ds.radargram.width, ds.radargram.height);
  const fit = viewport.getState();
  const scaleY = v.height / Math.max(10, rowTo - rowFrom);
  viewport.setState({ scaleY, offsetY: -rowFrom * scaleY, scaleX: fit.scaleX, offsetX: 0 });
}

const STEPS: Step[] = [
  {
    title: 'What a radargram is',
    body: ds => (
      <>
        <p>
          Each column is one radar pulse fired straight down from {ds.metadata.instrument === 'MARSIS' ? 'Mars Express (MARSIS)' : 'Mars Reconnaissance Orbiter (SHARAD)'} as it flies along the track. Left to right covers {fmt((ds.radargram.width * ds.radargram.traceSpacingM) / 1000)} km.
        </p>
        <p>
          Down the page is time: how long the echo took to come back. Bright means a strong echo. The scale on the left is in microseconds, the one at the bottom in kilometres.
        </p>
      </>
    ),
    enter: ds => {
      const s = useApp.getState();
      s.set('mainView', 'radargram');
      s.set('tool', 'pan');
      s.setOverlay('truth', false);
      s.setOverlay('detections', false);
      s.set('selectedSegment', null);
      fitViewport(ds.radargram.width, ds.radargram.height);
    },
  },
  {
    title: 'The surface echo',
    body: ds => {
      const eps = ds.truth?.layers[0]?.permittivity ?? 3.15;
      const R = fresnelReflection(1, eps);
      return (
        <>
          <p>The first bright line, traced in orange, is the echo from the ground itself. Everything below it is the subsurface.</p>
          <p>
            Its strength depends on how much the permittivity jumps from vacuum to the top layer (ε = {fmt(eps, 2)} here). The Fresnel equation gives a reflectivity of {fmt(R.reflectionDb, 1)} dB, so {fmt(R.transmissionCoefficient * 100, 1)} % of the power carries on into the ground.
          </p>
        </>
      );
    },
    enter: ds => {
      useApp.getState().setOverlay('topography', true);
      const s = ds.surfaceEcho.indices;
      let lo = Infinity;
      let hi = 0;
      for (const v of s) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      zoomRows(ds, Math.max(0, lo - 30), Math.min(ds.radargram.height, hi + 90));
    },
  },
  {
    title: 'Layers inside the ice',
    body: ds => {
      const t = ds.truth;
      if (!t) return <p>This radargram has no scene model to compare with.</p>;
      return (
        <>
          <p>The dashed lines show where the simulator placed each interface. Fainter lines below the surface are echoes from changes in dust content or from the rock underneath.</p>
          <ol className="num flex flex-col gap-1 text-xs">
            {t.layers.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{l.label}</span>
                <span className="shrink-0 text-dim">
                  ε {fmt(l.permittivity, 2)}
                  {i < t.layers.length - 1 ? ` · ${fmt(l.thicknessM)} m` : ' · below'}
                </span>
              </li>
            ))}
          </ol>
        </>
      );
    },
    enter: ds => {
      useApp.getState().setOverlay('truth', true);
      fitViewport(ds.radargram.width, ds.radargram.height);
    },
  },
  {
    title: 'From time to depth',
    body: ds => {
      const l = ds.truth?.layers[0];
      if (!l) return null;
      const t = (2 * l.thicknessM * Math.sqrt(l.permittivity)) / SPEED_OF_LIGHT;
      return (
        <>
          <p>
            Radio waves slow down in ice: their speed is c/√ε. Going down and back through {fmt(l.thicknessM)} m of material with ε = {fmt(l.permittivity, 2)} takes {fmt(t * 1e6, 2)} µs, which is {fmt(t / ds.radargram.sampleInterval)} samples on this radargram.
          </p>
          <p>The dotted contours now show depth below the surface, using the scene's layers as the depth model. Hover over the plot to read depth in the status bar.</p>
        </>
      );
    },
    enter: () => {
      const s = useApp.getState();
      s.loadTruthModel();
      s.setOverlay('depthGrid', true);
    },
  },
  {
    title: 'A brighter patch at the base',
    body: ds => {
      const t = ds.truth;
      const host = t?.layers[t.layers.length - 2];
      if (!t?.target || !host) return <p>Look along the deepest reflector for places where it gets brighter.</p>;
      const brine = fresnelReflection(host.permittivity, 35).reflectionDb;
      const rock = fresnelReflection(host.permittivity, t.layers[t.layers.length - 1].permittivity).reflectionDb;
      const loss = twoWayLossDb(ds.metadata.frequencyHz, t.layers.slice(0, -1));
      return (
        <>
          <p>
            Between traces {t.target.traceStart} and {t.target.traceEnd} the base echo is much stronger. Ice over rock reflects about {fmt(rock, 1)} dB; ice over brine-soaked sediment about {fmt(brine, 1)} dB. That {fmt(brine - rock, 0)} dB difference survives the {fmt(loss, 1)} dB lost on the way down and back.
          </p>
          <p>This is the kind of bright basal reflection that Orosei et al. (2018) reported under the south polar cap.</p>
        </>
      );
    },
    enter: ds => {
      const t = ds.truth;
      if (!t?.target) return;
      const last = t.interfaces[t.interfaces.length - 1];
      const mid = Math.round((t.target.traceStart + t.target.traceEnd) / 2);
      const row = last ? last[mid] : ds.radargram.height * 0.7;
      const v = viewport.getState();
      const span = (t.target.traceEnd - t.target.traceStart) * 4;
      const scaleX = v.width / span;
      const scaleY = v.height / 160;
      viewport.setState({ scaleX, scaleY, offsetX: v.width / 2 - mid * scaleX, offsetY: v.height / 2 - row * scaleY });
    },
  },
  {
    title: 'Let the detector look',
    body: () => (
      <>
        <p>
          The scan compares the deepest strong echo of every trace with its surface echo, adds back the surface reflection and the loss through the ice, and works out what permittivity the base must have to reflect that much.
        </p>
        <p>Detections are grouped into segments, lettered A, B… on the plot. Click one to see its numbers.</p>
      </>
    ),
    enter: async ds => {
      const s = useApp.getState();
      s.setOverlay('truth', false);
      await s.runScan();
      fitViewport(ds.radargram.width, ds.radargram.height);
    },
  },
  {
    title: 'Water, clay, or an echo from the side?',
    body: () => (
      <>
        <p>
          A bright base is not proof of water. Bierson et al. (2021) showed that some clays are conductive enough at Martian temperatures to look similar, and a sloping surface can bounce echoes in from the side that arrive at the same delay.
        </p>
        <p>The Detection panel weighs all three explanations using the permittivity, the depth, the surface slope and the CRISM context of each segment. Open it to see the balance for segment A.</p>
      </>
    ),
    enter: () => {
      const s = useApp.getState();
      if (s.segments.length) s.selectSegment(0);
    },
  },
  {
    title: 'Over to you',
    body: () => (
      <>
        <p>Switch to Analyse mode for the full toolset: pick your own horizons, migrate the image, run the Monte Carlo uncertainty, or try the waveform inversion on the bright patch.</p>
        <p>The documentation explains every calculation, including what each one leaves out.</p>
      </>
    ),
  },
];

export default function TourPanel() {
  const ds = useApp(s => s.dataset);
  const step = useApp(s => s.tourStep);
  const set = useApp(s => s.set);
  const load = useApp(s => s.loadSynthetic);
  const busy = useApp(s => s.datasetStatus === 'running');

  const go = async (i: number) => {
    set('tourStep', i);
    const d = useApp.getState().dataset;
    if (d) await STEPS[i].enter?.(d);
  };

  if (!ds?.truth) {
    return (
      <EmptyState
        icon="tour"
        title="Eight short steps through a real result"
        action={
          <Button tone="primary" icon="play" disabled={busy} onClick={async () => { await load('planum-australe'); await go(0); }}>
            Start with Planum Australe
          </Button>
        }
      >
        The tour uses a simulated MARSIS track over the south polar cap and explains what you see, from the surface echo to the bright patch at the base of the ice.
      </EmptyState>
    );
  }

  if (step == null) {
    return (
      <EmptyState icon="tour" title={`Tour of ${ds.metadata.title}`} action={<Button tone="primary" icon="play" onClick={() => go(0)}>Begin</Button>}>
        Eight short steps. The view will move as you go; you can pan and zoom at any point.
      </EmptyState>
    );
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="num text-xs text-faint">
          {step + 1} / {STEPS.length}
        </span>
        <div className="flex-1"><Progress value={(step + 1) / STEPS.length} label="Tour progress" /></div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="flex flex-col gap-3 text-sm leading-[21px] text-dim [&_p]:max-w-[60ch]"
        >
          <h3 className="text-[15px] font-semibold text-ink">{s.title}</h3>
          {s.body(ds)}
        </motion.div>
      </AnimatePresence>
      <div className="flex gap-2 pt-1">
        <Button disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </Button>
        {last ? (
          <Button tone="primary" onClick={() => { set('tourStep', null); set('mode', 'analyst'); set('panel', 'detect'); }}>
            Switch to Analyse
          </Button>
        ) : (
          <Button tone="primary" onClick={() => go(step + 1)}>
            Next
          </Button>
        )}
        {step === 6 && (
          <Button tone="quiet" onClick={() => set('panel', 'detect')}>
            Open Detection
          </Button>
        )}
      </div>
    </div>
  );
}
