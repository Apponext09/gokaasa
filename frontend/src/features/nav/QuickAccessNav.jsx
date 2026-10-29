import { Link } from 'react-router-dom';
import { Building2, Heart, LogIn, Luggage } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext.jsx';

/**
 * Homepage-only quick-access row. Only real, working destinations are listed here -- there is no
 * Rewards or Wallet feature anywhere in the product (no routes, no backend), so neither appears.
 * Auth-aware via the existing AuthContext; no separate auth logic.
 */
export function QuickAccessNav({ className = '' }) {
  const { isAuthenticated, user } = useAuth();
  const isPartner = Boolean(user?.roles?.includes('HOTEL_OWNER'));

  const items = [
    {
      key: 'partner',
      to: isPartner ? '/partner/status' : '/partner/register',
      label: 'Partner With Us',
      icon: Building2,
    },
    isAuthenticated
      ? { key: 'trips', to: '/my-trips', label: 'My Trips', icon: Luggage }
      : { key: 'login', to: '/login', label: 'Login / Sign Up', icon: LogIn },
    isAuthenticated
      ? { key: 'wishlist', to: '/wishlist', label: 'Wishlist', icon: Heart }
      : null,
  ].filter(Boolean);

  return (
    <nav aria-label="Quick access" className={`customer-quick-nav ${className}`}>
      {items.map(({ key, to, label, icon: Icon }) => (
        <Link key={key} to={to} title={label} className="customer-quick-nav-item">
          <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
