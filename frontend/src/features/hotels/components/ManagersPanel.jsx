import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Select } from '@/components/ui/form-controls.jsx';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

/**
 * Who can manage this hotel. ADMIN-only: assigning access is itself an admin-level action. A
 * HOTEL_MANAGER with no row here gets a 404 from every hotel-scoped admin route (see hotelAccess.js).
 */
export function ManagersPanel({ hotelId }) {
  const [managers, setManagers] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    adminApi.listManagersForHotel(hotelId).then(setManagers).catch((err) => toast.error(normalizeError(err).message));
  };

  useEffect(reload, [hotelId]);
  useEffect(() => {
    adminApi.listManagers().then(setCandidates).catch(() => {});
  }, []);

  const assign = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      setManagers(await adminApi.assignManager(hotelId, Number(selected)));
      setSelected('');
      toast.success('Manager assigned');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (userId) => {
    setBusy(true);
    try {
      setManagers(await adminApi.unassignManager(hotelId, userId));
      toast.success('Manager removed');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (!managers) return <Skeleton className="h-24" />;

  const assignable = candidates.filter((c) => !managers.some((m) => m.userId === c.id));

  return (
    <div className="space-y-3">
      {managers.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No hotel manager is assigned yet. Only administrators can manage this hotel until one is.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {managers.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-medium text-[var(--text-strong)]">{m.firstName} {m.lastName}</p>
                <p className="text-xs text-[var(--text-muted)]">{m.email}</p>
              </div>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => unassign(m.userId)}>
                <UserMinus className="h-4 w-4" aria-hidden="true" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Select aria-label="Choose a hotel manager to assign" value={selected} onChange={(e) => setSelected(e.target.value)} className="max-w-xs">
          <option value="">Choose a hotel manager…</option>
          {assignable.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" disabled={!selected || busy} onClick={assign}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Assign
        </Button>
      </div>
    </div>
  );
}
