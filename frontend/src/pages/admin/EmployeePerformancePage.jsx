import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Search, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { roleLabel } from '@/features/auth/roleLabels.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';

const SORT_OPTIONS = [
  { value: 'onboarded_desc', label: 'Most hotels onboarded' },
  { value: 'edited_desc', label: 'Most editing activity' },
  { value: 'name_asc', label: 'Name A–Z' },
];
const FILTER_KEYS = ['q', 'sort', 'page'];

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

export function EmployeePerformancePage() {
  const [filters, updateFilters] = useFilters();
  const [searchText, setSearchText] = useState(filters.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() !== filters.q) updateFilters({ q: searchText.trim() });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const query = {
    page: Number(filters.page) || 1,
    limit: 20,
    sort: filters.sort || 'onboarded_desc',
    ...(filters.q && { q: filters.q }),
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi.listEmployeePerformance(query).then((result) => !cancelled && setData(result)).catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.sort, filters.page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminApi.exportCsv('employee-performance', query);
      downloadBlob(blob, 'employee-performance.csv');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Boolean(filters.q);

  return (
    <div className="admin-table-page flex h-full min-h-0 flex-col gap-5">
      <PageHeader
        title="Employee Performance"
        description="Every staff member who has onboarded or edited at least one hotel."
        actions={<Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}><Download className="h-4 w-4" aria-hidden="true" /> Export CSV</Button>}
      />

      <Card className="filter-panel flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search employees" placeholder="Name or email" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Select aria-label="Sort" value={filters.sort || 'onboarded_desc'} onChange={(e) => updateFilters({ sort: e.target.value })} className="w-auto min-w-[200px]">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="admin-records-card min-h-0 flex-1 overflow-hidden">
        {data === null && !error ? (
          <TableSkeleton rows={10} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon={UserCog} title={hasFilters ? 'No employees match this search' : 'No onboarding or editing activity yet'} />
        ) : (
          <div className="admin-records-scroll h-full overflow-auto">
            <Table minWidth="1080px">
              <caption className="sr-only">Employee performance</caption>
              <TableHeader>
                <tr>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Onboarded</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Changes Requested</TableHead>
                  <TableHead className="text-right">Hotels Edited</TableHead>
                  <TableHead>Last Activity</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {data?.items.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <Link to={`/admin/onboarding-analytics/employees/${employee.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{employee.name}</Link>
                      <p className="text-xs text-[var(--text-muted)]">{employee.email} · ID {employee.id}</p>
                    </TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{employee.roles.map((r) => <Badge key={r} tone="neutral">{roleLabel(r)}</Badge>)}</div></TableCell>
                    <TableCell className="text-right">{employee.onboarded}</TableCell>
                    <TableCell className="text-right">{employee.approved}</TableCell>
                    <TableCell className="text-right">{employee.pending}</TableCell>
                    <TableCell className="text-right">{employee.changesRequested}</TableCell>
                    <TableCell className="text-right">{employee.hotelsEdited}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{employee.lastActivityAt ? formatDateTime(employee.lastActivityAt) : 'Not available'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {data && data.pagination.totalPages > 1 && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(p) => updateFilters({ page: p })} />}
    </div>
  );
}
