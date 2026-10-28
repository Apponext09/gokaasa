import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ScrollText, Search } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const FILTER_KEYS = ['q', 'entity', 'entityId', 'action', 'from', 'to', 'page'];

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']));
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  return [filters, update];
}

function MetadataCell({ entry }) {
  const [open, setOpen] = useState(false);
  const payload = { old: entry.oldValue ?? null, new: entry.newValue ?? null };
  const hasPayload = payload.old || payload.new;
  if (!hasPayload) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  return (
    <div className="max-w-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /> {open ? 'Hide' : 'View'} details
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-2 text-[11px] text-[var(--text-body)]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditLogsPage() {
  const { isAdmin } = useAuth();
  const [filters, updateFilters] = useFilters();
  const [searchText, setSearchText] = useState(filters.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== filters.q) updateFilters({ q: searchText.trim() });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setError(null);
    adminApi
      .listAuditLogs({
        page: Number(filters.page) || 1,
        limit: 30,
        ...(filters.q && { q: filters.q }),
        ...(filters.entity && { entity: filters.entity }),
        ...(filters.entityId && { entityId: filters.entityId }),
        ...(filters.action && { action: filters.action }),
        ...(filters.from && { from: filters.from }),
        ...(filters.to && { to: filters.to }),
      })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, filters.q, filters.entity, filters.entityId, filters.action, filters.from, filters.to, filters.page]);

  if (!isAdmin) return <Navigate to="/admin/dashboard" replace />;

  const hasFilters = Boolean(filters.q || filters.entity || filters.entityId || filters.action || filters.from || filters.to);

  return (
    <div className="admin-table-page flex h-full min-h-0 flex-col gap-6">
      <PageHeader title="Audit Logs" description="Every recorded staff action across the platform." />

      <Card className="filter-panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-7">
        <div className="relative sm:col-span-2 xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search by actor name or email" placeholder="Actor name or email" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Input aria-label="Filter by entity" placeholder="Entity (e.g. hotel)" value={filters.entity} onChange={(e) => updateFilters({ entity: e.target.value })} />
        <Input aria-label="Filter by entity id" placeholder="Entity ID" value={filters.entityId} onChange={(e) => updateFilters({ entityId: e.target.value })} />
        <Input aria-label="Filter by action" placeholder="Action (e.g. hotel.updated)" value={filters.action} onChange={(e) => updateFilters({ action: e.target.value })} />
        <Input aria-label="From date" type="date" value={filters.from} onChange={(e) => updateFilters({ from: e.target.value })} />
        <Input aria-label="To date" type="date" value={filters.to} onChange={(e) => updateFilters({ to: e.target.value })} />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="admin-records-card min-h-0 flex-1 overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={ScrollText} title={hasFilters ? 'No audit entries match these filters' : 'No audit entries yet'} />
        ) : (
          <div className="admin-records-scroll h-full overflow-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <caption className="sr-only">Audit log</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">When</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Entity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Entity ID</th>
                  <th scope="col" className="px-4 py-3 font-semibold">IP</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : 'System'}</td>
                    <td className="px-4 py-3">
                      {entry.actor?.roles?.length > 0
                        ? entry.actor.roles.map((role) => <Badge key={role} tone={role === 'ADMIN' ? 'brand' : 'neutral'}>{role}</Badge>)
                        : <span className="text-xs text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-strong)]">{entry.action}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{entry.entity}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{entry.entityId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{entry.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3"><MetadataCell entry={entry} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(p) => updateFilters({ page: p })} />}
    </div>
  );
}
