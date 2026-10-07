import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, PageHeader, Pagination, formatDateTime } from '@/components/shared/index.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { notificationApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useDocumentMeta({ title: 'Notifications | Gokaasa', description: 'Updates about your bookings, payments and reviews.' });

  useEffect(() => {
    let active = true;
    setError(null);
    notificationApi
      .list({ page, limit: 20 })
      .then((result) => active && setData(result))
      .catch((err) => active && setError(normalizeError(err).message));
    return () => {
      active = false;
    };
  }, [page, reloadKey]);

  const markAllRead = async () => {
    await notificationApi.markAllRead().catch(() => {});
    setReloadKey((k) => k + 1);
  };

  const markOneRead = async (id) => {
    setData((d) => ({ ...d, items: d.items.map((item) => (item.id === id ? { ...item, read: true } : item)) }));
    await notificationApi.markRead(id).catch(() => {});
  };

  const hasUnread = data?.items.some((item) => !item.read);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Notifications"
        description="Updates about your bookings, payments and reviews."
        actions={hasUnread && (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
          </Button>
        )}
      />

      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Updates about your bookings will show up here." />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data?.items.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => markOneRead(notification.id)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-[var(--surface-muted)]"
                >
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-transparent' : 'bg-brand-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-strong)]">{notification.title}</span>
                    <span className="block text-sm text-[var(--text-muted)]">{notification.message}</span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatDateTime(notification.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />}
    </div>
  );
}
