import { Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useApp } from '../../store/app';
import { PANELS } from '../panels/registry';
import { IconButton, Progress } from '../../ui/controls';

const WIDTH_KEY = 'cryoradar.inspectorWidth';
const readWidth = () => {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return v >= 280 && v <= 560 ? v : 340;
  } catch {
    return 340;
  }
};

function PanelBody() {
  const panel = useApp(s => s.panel);
  const P = PANELS[panel];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panel}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 4 }}
        transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <Suspense fallback={<div className="px-4 py-4"><Progress value={null} label="Loading panel" /></div>}>
          <P.component />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  const panel = useApp(s => s.panel);
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-4">
      <h2 className="text-sm font-semibold">{PANELS[panel].label}</h2>
      <IconButton icon="close" label="Close panel" size={28} tip={false} onClick={onClose} />
    </div>
  );
}

/** Docked column on desktop, with a drag handle to resize it. */
export function DockedInspector() {
  const open = useApp(s => s.inspectorOpen);
  const set = useApp(s => s.set);
  const [width, setWidth] = useState(readWidth);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* storage may be unavailable */
    }
  }, [width]);

  if (!open) return null;
  return (
    <aside aria-label="Inspector" className="relative flex shrink-0 flex-col border-r border-line bg-raised" style={{ width }}>
      <Header onClose={() => set('inspectorOpen', false)} />
      <PanelBody />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={width}
        aria-valuemin={280}
        aria-valuemax={560}
        tabIndex={0}
        className="absolute top-0 -right-[3px] z-10 h-full w-[6px] cursor-col-resize hover:bg-accent-soft focus-visible:bg-accent-soft"
        onPointerDown={e => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (!dragging.current) return;
          const left = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().left;
          setWidth(Math.round(Math.min(560, Math.max(280, e.clientX - left))));
        }}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') setWidth(w => Math.max(280, w - 20));
          if (e.key === 'ArrowRight') setWidth(w => Math.min(560, w + 20));
        }}
      />
    </aside>
  );
}

/** Drawer over the main view on tablets. */
export function DrawerInspector() {
  const open = useApp(s => s.inspectorOpen);
  const set = useApp(s => s.set);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          aria-label="Inspector"
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          className="absolute inset-y-0 left-0 z-20 flex w-[340px] max-w-[85vw] flex-col border-r border-line bg-raised shadow-[8px_0_24px_rgb(0_0_0/0.3)]"
        >
          <Header onClose={() => set('inspectorOpen', false)} />
          <PanelBody />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Bottom sheet on phones. */
export function SheetInspector() {
  const open = useApp(s => s.inspectorOpen);
  const set = useApp(s => s.set);
  const controls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          aria-label="Inspector"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
          drag="y"
          dragControls={controls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => info.offset.y > 120 && set('inspectorOpen', false)}
          className="absolute inset-x-0 bottom-0 z-20 flex h-[62%] flex-col border-t border-line-strong bg-raised shadow-[0_-8px_24px_rgb(0_0_0/0.35)]"
        >
          <div className="flex touch-none justify-center pt-1.5 pb-1" onPointerDown={e => controls.start(e)}>
            <span className="h-1 w-9 rounded-full bg-line-strong" />
          </div>
          <Header onClose={() => set('inspectorOpen', false)} />
          <PanelBody />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
