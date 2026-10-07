import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Heart, LogOut, Luggage, UserRound } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext.jsx';

/** The authenticated header's "Hi, {name}" menu: My Profile, My Trips, Wishlist, Logout. */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  const itemClass = 'flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-body)] hover:bg-[var(--surface-muted)]';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-sm font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Hi, {user?.firstName}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] py-1 shadow-xl shadow-black/10"
        >
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={itemClass}>
            <UserRound className="h-4 w-4" aria-hidden="true" /> My Profile
          </Link>
          <Link role="menuitem" to="/my-trips" onClick={() => setOpen(false)} className={itemClass}>
            <Luggage className="h-4 w-4" aria-hidden="true" /> My Trips
          </Link>
          <Link role="menuitem" to="/wishlist" onClick={() => setOpen(false)} className={itemClass}>
            <Heart className="h-4 w-4" aria-hidden="true" /> Wishlist
          </Link>
          <button role="menuitem" type="button" onClick={handleLogout} className={`w-full border-t border-[var(--border-subtle)] text-left text-danger-600 hover:bg-danger-50 ${itemClass}`}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}
