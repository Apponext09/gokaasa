import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { EXPIRED_MESSAGE } from '../bookingFormat.js';

/** Shown instead of the booking steps once the server says the hold has ended. Nothing here can be paid. */
export function HoldExpiredPanel({ message = EXPIRED_MESSAGE }) {
  const navigate = useNavigate();
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-warning-600/30 bg-warning-50 p-8 text-center">
      <Clock className="mx-auto mb-3 h-8 w-8 text-warning-600" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-[var(--text-strong)]">The room is no longer held</h2>
      <p className="mt-2 text-sm text-[var(--text-body)]">{message}</p>
      <Button className="mt-6" onClick={() => navigate('/')}>
        Search again
      </Button>
    </div>
  );
}
