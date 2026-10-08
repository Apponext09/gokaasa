import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserCog } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { EmptyState, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

/** Hotel managers are realistically few, so this page filters client-side rather than round-tripping per keystroke. */
export function ManagersPage() {
  const [managers, setManagers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listManagers({})
      .then((result) => !cancelled && setManagers(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = managers?.filter((manager) => {
    const haystack = `${manager.firstName} ${manager.lastName} ${manager.email}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Hotel Managers" description="Every hotel manager account and the hotels each one is assigned to." />

      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search managers" placeholder="Name or email" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {managers === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserCog} title="No managers found" description="Assign a manager from a hotel's workspace to see them here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Hotel managers</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Manager</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Assigned Hotels</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filtered.map((manager) => (
                  <tr key={manager.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/managers/${manager.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">
                        {manager.firstName} {manager.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{manager.email}</td>
                    <td className="px-4 py-3">
                      {manager.hotels.length === 0 ? (
                        <Badge tone="neutral">Unassigned</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {manager.hotels.map((hotel) => <Badge key={hotel.id} tone="brand">{hotel.name}</Badge>)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(manager.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
