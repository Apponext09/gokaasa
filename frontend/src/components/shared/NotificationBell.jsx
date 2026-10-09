import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { notificationApi } from '@/services/endpoints.js';
import { notificationPath } from '@/features/notifications/notificationPath.js';

const POLL_MS = 60_000;

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/**
 * The header's bell: an unread badge plus a dropdown of the most recent notifications. There is no
 * real-time push (no socket.io in this project) -- the unread count polls every minute and refreshes
 * immediately whenever the dropdown is opened, which is the documented fallback for "no websocket yet".
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState(null);
  const rootRef = useRef(null);

  const refreshCount = useCallback(() => {
    notificationApi.unreadCount().then(setUnreadCount).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return undefined;
    notificationApi.list({ limit: 8 }).then((result) => setItems(result.items)).catch(() => setItems([]));
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

  const markOneRead = async (notification) => {
    if (notification.read) return;
    setItems((list) => list.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    setUnreadCount((count) => Math.max(0, count - 1));
    await notificationApi.markRead(notification.id).catch(() => {});
  };

  const markAllRead = async () => {
    setItems((list) => list?.map((item) => ({ ...item, read: true })) ?? null);
    setUnreadCount(0);
    await notificationApi.markAllRead().catch(() => {});
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-body)] hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl shadow-black/10"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
            <span className="text-sm font-semibold text-[var(--text-strong)]">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                <Check className="h-3 w-3" aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items === null && <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>}
            {items?.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No notifications yet.</p>}
            {items?.map((notification) => {
              const path = notificationPath(notification);
              const Item = path ? Link : 'button';
              return (
                <Item
                  key={notification.id}
                  role="menuitem"
                  type={path ? undefined : 'button'}
                  to={path ?? undefined}
                  onClick={() => {
                    markOneRead(notification);
                    if (path) setOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3 text-left last:border-0 hover:bg-[var(--surface-muted)]"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-transparent' : 'bg-brand-600'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-strong)]">{notification.title}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{notification.message}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{timeAgo(notification.createdAt)}</span>
                  </span>
                </Item>
              );
            })}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--border-subtle)] px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-[var(--surface-muted)]"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
