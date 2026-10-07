import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';

/**
 * Accessible confirmation dialog. Traps focus on open, closes on Escape, and restores focus to the
 * element that opened it.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', loading = false, onConfirm, onCancel }) {
  const titleId = useId();
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !loading) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openerRef.current?.focus?.();
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button aria-label="Dismiss" className="absolute inset-0 bg-black/30" onClick={() => !loading && onCancel()} tabIndex={-1} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-lg">
        <div className="mb-2 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-[var(--text-strong)]">
            {title}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onCancel} disabled={loading}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {description && <p className="text-sm text-[var(--text-muted)]">{description}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Generic dialog for content such as image previews. Escape and the backdrop close it. */
export function Modal({ open, title, onClose, children, wide = false }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} tabIndex={-1} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative max-h-[90vh] w-full overflow-auto rounded-[var(--radius-card)] bg-[var(--surface-card)] p-5 shadow-lg ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold text-[var(--text-strong)]">
            {title}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
