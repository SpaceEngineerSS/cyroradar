import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'wouter';
import { useApp } from '../../store/app';
import { buildCommands, type Command } from './commands';
import { Icon } from '../../ui/icons';
import { Kbd } from '../../ui/controls';
import { cx } from '../../ui/cx';

/** Subsequence match with a bonus for word starts. Returns −1 for no match. */
function score(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let s = 0;
  let prev = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    s += i === prev + 1 ? 3 : 1;
    if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '(') s += 4;
    prev = i;
    qi++;
  }
  return qi === q.length ? s : -1;
}

function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgb(0_0_0/0.45)] px-3 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onPointerDown={e => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -4, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
            className="w-full max-w-[560px] border border-line-strong bg-raised shadow-[0_16px_48px_rgb(0_0_0/0.45)]"
            onKeyDown={e => e.key === 'Escape' && onClose()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CommandPalette() {
  const open = useApp(s => s.paletteOpen);
  const set = useApp(s => s.set);
  return (
    <Modal open={open} onClose={() => set('paletteOpen', false)} label="Commands">
      <PaletteBody />
    </Modal>
  );
}

/** Mounted only while the palette is open, so its query starts empty each time. */
function PaletteBody() {
  const set = useApp(s => s.set);
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo(() => buildCommands(navigate), [navigate]);
  const results = useMemo(() => {
    const scored = commands.map(c => ({ c, s: score(query, `${c.title} ${c.group}`) })).filter(x => x.s >= 0);
    if (query) scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 40).map(x => x.c);
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const close = () => set('paletteOpen', false);
  const run = (c: Command) => {
    close();
    c.run();
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Icon name="search" size={16} className="text-faint" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `cmd-${results[index].id}` : undefined}
          placeholder="Type a command or a scene name"
          className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex(i => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex(i => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && results[index]) {
              e.preventDefault();
              run(results[index]);
            }
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="palette-list" role="listbox" ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
        {results.length === 0 && <li className="px-4 py-6 text-sm text-faint">Nothing matches “{query}”.</li>}
        {results.map((c, i) => {
          const showGroup = !query && (i === 0 || results[i - 1].group !== c.group);
          return (
            <li key={c.id} role="presentation">
              {showGroup && <div className="label px-4 pt-3 pb-1">{c.group}</div>}
              <div
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === index}
                data-index={i}
                onPointerMove={() => setIndex(i)}
                onClick={() => run(c)}
                className={cx('flex cursor-pointer items-center gap-3 px-4 py-2 text-sm', i === index ? 'bg-hover text-ink' : 'text-dim')}
              >
                {c.icon ? <Icon name={c.icon} size={16} className="text-faint" /> : <span className="w-4" />}
                <span className="flex-1 truncate">{c.title}</span>
                {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl K', 'Commands'],
  ['V  P  M  R', 'Pan, pick, measure, region'],
  ['1  2  3  4', 'Radargram, A-scope, track, 3D'],
  ['Wheel', 'Zoom (Shift: time only, Alt: distance only)'],
  ['Drag', 'Pan (pan tool or middle button)'],
  ['Double-click  0', 'Fit to view'],
  ['Arrows  +  −', 'Pan and zoom when the plot has focus'],
  ['Click', 'Pin a trace for the A-scope, or select a detection'],
  ['Esc', 'Clear the measurement'],
  ['D', 'Documentation'],
  ['?', 'This list'],
];

export function ShortcutsSheet() {
  const open = useApp(s => s.shortcutsOpen);
  const set = useApp(s => s.set);
  return (
    <Modal open={open} onClose={() => set('shortcutsOpen', false)} label="Keyboard shortcuts">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Keyboard and pointer</h2>
        <button type="button" autoFocus onClick={() => set('shortcutsOpen', false)} className="text-faint hover:text-ink" aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-4 py-4 text-sm">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} className="contents">
            <dt className="num text-xs whitespace-pre text-ink">{k}</dt>
            <dd className="text-dim">{d}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
