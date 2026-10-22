import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserCog } from 'lucide-react';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
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
          <TableSkeleton rows={3} />
        ) : filtered?.length === 0 ? (
          <EmptyState icon={UserCog} title="No managers found" description="Assign a manager from a hotel's workspace to see them here." />
        ) : (
          <Table minWidth="720px">
            <caption className="sr-only">Hotel managers</caption>
            <TableHeader>
              <tr>
                <TableHead>Manager</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Assigned Hotels</TableHead>
                <TableHead>Created</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered?.map((manager) => (
                <TableRow key={manager.id}>
                  <TableCell>
                    <Link to={`/admin/managers/${manager.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">
                      {manager.firstName} {manager.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[var(--text-body)]">{manager.email}</TableCell>
                  <TableCell>
                    {manager.hotels.length === 0 ? (
                      <Badge tone="neutral">Unassigned</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {manager.hotels.map((hotel) => <Badge key={hotel.id} tone="brand">{hotel.name}</Badge>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-[var(--text-muted)]">{formatDateTime(manager.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
