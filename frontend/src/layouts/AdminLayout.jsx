import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileBarChart,
  FileText,
  LogOut,
  Menu,
  ReceiptText,
  ScrollText,
  Search,
  Settings,
  Star,
  Tag,
  UserCog,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Logo } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { FullPageSpinner } from '@/components/shared/index.jsx';
import { NotificationBell } from '@/components/shared/NotificationBell.jsx';
import { AdminCommandPalette } from '@/features/admin/AdminCommandPalette.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { cn } from '@/lib/utils.js';

const NAV = [
  { section: null, items: [{ to: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 }] },
  {
    section: 'Hotels',
    items: [
      { to: '/admin/hotels', label: 'All Hotels', icon: Building2, end: true },
      { to: '/admin/hotels/onboarding', label: 'Add Hotel', icon: Search },
      { to: '/admin/managers', label: 'Managers', icon: UserCog },
      { to: '/admin/partners', label: 'Partner Applications', icon: UserCog, adminOnly: true },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
      { to: '/admin/payments', label: 'Payments', icon: Wallet },
      { to: '/admin/refunds', label: 'Refunds', icon: ReceiptText },
      { to: '/admin/invoices', label: 'Invoices', icon: FileText },
      { to: '/admin/offers', label: 'Offers & Coupons', icon: Tag },
      { to: '/admin/customers', label: 'Customers', icon: Users },
      { to: '/admin/reviews', label: 'Reviews', icon: Star },
    ],
  },
  {
    section: 'Insights',
    items: [{ to: '/admin/reports', label: 'Reports', icon: FileBarChart }],
  },
  {
    section: 'Settings',
    items: [
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/users', label: 'User Management', icon: Users, adminOnly: true },
      { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, adminOnly: true },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function SidebarNav({ onNavigate, collapsed }) {
  const { isAdmin } = useAuth();
  return (
    <nav aria-label="Admin" className="admin-sidebar-nav flex flex-col gap-5">
      {NAV.map((group, index) => {
        const items = group.items.filter((item) => !item.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.section ?? index} className="flex flex-col gap-1.5">
            {group.section && !collapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.section}</p>
            )}
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'admin-nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    collapsed && 'justify-center',
                    isActive ? 'is-active bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && label}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function AdminProfileMenu() {
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
    navigate('/login', { replace: true });
  };

  const itemClass = 'flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-body)] hover:bg-[var(--surface-muted)]';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <span className="hidden text-right sm:block">
          <span className="block font-medium text-[var(--text-strong)]">{user?.firstName} {user?.lastName}</span>
          <span className="block text-xs text-[var(--text-muted)]">{user?.roles?.join(' · ')}</span>
        </span>
        <UserRound className="h-6 w-6 rounded-full bg-[var(--surface-muted)] p-1 text-[var(--text-body)]" aria-hidden="true" />
        <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-muted)] transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Admin account" className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] py-1 shadow-xl shadow-black/10">
          <Link role="menuitem" to="/admin/profile" onClick={() => setOpen(false)} className={itemClass}>
            <UserRound className="h-4 w-4" aria-hidden="true" /> Profile
          </Link>
          <Link role="menuitem" to="/admin/settings" onClick={() => setOpen(false)} className={itemClass}>
            <Settings className="h-4 w-4" aria-hidden="true" /> Settings
          </Link>
          <button role="menuitem" type="button" onClick={handleLogout} className={`w-full border-t border-[var(--border-subtle)] text-left text-danger-600 hover:bg-danger-50 ${itemClass}`}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { isAdmin } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('gokaasa:admin-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem('gokaasa:admin-sidebar-collapsed', String(next));
      } catch {
        // Per-viewer convenience only; nothing breaks if storage is unavailable.
      }
      return next;
    });
  };

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="admin-ui h-screen overflow-hidden" style={{ '--admin-sidebar-width': collapsed ? '5rem' : '16.5rem' }}>
      <aside className={cn('admin-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col gap-6 overflow-hidden border-r border-slate-200 bg-white p-4 transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-[16.5rem]')}>
        <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between')}>
          <div className={cn('admin-brand min-w-0', collapsed && 'is-collapsed [&_img]:h-9 [&_img]:w-9 [&_img]:object-cover [&_img]:object-left')}>
            <Logo to="/admin/dashboard" />
            {!collapsed && <p className="mt-0.5 pl-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">Admin console</p>}
          </div>
        </div>
        <div className="admin-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
          <SidebarNav collapsed={collapsed} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={cn('admin-sidebar-collapse mt-auto shrink-0', collapsed && 'justify-center px-0')}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <><ChevronsLeft className="h-4 w-4" aria-hidden="true" /> Collapse</>}
        </Button>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
          <aside className="admin-sidebar admin-sidebar-scroll relative flex h-full w-72 flex-col gap-6 overflow-y-auto bg-white p-4 shadow-2xl shadow-slate-950/20">
            <div className="flex items-center justify-between">
              <div className="admin-brand"><Logo to="/admin/dashboard" /></div>
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex h-screen min-w-0 flex-col md:ml-[var(--admin-sidebar-width)]">
        <header className="admin-topbar relative z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <AdminCommandPalette navigation={NAV} />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 lg:inline">{isAdmin ? 'Hotel operations' : 'My hotels'}</span>
            <NotificationBell />
            <AdminProfileMenu />
          </div>
        </header>
        <main id="main" className="admin-main min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="admin-content mx-auto w-full max-w-[1440px]">
            <Suspense fallback={<FullPageSpinner label="Loading" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
