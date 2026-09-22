import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button, cx } from './components';

// ───────────────────────────── Toasts (never alert()) ─────────────────────

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  ttlMs: number;
}

interface ToastApi {
  push: (t: Omit<Toast, 'id' | 'ttlMs'> & { ttlMs?: number }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const kindClass: Record<ToastKind, string> = {
  info: 'border-info bg-info-soft text-info',
  success: 'border-ok bg-ok-soft text-ok',
  warning: 'border-warn bg-warn-soft text-warn',
  error: 'border-danger bg-danger-soft text-danger',
};

export function ToastProvider({ children, position = 'top-right' }: { children: ReactNode; position?: 'top-right' | 'bottom-center' }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback<ToastApi['push']>((t) => {
    const id = ++seq.current;
    const toast: Toast = { id, ttlMs: t.ttlMs ?? (t.kind === 'error' ? 7000 : 3500), ...t };
    setToasts((xs) => [...xs.slice(-4), toast]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), toast.ttlMs);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push({ kind: 'success', title, message }),
      error: (title, message) => push({ kind: 'error', title, message }),
      info: (title, message) => push({ kind: 'info', title, message }),
      warning: (title, message) => push({ kind: 'warning', title, message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={cx('pointer-events-none fixed z-[100] flex flex-col gap-2 p-4', position === 'top-right' ? 'right-0 top-0' : 'bottom-0 left-1/2 -translate-x-1/2')} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto min-w-64 max-w-sm rounded-xl border-l-4 bg-surface p-3 shadow-card animate-pop', kindClass[t.kind])}>
            <div className="font-semibold">{t.title}</div>
            {t.message && <div className="text-sm text-ink">{t.message}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ───────────────────────────── Modal ──────────────────────────────────────

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={cx('card w-full animate-pop p-0', width)} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="close" className="rounded-full p-2 text-ink-muted hover:bg-black/5">
              ✕
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'დადასტურება',
  cancelLabel = 'გაუქმება',
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
