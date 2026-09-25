'use client';
import type { ApiError } from '@madart/api-client';
import { Button, cx, useToast } from '@madart/ui';
import { type ReactNode, useState } from 'react';

export function Table<T>({ rows, columns, rowKey, onRow, empty = 'ჩანაწერები არ არის' }: { rows: T[]; columns: { key: string; label: ReactNode; render: (r: T) => ReactNode; className?: string }[]; rowKey: (r: T) => string; onRow?: (r: T) => void; empty?: string }) {
  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cx('px-4 py-2 font-semibold', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cx(onRow && 'cursor-pointer hover:bg-canvas')}>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-4 py-2 align-middle', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Generic async submit helper with toast on error. */
export function useSubmit() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submit = async <T,>(fn: () => Promise<T>, successMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (successMsg) toast.success(successMsg);
      return r;
    } catch (e) {
      const err = e as ApiError;
      const details = Array.isArray(err.details) ? (err.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join('\n') : undefined;
      toast.error(err.message, details);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy };
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular">{value}</div>
      {hint && <div className="text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function CopyButton({ text, label = 'კოპირება' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success('დაკოპირდა');
        } catch {
          toast.error('კოპირება ვერ მოხერხდა');
        }
      }}
    >
      {label}
    </Button>
  );
}

export const APP_URLS = {
  kiosk: process.env.NEXT_PUBLIC_KIOSK_URL ?? 'http://localhost:5173',
  pos: process.env.NEXT_PUBLIC_POS_URL ?? 'http://localhost:5174',
  production: process.env.NEXT_PUBLIC_PRODUCTION_URL ?? 'http://localhost:5175',
  display: process.env.NEXT_PUBLIC_DISPLAY_URL ?? 'http://localhost:3003',
};
