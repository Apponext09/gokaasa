import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';

/**
 * Shown when a traveller taps an unsupported travel product (Flights, Trains, Buses, Cabs,
 * Holiday Packages, Homestays & Villas). Never presents a fake booking form.
 */
export function ComingSoonModal({ product, open, onClose }) {
  if (!product) return null;

  const Icon = product.icon;

  return (
    <Modal open={open} onClose={onClose} title={`${product.label} — Coming Soon`}>
      <div className="flex flex-col items-center gap-4 px-1 py-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700/10 text-brand-700">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">{product.label}</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Coming Soon</h3>
        </div>

        <p className="max-w-sm text-sm leading-6 text-[var(--text-muted)]">{product.description}</p>

        <p className="text-sm font-medium text-[var(--text-body)]">
          We're working on bringing this experience to Gokaasa.
        </p>

        <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>

          <Link to="/" onClick={onClose} className="w-full sm:w-auto">
            <Button type="button" className="w-full">
              Explore Hotels
            </Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
