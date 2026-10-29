import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthContext.jsx';
import { homePathFor } from '@/features/auth/routing.js';
import { setStaffCustomerView } from '@/features/auth/viewMode.js';
import { cn } from '@/lib/utils.js';

export function StaffViewToggle({ customerMode = false, className }) {
  const { isStaff, user } = useAuth();
  const navigate = useNavigate();

  if (!isStaff) return null;

  const handleChange = () => {
    const nextCustomerMode = !customerMode;
    setStaffCustomerView(nextCustomerMode);
    navigate(nextCustomerMode ? '/' : homePathFor(user));
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={customerMode}
      aria-label={customerMode ? 'Return to staff workspace' : 'Open customer view'}
      title={customerMode ? 'Return to staff workspace' : 'Open customer view'}
      onClick={handleChange}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        className,
      )}
    >
      <span>Customer view</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 rounded-full bg-slate-300 transition-colors',
          customerMode && 'bg-brand-600',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            customerMode && 'translate-x-[16px]',
          )}
        />
      </span>
    </button>
  );
}
