import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { Tabs, TabPanel } from '@/components/ui/tabs.jsx';
import { BackLink, PageHeader } from '@/components/shared/index.jsx';
import { ImageGallery } from '@/features/hotels/components/ImageGallery.jsx';
import { AmenityPicker } from '@/features/hotels/components/AmenityPicker.jsx';
import { RoomDetailsForm } from '@/features/rooms/components/RoomDetailsForm.jsx';
import { RatePlansPanel } from '@/features/rooms/components/RatePlansPanel.jsx';
import { RateCalendar } from '@/features/rooms/components/RateCalendar.jsx';
import { BlocksPanel } from '@/features/rooms/components/BlocksPanel.jsx';
import { CancellationPoliciesPanel } from '@/features/rooms/components/CancellationPoliciesPanel.jsx';
import { EMPTY_ROOM_FORM, roomFormSchema, toRoomFormValues, toRoomPayload } from '@/features/rooms/roomForm.js';
import { roomApi, hotelApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';
import { useCatalog } from '@/features/catalogs/useCatalog.js';
import { toOptions } from '@/features/catalogs/catalogs.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';

const TABS = [
  { value: 'details', label: 'Details' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'images', label: 'Images' },
  { value: 'rates', label: 'Rate plans' },
  { value: 'availability', label: 'Availability' },
];

const STATUS_LABEL = { ACTIVE: 'Active', INACTIVE: 'Inactive', ARCHIVED: 'Archived' };

/** One room type: details, amenities, images, rate plans, and the availability calendar. */
export function RoomEditorPage() {
  const { isReviewExecutive } = useAuth();
  const { hotelId: hotelParam, roomId } = useParams();
  const hotelId = Number(hotelParam);
  const isNew = !roomId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = TABS;
  const requested = searchParams.get('tab');
  const tab = visibleTabs.some((item) => item.value === requested) ? requested : 'details';
  const setTab = (value) => setSearchParams((p) => new URLSearchParams({ ...Object.fromEntries(p), tab: value }), { replace: true });

  const [room, setRoom] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [savedAmenities, setSavedAmenities] = useState([]);
  const [saving, setSaving] = useState(false);
  const [codeLoading, setCodeLoading] = useState(isNew);
  const [codeError, setCodeError] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { items: roomCategories } = useCatalog('room-categories');
  const { items: bedTypes, loading: bedTypesLoading } = useCatalog('bed-types');

  const form = useForm({ resolver: zodResolver(roomFormSchema), defaultValues: EMPTY_ROOM_FORM, mode: 'onTouched' });
  const { handleSubmit, reset, formState } = form;
  const readOnly = isReviewExecutive || room?.status === 'ARCHIVED';
  const amenitiesDirty = selectedAmenities.slice().sort().join(',') !== savedAmenities.slice().sort().join(',');

  const apply = useCallback(
    (next) => {
      setRoom(next);
      reset(toRoomFormValues(next));
      const codes = next.amenities.map((a) => a.code);
      setSelectedAmenities(codes);
      setSavedAmenities(codes);
    },
    [reset],
  );

  // Refreshes server-side state (images, rates, calendar) without resetting the details form.
  const refresh = useCallback(async () => {
    if (roomId) setRoom(await roomApi.get(roomId));
  }, [roomId]);

  useEffect(() => {
    roomApi.policies(hotelId).then(setPolicies).catch(() => setPolicies([]));
    hotelApi.amenities().then(setCatalog).catch(() => setCatalog([]));
  }, [hotelId]);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    roomApi
      .get(roomId)
      .then((data) => !cancelled && apply(data))
      .catch((err) => !cancelled && setLoadError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [roomId, isNew, apply]);

  useEffect(() => {
    if (!isNew) return undefined;
    let cancelled = false;
    setCodeLoading(true);
    roomApi
      .nextCode(hotelId)
      .then((code) => {
        if (!cancelled) form.setValue('roomCode', code, { shouldValidate: true });
      })
      .catch((error) => {
        if (!cancelled) setCodeError(normalizeError(error).message);
      })
      .finally(() => {
        if (!cancelled) setCodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hotelId, isNew, form]);

  useEffect(() => {
    if (!isNew || bedTypesLoading) return;
    const current = form.getValues('bedType');
    if (current && !bedTypes.some((item) => item.code === current)) {
      form.setValue('bedType', '', { shouldValidate: true });
    }
  }, [bedTypes, bedTypesLoading, form, isNew]);

  const save = async (values) => {
    setSaving(true);
    try {
      const payload = toRoomPayload(values, { includeRoomCode: !isNew });
      if (isNew) {
        const created = await roomApi.create(hotelId, payload);
        toast.success('Room type created. Add its photos, rates and availability next.');
        navigate(`/admin/hotels/${hotelId}/rooms/${created.id}`, { replace: true });
        return;
      }
      await roomApi.update(roomId, payload);
      if (amenitiesDirty) await roomApi.setAmenities(roomId, selectedAmenities);
      apply(await roomApi.get(roomId));
      toast.success('Room saved');
    } catch (error) {
      const normalized = normalizeError(error);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
    } finally {
      setSaving(false);
    }
  };

  const saveAmenities = async () => {
    setSaving(true);
    try {
      await roomApi.setAmenities(roomId, selectedAmenities);
      apply(await roomApi.get(roomId));
      toast.success('Amenities saved');
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    setConfirmArchive(false);
    try {
      await roomApi.archive(roomId);
      toast.success('Room type archived. It is kept for history and hidden from guests.');
      navigate(`/admin/hotels/${hotelId}/rooms`, { replace: true });
    } catch (error) {
      toast.error(normalizeError(error).message);
    }
  };

  const backTo = `/admin/hotels/${hotelId}/rooms`;

  if (loadError) {
    return (
      <div className="space-y-4">
        <BackLink to={backTo}>Rooms</BackLink>
        <Alert tone="error" title="Room unavailable">{loadError}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink to={backTo}>Rooms</BackLink>

      <PageHeader
        title={isNew ? 'New room type' : room?.name ?? <Skeleton className="h-8 w-64" />}
        description={isNew ? 'Describe the room, its capacity, and how many you have. Rates and availability come next.' : `${room?.roomCode ?? ''} · ${room?.totalUnits ?? ''} room(s)`}
        actions={
          !isNew && room && (
            <div className="flex items-center gap-2">
              <Badge tone={room.status === 'ACTIVE' ? 'success' : room.status === 'INACTIVE' ? 'warning' : 'neutral'}>{STATUS_LABEL[room.status]}</Badge>
              {!readOnly && (
                <Button variant="danger-outline" size="sm" onClick={() => setConfirmArchive(true)}>
                  <Archive className="h-4 w-4" aria-hidden="true" /> Archive
                </Button>
              )}
            </div>
          )
        }
      />

      {isReviewExecutive && <Alert tone="info" title="Review mode">Room details, rates, and availability are read-only. Add any concerns in Internal review.</Alert>}
      {!isReviewExecutive && room?.status === 'ARCHIVED' && <Alert tone="info" title="Archived">This room type is read-only. Its history is kept.</Alert>}
      {codeError && <Alert tone="error" title="Room code unavailable">{codeError}</Alert>}

      {!isNew && (
        <Tabs label="Room sections" value={tab} onChange={setTab} items={visibleTabs} />
      )}

      {(isNew || tab === 'details') && (
        <TabPanel value="details" current={isNew ? 'details' : tab}>
          <form onSubmit={handleSubmit(save)} noValidate className="space-y-6">
            <RoomDetailsForm
              form={form}
              policies={policies}
              roomCategoryOptions={toOptions(roomCategories)}
              bedTypeOptions={toOptions(bedTypes)}
              allowInactiveBedType={!isNew}
              disabled={readOnly || saving}
              roomCodeReadOnly
            />
            <div className="sticky bottom-4 flex justify-end gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]/95 p-3 shadow-sm backdrop-blur">
              {formState.isDirty && <span className="self-center text-xs text-warning-600">Unsaved changes</span>}
              <Button type="submit" loading={saving || codeLoading} disabled={readOnly || codeLoading || Boolean(codeError)}>
                {isNew ? 'Create room type' : 'Save room'}
              </Button>
            </div>
          </form>
        </TabPanel>
      )}

      {!isNew && room && (
        <>
          <TabPanel value="amenities" current={tab}>
            <Card>
              <CardHeader>
                <CardTitle>Room amenities</CardTitle>
                <CardDescription>What is inside the room, such as air conditioning or a balcony. Hotel-wide facilities belong on the hotel.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <AmenityPicker
                  catalog={catalog}
                  selected={selectedAmenities}
                  disabled={readOnly || saving}
                  onSelectionChange={setSelectedAmenities}
                />
                <div className="flex justify-end">
                  <Button onClick={saveAmenities} loading={saving} disabled={readOnly || !amenitiesDirty}>Save amenities</Button>
                </div>
              </CardContent>
            </Card>
          </TabPanel>

          <TabPanel value="images" current={tab}>
            <Card>
              <CardHeader>
                <CardTitle>Room photos</CardTitle>
                <CardDescription>Shown in search results and on the room. Choose the cover yourself.</CardDescription>
              </CardHeader>
              <CardContent>
                <ImageGallery
                  images={room.images}
                  disabled={readOnly}
                  maxImages={15}
                  onChanged={refresh}
                  uploadHint="JPEG, PNG or WebP, up to 5 MB each."
                  adapter={{
                    name: 'room',
                    upload: (file, onProgress) => roomApi.uploadImage(roomId, file, onProgress),
                    replace: (image, file, onProgress) => roomApi.replaceImage(roomId, image.id, file, onProgress),
                    remove: (image) => roomApi.deleteImage(roomId, image.id),
                    setCover: (image) => roomApi.setCover(roomId, image.id),
                    reorder: (ids) => roomApi.reorderImages(roomId, ids),
                  }}
                />
              </CardContent>
            </Card>
          </TabPanel>

          <TabPanel value="rates" current={tab}>
            <RatePlansPanel roomId={roomId} policies={policies} disabled={readOnly} onChanged={refresh} />
            <CancellationPoliciesPanel hotelId={hotelId} disabled={readOnly} />
          </TabPanel>

          <TabPanel value="availability" current={tab}>
            <RateCalendar roomId={roomId} room={room} plans={room.ratePlans} disabled={readOnly} onChanged={refresh} />
            <BlocksPanel roomId={roomId} disabled={readOnly} onChanged={refresh} />
          </TabPanel>
        </>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${room?.name ?? 'this room'}?`}
        description="Guests will no longer see it. Its rates and history are kept. This is refused while guests hold upcoming stays here."
        confirmLabel="Archive room type"
        onConfirm={archive}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  );
}
