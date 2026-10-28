import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Select } from '@/components/ui/form-controls.jsx';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function OnboardingExecutivesPanel({ hotelId }) {
  const [executives, setExecutives] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.listOnboardingForHotel(hotelId).then(setExecutives).catch((error) => toast.error(normalizeError(error).message));
    adminApi.listOnboardingExecutives().then(setCandidates).catch(() => {});
  }, [hotelId]);

  const assign = async () => {
    setBusy(true);
    try {
      setExecutives(await adminApi.assignOnboardingExecutive(hotelId, Number(selected)));
      setSelected('');
      toast.success('Onboarding executive assigned');
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (userId) => {
    setBusy(true);
    try {
      setExecutives(await adminApi.unassignOnboardingExecutive(hotelId, userId));
      toast.success('Onboarding executive removed');
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!executives) return <Skeleton className="h-24" />;
  const assignable = candidates.filter((candidate) => !executives.some((executive) => executive.userId === candidate.id));

  return (
    <div className="space-y-3">
      {executives.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No onboarding executive is assigned.</p> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {executives.map((executive) => (
            <li key={executive.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div><p className="font-medium text-[var(--text-strong)]">{executive.firstName} {executive.lastName}</p><p className="text-xs text-[var(--text-muted)]">{executive.email}</p></div>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => unassign(executive.userId)}><UserMinus className="h-4 w-4" /> Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Select aria-label="Choose an onboarding executive" value={selected} onChange={(event) => setSelected(event.target.value)} className="max-w-xs">
          <option value="">Choose an onboarding executive…</option>
          {assignable.map((executive) => <option key={executive.id} value={executive.id}>{executive.firstName} {executive.lastName} ({executive.email})</option>)}
        </Select>
        <Button variant="secondary" size="sm" disabled={!selected || busy} onClick={assign}><UserPlus className="h-4 w-4" /> Assign</Button>
      </div>
    </div>
  );
}
