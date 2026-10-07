import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, Plus, Users } from 'lucide-react';
import { Alert, Badge, Card, CardContent, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox } from '@/components/ui/form-controls.jsx';
import { EmptyState, formatMoney } from '@/components/shared/index.jsx';
import { roomApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS = {
  ACTIVE: ['success', 'Active'],
  INACTIVE: ['warning', 'Inactive'],
  ARCHIVED: ['neutral', 'Archived'],
};

/** Room types for one hotel. Used by the hotel's Rooms tab and by the standalone rooms page. */
export function RoomTypeList({ hotelId, manageBasePath }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRooms(null);
    roomApi
      .list(hotelId, includeArchived)
      .then((items) => !cancelled && setRooms(items))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [hotelId, includeArchived]);

  const newPath = `${manageBasePath}/new`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox label="Show archived" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        <Link to={newPath}>
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add room type
          </Button>
        </Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {rooms === null && !error && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {rooms?.length === 0 && (
        <EmptyState
          icon={BedDouble}
          title="No room types yet"
          description="Add the rooms guests can book, such as a Deluxe King or a Family Room. Each room type has its own rates and stock."
          action={
            <Link to={newPath} className="text-sm font-medium text-brand-600 hover:underline">
              Add the first room type
            </Link>
          }
        />
      )}

      {rooms?.map((room) => {
        const [tone, label] = STATUS[room.status] ?? ['neutral', room.status];
        return (
          <Card key={room.id} className={room.status === 'ARCHIVED' ? 'opacity-70' : ''}>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-[var(--text-strong)]">{room.name}</h3>
                  <Badge tone={tone}>{label}</Badge>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{room.roomCode}</span>
                </div>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
                  <span>{room.totalUnits} room{room.totalUnits === 1 ? '' : 's'}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" /> Up to {room.maxOccupancy} guests
                  </span>
                  {room.bedType && <span className="capitalize">{room.bedType.toLowerCase().replace('_', ' ')} bed</span>}
                  <span>{room.imageCount} photo{room.imageCount === 1 ? '' : 's'}</span>
                </p>
                <p className="text-sm text-[var(--text-body)]">
                  {room.fromPriceMinor != null ? (
                    <>
                      From <span className="font-semibold">{formatMoney(room.fromPriceMinor)}</span>
                      <span className="text-[var(--text-muted)]"> / night</span>
                    </>
                  ) : (
                    <span className="text-[var(--text-muted)]">No upcoming prices set</span>
                  )}
                </p>
              </div>
              <Link to={`${manageBasePath}/${room.id}`}>
                <Button variant="secondary">Manage</Button>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
