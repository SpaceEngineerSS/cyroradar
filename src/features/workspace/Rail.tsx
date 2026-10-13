import { motion } from 'motion/react';
import { useApp, type PanelId } from '../../store/app';
import { PANELS, RAIL } from '../panels/registry';
import { Icon } from '../../ui/icons';
import { Tooltip } from '../../ui/controls';
import { cx } from '../../ui/cx';

/** Vertical panel switcher on tablet and desktop. */
export function Rail() {
  const mode = useApp(s => s.mode);
  const panel = useApp(s => s.panel);
  const open = useApp(s => s.inspectorOpen);
  const set = useApp(s => s.set);
  const segments = useApp(s => s.segments.length);
  const logCount = useApp(s => s.log.length);

  const choose = (id: PanelId) => {
    if (id === panel) set('inspectorOpen', !open);
    else {
      set('panel', id);
      set('inspectorOpen', true);
    }
  };

  return (
    <nav aria-label="Panels" className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 border-r border-line bg-raised py-2">
      {RAIL[mode].map(id => {
        const p = PANELS[id];
        const active = open && id === panel;
        const badge = id === 'detect' && segments ? segments : id === 'log' && logCount ? logCount : null;
        return (
          <Tooltip key={id} text={p.label} side="right">
            <button
              type="button"
              aria-label={p.label}
              aria-pressed={active}
              onClick={() => choose(id)}
              className={cx('relative flex h-10 w-10 items-center justify-center rounded-xs transition-colors', active ? 'text-ink' : 'text-faint hover:bg-hover hover:text-dim')}
            >
              {active && <motion.span layoutId="rail-mark" className="absolute top-2 bottom-2 -left-[6px] w-[2px] bg-accent" transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }} />}
              <Icon name={p.icon} size={19} />
              {badge != null && <span className="num absolute top-1 right-0.5 min-w-3.5 rounded-[1px] bg-signal px-0.5 text-center text-[9.5px] leading-3.5 text-[#140e04]">{badge > 99 ? '99' : badge}</span>}
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/** Horizontal panel switcher along the bottom of a phone screen. */
export function BottomBar() {
  const mode = useApp(s => s.mode);
  const panel = useApp(s => s.panel);
  const open = useApp(s => s.inspectorOpen);
  const set = useApp(s => s.set);
  return (
    <nav aria-label="Panels" className="flex shrink-0 overflow-x-auto border-t border-line bg-raised pb-[env(safe-area-inset-bottom)]">
      {RAIL[mode].map(id => {
        const p = PANELS[id];
        const active = open && id === panel;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              set('panel', id);
              set('inspectorOpen', !(active && open));
            }}
            className={cx('flex min-w-[64px] flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[10.5px]', active ? 'text-accent' : 'text-faint')}
          >
            <Icon name={p.icon} size={19} />
            <span className="whitespace-nowrap">{p.label.split(' ')[0]}</span>
          </button>
        );
      })}
    </nav>
  );
}
