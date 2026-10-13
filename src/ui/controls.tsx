/* Small, accessible building blocks. Styling stays in Tailwind classes that
 * read from the design tokens in styles/app.css. */

import { useId, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, type IconName } from './icons';
import { cx } from './cx';


/* Buttons ------------------------------------------------------------------ */

type ButtonTone = 'default' | 'primary' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  icon?: IconName;
  size?: 'sm' | 'md';
}

export function Button({ tone = 'default', icon, size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xs border font-medium whitespace-nowrap select-none',
        'transition-colors duration-100 disabled:opacity-45',
        size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
        tone === 'primary' && 'border-accent bg-accent text-accent-ink hover:brightness-110',
        tone === 'default' && 'border-line-strong bg-raised text-ink hover:bg-hover',
        tone === 'quiet' && 'border-transparent bg-transparent text-dim hover:bg-hover hover:text-ink',
        tone === 'danger' && 'border-line-strong bg-raised text-danger hover:bg-hover',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  pressed?: boolean;
  size?: number;
  tip?: 'top' | 'bottom' | 'right' | 'left' | false;
  shortcut?: string;
}

export function IconButton({ icon, label, pressed, size = 32, tip = 'bottom', shortcut, className, ...rest }: IconButtonProps) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xs transition-colors duration-100 disabled:opacity-40',
        pressed ? 'bg-accent-soft text-accent' : 'text-dim hover:bg-hover hover:text-ink',
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.56)} />
    </button>
  );
  if (!tip) return button;
  return (
    <Tooltip text={label} shortcut={shortcut} side={tip}>
      {button}
    </Tooltip>
  );
}

/* Tooltip ------------------------------------------------------------------ */

export function Tooltip({ text, shortcut, side = 'bottom', children }: { text: string; shortcut?: string; side?: 'top' | 'bottom' | 'right' | 'left'; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }[side];
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={e => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.35, duration: 0.1 } }}
            exit={{ opacity: 0, transition: { duration: 0.05 } }}
            className={cx(
              'pointer-events-none absolute z-50 flex items-center gap-2 whitespace-nowrap rounded-xs border border-line-strong bg-raised px-2 py-1 text-xs text-ink shadow-[0_2px_8px_rgb(0_0_0/0.35)]',
              pos,
            )}
          >
            {text}
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num rounded-xs border border-line-strong px-1 text-[10.5px] leading-4 text-dim">{children}</kbd>;
}

/* Segmented control -------------------------------------------------------- */

export function Segmented<T extends string>({
  value, options, onChange, label, size = 'md',
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xs border border-line-strong bg-sunken p-px">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative inline-flex items-center gap-1.5 rounded-[1px] font-medium transition-colors',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-[26px] px-2.5 text-sm',
              active ? 'text-ink' : 'text-faint hover:text-dim',
            )}
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[1px] bg-hover" transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }} />}
            <span className="relative inline-flex items-center gap-1.5">
              {o.icon && <Icon name={o.icon} size={14} />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Form controls ------------------------------------------------------------ */

function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs text-dim">
        {label}
      </label>
      {children}
      {hint && <p className="text-2xs text-faint">{hint}</p>}
    </div>
  );
}

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  unit?: string;
}

export function Slider({ label, value, onChange, format, unit, min = 0, max = 1, step = 0.01, ...rest }: SliderProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs text-dim">
          {label}
        </label>
        <output htmlFor={id} className="num text-xs text-ink">
          {format ? format(value) : value}
          {unit && <span className="text-faint"> {unit}</span>}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        {...rest}
      />
    </div>
  );
}

export function NumberField({
  label, value, onChange, min, max, step = 'any', unit, hint, disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  unit?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const v = Number(text);
    if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
    setDraft(null);
  };
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          className="field num pr-10"
          inputMode="decimal"
          value={draft ?? String(value)}
          disabled={disabled}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setDraft(null);
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && typeof step === 'number') {
              e.preventDefault();
              const next = value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1);
              onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(next.toPrecision(10)))));
            }
          }}
        />
        {unit && <span className="num pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-faint">{unit}</span>}
      </div>
    </Field>
  );
}

export function Select({ label, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <select id={id} className="field appearance-none pr-7" {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={14} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-faint" />
      </div>
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-3.5 w-6 shrink-0 rounded-[1px] border transition-colors disabled:opacity-40',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-sunken',
        )}
      >
        <span
          className={cx('absolute top-px h-2.5 w-2.5 rounded-[1px] transition-[left] duration-150', checked ? 'left-[11px] bg-accent-ink' : 'left-px bg-faint')}
        />
      </button>
      <label htmlFor={id} className="flex flex-col text-sm text-ink select-none">
        {label}
        {hint && <span className="text-2xs text-faint">{hint}</span>}
      </label>
    </div>
  );
}

/* Display ------------------------------------------------------------------ */

export function Readout({ label, value, unit, tone, title }: { label: string; value: ReactNode; unit?: string; tone?: 'signal' | 'accent' | 'ok' | 'danger'; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col" title={title}>
      <span className="label truncate">{label}</span>
      <span
        className={cx(
          'num truncate text-sm',
          tone === 'signal' && 'text-signal',
          tone === 'accent' && 'text-accent',
          tone === 'ok' && 'text-ok',
          tone === 'danger' && 'text-danger',
          !tone && 'text-ink',
        )}
      >
        {value}
        {unit && <span className="text-faint"> {unit}</span>}
      </span>
    </div>
  );
}

export function Section({
  title, children, actions, defaultOpen = true, collapsible = true,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-line">
      <header className="flex h-9 items-center justify-between gap-2 px-4">
        {collapsible ? (
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="group flex items-center gap-1.5">
            <Icon name="chevronRight" size={12} className={cx('text-faint transition-transform duration-150', open && 'rotate-90')} />
            <h3 className="label group-hover:text-dim">{title}</h3>
          </button>
        ) : (
          <h3 className="label">{title}</h3>
        )}
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function Progress({ value, label }: { value: number | null; label?: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.round(value * 100)} className="relative h-[3px] w-full overflow-hidden bg-line">
      {value == null ? (
        <motion.span className="absolute inset-y-0 w-1/3 bg-accent" initial={{ left: '-33%' }} animate={{ left: '100%' }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
      ) : (
        <span className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      )}
    </div>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' }) {
  return (
    <div
      className={cx(
        'flex gap-2 border-l-2 py-1 pl-2.5 text-xs',
        tone === 'info' && 'border-line-strong text-dim',
        tone === 'warn' && 'border-signal text-dim',
        tone === 'error' && 'border-danger text-ink',
      )}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-6">
      <Icon name={icon} size={20} className="text-faint" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="text-xs text-dim">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/** Horizontal bar for a probability or fraction, with the value printed. */
export function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="text-xs text-dim">{label}</span>
      <span className="num text-xs text-ink">{(value * 100).toFixed(1)}%</span>
      <div className="col-span-2 h-1.5 bg-sunken">
        <motion.div className="h-full" style={{ background: color }} initial={false} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }} />
      </div>
    </div>
  );
}

