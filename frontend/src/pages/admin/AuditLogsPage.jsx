import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { Card, Skeleton, Alert } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function AuditLogsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const entity = params.get('entity') ?? '';
  const page = Number(params.get('page')) || 1;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setError(null);
    adminApi
      .listAuditLogs({ page, limit: 30, ...(action && { action }), ...(entity && { entity }) })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
  }, [isAdmin, action, entity, page]);

  if (!isAdmin) return <Navigate to="/admin/dashboard" replace />;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" description="Every recorded staff action across the platform." />

      <Card className="flex flex-wrap gap-3 p-4">
        <Input aria-label="Filter by entity" placeholder="Entity (e.g. hotel, booking)" value={entity} onChange={(e) => update({ entity: e.target.value, page: null })} className="max-w-xs" />
        <Input aria-label="Filter by action" placeholder="Action (e.g. hotel.updated)" value={action} onChange={(e) => update({ action: e.target.value, page: null })} className="max-w-xs" />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={ScrollText} title="No matching audit entries" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <caption className="sr-only">Audit log</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Entity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Details</th>
                  <th scope="col" className="px-4 py-3 font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-strong)]">{entry.action}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{entry.entity} #{entry.entityId}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : 'System'}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-xs text-[var(--text-muted)]" title={JSON.stringify(entry.newValue ?? entry.oldValue ?? {})}>
                      {JSON.stringify(entry.newValue ?? entry.oldValue ?? {})}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(entry.createdAt)}</td>
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
