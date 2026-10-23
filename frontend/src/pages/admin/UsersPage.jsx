import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Users, Wifi, WifiOff } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { PresenceDot } from '@/features/users/PresenceDot.jsx';
import { relativeTimeLabel } from '@/features/users/presenceFormat.js';
import { useUserPresenceStream } from '@/features/users/useUserPresenceStream.js';

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'HOTEL_MANAGER', label: 'Hotel Manager' },
  { value: 'HOTEL_OWNER', label: 'Hotel Owner (Partner)' },
  { value: 'ADMIN', label: 'Administrator' },
];
const STATUS_OPTIONS = [
  { value: '', label: 'Any account status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const ONLINE_OPTIONS = [
  { value: '', label: 'Online or offline' },
  { value: 'online', label: 'Online now' },
  { value: 'offline', label: 'Offline' },
];
const LIST_POLL_MS = 45_000;
const KPI_POLL_MS = 30_000;
const TICK_MS = 10_000;

function KpiCard({ label, value, onClick, active }) {
  const body = (
    <>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-semibold text-[var(--text-strong)]">{value ?? <Skeleton className="mt-1 h-6 w-10" />}</p>
    </>
  );
  if (!onClick) return <Card className="p-4">{body}</Card>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius-card)] border p-4 text-left transition-colors ${active ? 'border-brand-500 bg-brand-50' : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]'}`}
    >
      {body}
    </button>
  );
}

function ConnectionIndicator({ status }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-600">
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Reconnecting…
    </span>
  );
}

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page')) || 1;
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const online = params.get('online') ?? '';
  const [searchText, setSearchText] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [streamStatus, setStreamStatus] = useState('reconnecting');
  const [now, setNow] = useState(Date.now());

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  const resetFilters = () => {
    setSearchText('');
    setParams(new URLSearchParams());
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== q) update({ q: searchText.trim(), page: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const query = useMemo(
    () => ({ page, limit: 20, ...(q && { q }), ...(role && { role }), ...(status && { status }), ...(online && { online }) }),
    [page, q, role, status, online],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const load = () => adminApi.listUsers(query).then((result) => !cancelled && setData(result)).catch((err) => !cancelled && setError(normalizeError(err).message));
    load();
    const poller = setInterval(load, LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poller);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = () => adminApi.getUserKpis().then((result) => !cancelled && setKpis(result)).catch(() => {});
    load();
    const poller = setInterval(load, KPI_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poller);
    };
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(ticker);
  }, []);

  useUserPresenceStream({
    enabled: true,
    onStatusChange: setStreamStatus,
    onUpdate: (payload) => {
      setData((prev) => {
        if (!prev) return prev;
        let changed = false;
        const items = prev.items.map((item) => {
          if (item.id !== payload.userId) return item;
          changed = true;
          return {
            ...item,
            presenceStatus: 'online',
            session: {
              id: payload.sessionId,
              platform: payload.platform ?? item.session?.platform ?? 'web',
              browser: payload.browser ?? item.session?.browser ?? null,
              os: payload.os ?? item.session?.os ?? null,
              route: payload.route ?? item.session?.route ?? null,
              routeLabel: payload.routeLabel ?? item.session?.routeLabel ?? 'Not available',
              startedAt: item.session?.startedAt ?? payload.startedAt,
              lastHeartbeatAt: payload.lastHeartbeatAt,
            },
          };
        });
        return changed ? { ...prev, items } : prev;
      });
    },
    onEnd: (payload) => {
      setData((prev) => {
        if (!prev) return prev;
        let changed = false;
        const items = prev.items.map((item) => {
          if (item.id !== payload.userId || item.session?.id !== payload.sessionId) return item;
          changed = true;
          return { ...item, session: null };
        });
        return changed ? { ...prev, items } : prev;
      });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage users and monitor real-time platform activity."
        actions={<ConnectionIndicator status={streamStatus} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total Users" value={kpis?.totalUsers} />
        <KpiCard label="Online Now" value={kpis?.onlineNow} onClick={() => update({ online: 'online', page: null })} active={online === 'online'} />
        <KpiCard label="Offline Users" value={kpis?.offlineUsers} onClick={() => update({ online: 'offline', page: null })} active={online === 'offline'} />
        <KpiCard label="New Users Today" value={kpis?.newUsersToday} />
        <KpiCard label="Active Sessions" value={kpis?.activeSessions} />
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <Input aria-label="Search users" placeholder="Name, email, phone or ID" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
          <Select aria-label="Role" value={role} onChange={(e) => update({ role: e.target.value, page: null })} className="w-auto min-w-[160px]">
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select aria-label="Account status" value={status} onChange={(e) => update({ status: e.target.value, page: null })} className="w-auto min-w-[170px]">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select aria-label="Online status" value={online} onChange={(e) => update({ online: e.target.value, page: null })} className="w-auto min-w-[170px]">
            {ONLINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {(q || role || status || online) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>
          )}
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Users} title={q || role || status || online ? 'No users match these filters' : 'No users yet'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <caption className="sr-only">Users</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">User</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Online</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Current Page</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Device</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last Activity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{u.name || u.email}</Link>
                      <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === 'ADMIN' ? 'premium' : r === 'HOTEL_MANAGER' || r === 'HOTEL_OWNER' ? 'brand' : 'neutral'}>{r}</Badge>)}</div>
                    </td>
                    <td className="px-4 py-3">{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</td>
                    <td className="px-4 py-3"><PresenceDot lastHeartbeatAt={u.session?.lastHeartbeatAt} now={now} /></td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{u.session?.routeLabel ?? 'Not available'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {u.session ? [u.session.platform, u.session.browser, u.session.os].filter(Boolean).join(' · ') : 'Not available'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]" title={formatDateTime(u.session?.lastHeartbeatAt ?? u.lastLoginAt)}>
                      {relativeTimeLabel(u.session?.lastHeartbeatAt ?? u.lastLoginAt, now)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(u.joinedAt).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(p) => update({ page: p })} />}
    </div>
  );
}
