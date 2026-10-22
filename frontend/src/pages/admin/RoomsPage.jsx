import { useParams } from 'react-router-dom';
import { BackLink, PageHeader } from '@/components/shared/index.jsx';
import { RoomTypeList } from '@/features/rooms/components/RoomTypeList.jsx';

/** All room types of one hotel, with a link into each room's editor. */
export function RoomsPage() {
  const { hotelId } = useParams();
  return (
    <div className="space-y-6">
      <BackLink to={`/admin/hotels/${hotelId}`}>Back to hotel</BackLink>
      <PageHeader title="Rooms" description="Room types, their photos, rate plans and availability. Each room type is sold separately." />
      <RoomTypeList hotelId={Number(hotelId)} manageBasePath={`/admin/hotels/${hotelId}/rooms`} />
    </div>
  );
}
