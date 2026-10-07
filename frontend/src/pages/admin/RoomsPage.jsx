import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/index.jsx';
import { RoomTypeList } from '@/features/rooms/components/RoomTypeList.jsx';

/** All room types of one hotel, with a link into each room's editor. */
export function RoomsPage() {
  const { hotelId } = useParams();
  return (
    <div className="space-y-6">
      <Link to={`/admin/hotels/${hotelId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to hotel
      </Link>
      <PageHeader title="Rooms" description="Room types, their photos, rate plans and availability. Each room type is sold separately." />
      <RoomTypeList hotelId={Number(hotelId)} manageBasePath={`/admin/hotels/${hotelId}/rooms`} />
    </div>
  );
}
