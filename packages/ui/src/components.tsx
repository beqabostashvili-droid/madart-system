import type { ConnectionState } from '@madart/types';
import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, forwardRef } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ───────────────────────────── Button ─────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-dark active:bg-brand-dark shadow-sm',
  secondary: 'bg-ink text-white hover:bg-black',
  ghost: 'bg-transparent text-ink hover:bg-black/5',
  outline: 'bg-surface text-ink border border-line hover:bg-black/5',
  danger: 'bg-danger text-white hover:bg-red-800',
  success: 'bg-ok text-white hover:bg-green-800',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-base rounded-xl gap-2',
  lg: 'h-14 px-6 text-lg rounded-2xl gap-2',
  xl: 'h-20 px-8 text-2xl rounded-2xl gap-3',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-semibold select-none transition-colors duration-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        variantClass[variant],
        sizeClass[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="h-5 w-5" />}
      {children}
    </button>
  );
});

// ───────────────────────────── Primitives ─────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'h-6 w-6')} viewBox="0 0 24 24" fill="none" aria-label="loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card p-4', className)} {...rest} />;
}

export function Badge({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', className)} {...rest}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-ink-muted">
      {icon ?? <div className="text-5xl">🗒️</div>}
      <div className="text-lg font-semibold text-ink">{title}</div>
      {hint && <div className="text-sm">{hint}</div>}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// ───────────────────────────── Forms ──────────────────────────────────────

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const inputClass = 'h-11 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand/30 disabled:bg-canvas';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputClass, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx(inputClass, className)} {...rest} />;
});

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2">
      <span className={cx('relative inline-flex h-6 w-11 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-gray-300')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5 left-0' : 'left-0.5')} />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

// ───────────────────────────── Touch helpers ──────────────────────────────

export function QuantityStepper({ value, onChange, min = 0, max = 99, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'md' | 'lg' }) {
  const btn = size === 'lg' ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-lg';
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" aria-label="minus" onClick={() => onChange(Math.max(min, value - 1))} className={cx(btn, 'rounded-full border border-line bg-surface font-bold active:bg-black/5')}>
        −
      </button>
      <span className={cx('tabular min-w-8 text-center font-bold', size === 'lg' ? 'text-2xl' : 'text-lg')}>{value}</span>
      <button type="button" aria-label="plus" onClick={() => onChange(Math.min(max, value + 1))} className={cx(btn, 'rounded-full bg-brand font-bold text-brand-ink active:bg-brand-dark')}>
        +
      </button>
    </div>
  );
}

export function NumberPad({ onDigit, onBackspace, onClear, onEnter, enterLabel = 'OK' }: { onDigit: (d: string) => void; onBackspace: () => void; onClear: () => void; onEnter?: () => void; enterLabel?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => (k === 'C' ? onClear() : k === '⌫' ? onBackspace() : onDigit(k))}
          className={cx('h-14 rounded-xl text-xl font-bold active:scale-95', k === 'C' ? 'bg-danger-soft text-danger' : 'bg-surface border border-line')}
        >
          {k}
        </button>
      ))}
      {onEnter && (
        <button type="button" onClick={onEnter} className="col-span-3 h-14 rounded-xl bg-ok text-xl font-bold text-white active:scale-[0.98]">
          {enterLabel}
        </button>
      )}
    </div>
  );
}

// ───────────────────────────── Connection indicator (spec §32) ────────────

const connectionStyle: Record<ConnectionState, { dot: string; label: string }> = {
  ONLINE: { dot: 'bg-ok', label: 'ONLINE' },
  RECONNECTING: { dot: 'bg-warn animate-pulse', label: 'RECONNECTING' },
  OFFLINE: { dot: 'bg-danger', label: 'OFFLINE' },
};

export function ConnectionBadge({ state, compact }: { state: ConnectionState; compact?: boolean }) {
  const s = connectionStyle[state];
  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold', state !== 'ONLINE' && 'text-danger')}>
      <span className={cx('h-2.5 w-2.5 rounded-full', s.dot)} />
      {!compact && s.label}
    </span>
  );
}

export function OfflineBanner({ state }: { state: ConnectionState }) {
  if (state === 'ONLINE') return null;
  return (
    <div className={cx('fixed inset-x-0 top-0 z-50 py-2 text-center text-sm font-semibold text-white', state === 'RECONNECTING' ? 'bg-warn' : 'bg-danger')}>
      {state === 'RECONNECTING' ? 'კავშირი აღდგენის პროცესშია…' : 'კავშირი სერვერთან დაკარგულია'}
    </div>
  );
}
