import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../store/app';
import { Icon } from '../../ui/icons';
import { cx } from '../../ui/cx';

export function Toasts() {
  const toasts = useApp(s => s.toasts);
  const dismiss = useApp(s => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-3 bottom-9 z-50 flex w-[min(360px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-2.5 border border-line-strong bg-raised py-2 pr-2 pl-3 text-sm shadow-[0_4px_16px_rgb(0_0_0/0.3)]',
              t.tone === 'error' && 'border-l-2 border-l-danger',
              t.tone === 'ok' && 'border-l-2 border-l-ok',
            )}
          >
            <Icon name={t.tone === 'error' ? 'warning' : t.tone === 'ok' ? 'check' : 'info'} size={16} className={cx('mt-0.5 shrink-0', t.tone === 'error' ? 'text-danger' : t.tone === 'ok' ? 'text-ok' : 'text-dim')} />
            <p className="min-w-0 flex-1">{t.text}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-faint hover:text-ink">
              <Icon name="close" size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
