import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Archive, ArrowRight, CheckCircle2, Globe, RefreshCw, Save, Send, ShieldCheck, Lock } from 'lucide-react';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { Tabs, TabPanel } from '@/components/ui/tabs.jsx';
import { EmptyState, HotelStatusBadge, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { EMPTY_HOTEL_FORM, TAB_FIELDS, hotelFormSchema, toFormValues, toPayload } from '@/features/hotels/hotelForm.js';
import { HotelFieldsForm } from '@/features/hotels/components/HotelFieldsForm.jsx';
import { ImageGallery, IMAGE_CATEGORY_OPTIONS } from '@/features/hotels/components/ImageGallery.jsx';
import { AmenityPicker } from '@/features/hotels/components/AmenityPicker.jsx';
import { ImportHistory } from '@/features/hotels/components/ImportHistory.jsx';
import { RoomTypeList } from '@/features/rooms/components/RoomTypeList.jsx';
import { CancellationPoliciesPanel } from '@/features/rooms/components/CancellationPoliciesPanel.jsx';
import { ManagersPanel } from '@/features/hotels/components/ManagersPanel.jsx';
import { adminApi, hotelApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

const FORM_ID = 'hotel-workspace-form';

// Server calls for hotel photos, handed to the shared gallery.
function hotelImageAdapter(hotelId) {
  return {
    name: 'hotel',
    upload: (file, onProgress) => adminApi.uploadImage(hotelId, file, { category: 'OTHER' }, onProgress),
    remove: (image) => adminApi.deleteImage(hotelId, image.id),
    setCover: (image) => adminApi.setCover(hotelId, image.id),
    reorder: (imageIds) => adminApi.reorderImages(hotelId, imageIds),
    setCategory: (image, category) => adminApi.updateImage(hotelId, image.id, { category }),
  };
}
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'location', label: 'Location' },
  { value: 'images', label: 'Images' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'policies', label: 'Policies' },
  { value: 'history', label: 'Import history' },
];
const NEXT_TAB = { overview: 'location', location: 'images', images: 'amenities', amenities: 'rooms', rooms: 'policies', policies: 'history', history: 'history' };

// Publishing an unpublished hotel walks the server's state machine one step at a time. Each step is
// audited, and the server rejects any step that is not allowed from the current state.
const PUBLISH_PATH = {
  DRAFT: ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH'],
  PENDING_REVIEW: ['MARK_READY', 'PUBLISH'],
  READY_TO_PUBLISH: ['PUBLISH'],
  UNPUBLISHED: ['PUBLISH'],
};

const DONE_MESSAGE = {
  SUBMIT_FOR_REVIEW: 'Submitted for review',
  MARK_READY: 'Marked ready to publish',
  PUBLISH: 'Hotel is live',
  UNPUBLISH: 'Hotel unpublished',
  ARCHIVE: 'Hotel archived',
};

function ValidationSummary({ hotel }) {
  if (!hotel) return null;
  const blockers = hotel.publishBlockers ?? [];
  if (hotel.status === 'PUBLISHED') {
    return (
      <p className="flex items-center gap-2 text-sm text-success-600">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Live on Gokaasa.
      </p>
    );
  }
  if (blockers.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success-600">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Every publishing requirement is met.
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-[var(--text-muted)]">Still needed before publishing:</p>
      <ul className="flex flex-wrap gap-1.5">
        {blockers.map((item) => (
          <li key={item}>
            <Badge tone="warning">{item}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The hotel editing workspace: tabs, one shared form, provenance-aware fields, gallery, amenities,
 * import history, and a sticky action bar. Rules (publish gate, provenance, transitions) are enforced
 * by the API; this component only sequences requests and shows the results.
 */
export function HotelWorkspace({ hotelId, sidePanel = null, extraActions = null }) {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.value === requestedTab) ? requestedTab : 'overview';
  const setTab = (value) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', value);
      return next;
    }, { replace: true });

  const [hotel, setHotel] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [savedAmenities, setSavedAmenities] = useState([]);
  const [busy, setBusy] = useState(null);
  const [busyField, setBusyField] = useState(null);
  const [addingUrl, setAddingUrl] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const form = useForm({ resolver: zodResolver(hotelFormSchema), defaultValues: EMPTY_HOTEL_FORM, mode: 'onTouched' });
  const { formState, reset, register, handleSubmit } = form;

  const amenitiesDirty = selectedAmenities.slice().sort().join(',') !== savedAmenities.slice().sort().join(',');
  const hasUnsaved = formState.isDirty || amenitiesDirty;
  const readOnly = hotel?.status === 'ARCHIVED';

  const applyHotel = useCallback(
    (next) => {
      setHotel(next);
      reset(toFormValues(next));
      const codes = next.amenities.map((amenity) => amenity.code);
      setSelectedAmenities(codes);
      setSavedAmenities(codes);
    },
    [reset],
  );

  // Refreshes server-side state (images, field states, blockers) without discarding unsaved typing.
  const refreshKeepingDraft = useCallback(async () => {
    setHotel(await adminApi.getHotel(hotelId));
  }, [hotelId]);

  useEffect(() => {
    let cancelled = false;
    setHotel(null);
    setLoadError(null);
    adminApi
      .getHotel(hotelId)
      .then((data) => {
        if (!cancelled) applyHotel(data);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(normalizeError(error).message);
      });
    hotelApi.amenities().then((items) => !cancelled && setCatalog(items)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hotelId, applyHotel]);

  // Saves the form. Returns true only when the server accepted every change.
  const persist = async (values) => {
    setBusy('save');
    try {
      let updated = await adminApi.updateHotel(hotelId, toPayload(values));
      if (amenitiesDirty) updated = await adminApi.setHotelAmenities(hotelId, selectedAmenities);
      applyHotel(updated);
      return true;
    } catch (error) {
      const normalized = normalizeError(error);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    let ok = false;
    await handleSubmit(async (values) => {
      ok = await persist(values);
    })();
    return ok;
  };

  const runTransitions = async (actions) => {
    if (hasUnsaved && !(await saveDraft())) return;
    setBusy(actions[0]);
    let completed = 0;
    try {
      for (const action of actions) {
        await adminApi.transitionHotel(hotelId, action);
        completed += 1;
      }
      toast.success(DONE_MESSAGE[actions[completed - 1]]);
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.details?.length) {
        toast.error('This hotel is not ready yet', { description: normalized.details.map((detail) => detail.message).join(' · ') });
      } else {
        toast.error(normalized.message);
      }
    } finally {
      setBusy(null);
      if (completed > 0) setHotel(await adminApi.getHotel(hotelId));
    }
  };

  const handleSubmitForReview = () => {
    if (!['DRAFT', 'UNPUBLISHED'].includes(hotel.status)) {
      toast.info(`This hotel is already ${hotel.status.toLowerCase().replaceAll('_', ' ')}`);
      return;
    }
    runTransitions(['SUBMIT_FOR_REVIEW']);
  };

  const handlePublish = () => {
    if (!isAdmin) {
      toast.info('Only administrators can publish hotels');
      return;
    }
    const path = PUBLISH_PATH[hotel.status];
    if (!path) {
      toast.info('This hotel is already live');
      return;
    }
    // With unsaved edits the server's blockers may be stale, so the save runs first and the server decides.
    if (!hasUnsaved && hotel.publishBlockers?.length) {
      toast.error('This hotel is not ready yet', { description: hotel.publishBlockers.join(' · ') });
      return;
    }
    setConfirm({ title: `Publish ${hotel.name}?`, description: 'Customers will see this hotel as soon as it is live. Every step is recorded in the audit log.', confirmLabel: 'Publish hotel', tone: 'primary', actions: path });
  };

  const verifyField = async (field) => {
    setBusyField(field);
    try {
      setHotel(await adminApi.verifyFields(hotelId, [field]));
      toast.success('Field verified');
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusyField(null);
    }
  };

  const suggestionAction = async (field, accept) => {
    if (hasUnsaved) {
      toast.info('Save your changes first, then decide on the provider value.');
      return;
    }
    setBusyField(field);
    try {
      const updated = accept ? await adminApi.acceptSuggestion(hotelId, field) : await adminApi.dismissSuggestion(hotelId, field);
      applyHotel(updated);
      toast.success(accept ? 'Provider value accepted' : 'Your value was kept');
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusyField(null);
    }
  };

  const syncFromProvider = async () => {
    if (hasUnsaved) {
      toast.info('Save your changes first, then refresh from the provider.');
      return;
    }
    setBusy('sync');
    try {
      const result = await adminApi.syncExternal(hotelId);
      applyHotel(result.hotel);
      const applied = result.applied.length;
      const suggested = result.suggested.length;
      toast.success('Provider data checked', {
        description: `${applied} field(s) updated. ${suggested} provider change(s) need your decision.`,
      });
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusy(null);
    }
  };

  const addProviderImage = async (url) => {
    setAddingUrl(url);
    try {
      await adminApi.addProviderImage(hotelId, url);
      toast.success('Image added to the gallery');
      await refreshKeepingDraft();
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setAddingUrl(null);
    }
  };

  const onConfirm = async () => {
    const current = confirm;
    setConfirm(null);
    await runTransitions(current.actions);
  };

  if (loadError) return <Alert tone="error" title="Hotel unavailable">{loadError}</Alert>;
  if (!hotel) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const blockers = hotel.publishBlockers ?? [];
  const imageCount = hotel.images.length;
  const isImported = Boolean(hotel.externalProvider);

  const body = (
    <div className="space-y-6">
      <TabPanel value="overview" current={tab}>
        <Card>
          <CardHeader>
            <CardTitle>Hotel details</CardTitle>
            <CardDescription>Name, rating and contact details as guests will see them.</CardDescription>
          </CardHeader>
          <CardContent>
            <HotelFieldsForm
              fields={TAB_FIELDS.overview}
              form={form}
              hotel={hotel}
              disabled={readOnly}
              busyField={busyField}
              onVerify={verifyField}
              onAcceptSuggestion={(field) => suggestionAction(field, true)}
              onDismissSuggestion={(field) => suggestionAction(field, false)}
            />
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Hotel managers</CardTitle>
              <CardDescription>Only assigned managers (and administrators) can manage this hotel.</CardDescription>
            </CardHeader>
            <CardContent>
              <ManagersPanel hotelId={hotelId} />
            </CardContent>
          </Card>
        )}
      </TabPanel>

      <TabPanel value="location" current={tab}>
        <Card>
          <CardHeader>
            <CardTitle>Address and map position</CardTitle>
            <CardDescription>Shown to guests on the hotel page. Coordinates place the hotel on the map.</CardDescription>
          </CardHeader>
          <CardContent>
            <HotelFieldsForm
              fields={TAB_FIELDS.location}
              form={form}
              hotel={hotel}
              disabled={readOnly}
              busyField={busyField}
              onVerify={verifyField}
              onAcceptSuggestion={(field) => suggestionAction(field, true)}
              onDismissSuggestion={(field) => suggestionAction(field, false)}
            />
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value="images" current={tab}>
        <Card>
          <CardHeader>
            <CardTitle>Gallery</CardTitle>
            <CardDescription>Imported photos and your uploads. Choose the cover explicitly; the first photo is never assumed.</CardDescription>
          </CardHeader>
          <CardContent>
            <ImageGallery
              images={hotel.images}
              disabled={readOnly}
              onChanged={refreshKeepingDraft}
              categories={IMAGE_CATEGORY_OPTIONS}
              maxImages={30}
              adapter={hotelImageAdapter(hotelId)}
            />
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value="amenities" current={tab}>
        <Card>
          <CardHeader>
            <CardTitle>Amenities</CardTitle>
            <CardDescription>Select what guests can use. Changes are saved with the draft.</CardDescription>
          </CardHeader>
          <CardContent>
            <AmenityPicker
              catalog={catalog}
              selected={selectedAmenities}
              disabled={readOnly}
              onToggle={(code, checked) =>
                setSelectedAmenities((current) => (checked ? [...new Set([...current, code])] : current.filter((item) => item !== code)))
              }
            />
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value="rooms" current={tab}>
        <RoomTypeList hotelId={hotelId} manageBasePath={`/admin/hotels/${hotelId}/rooms`} />
      </TabPanel>

      <TabPanel value="policies" current={tab}>
        <CancellationPoliciesPanel hotelId={hotelId} disabled={readOnly} />
      </TabPanel>

      <TabPanel value="history" current={tab}>
        <ImportHistory hotelId={hotelId} />
      </TabPanel>
    </div>
  );

  return (
    <div className="space-y-6 pb-28">
      <PageHeader
        title={hotel.name}
        description={`Last updated ${formatDateTime(hotel.updatedAt)}${isImported ? ` · imported from ${hotel.externalProvider}` : ' · created by hand'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <HotelStatusBadge status={hotel.status} />
            {isImported && <Badge tone="brand">Imported</Badge>}
            {isImported && (
              <Button variant="secondary" size="sm" loading={busy === 'sync'} disabled={readOnly || busy !== null} onClick={syncFromProvider}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Check provider
              </Button>
            )}
            {isAdmin && hotel.status === 'PUBLISHED' && (
              <Button variant="danger-outline" size="sm" onClick={() => setConfirm({ title: `Unpublish ${hotel.name}?`, description: 'Customers will no longer see this hotel. You can publish it again later.', confirmLabel: 'Unpublish', tone: 'danger', actions: ['UNPUBLISH'] })}>
                <Globe className="h-4 w-4" aria-hidden="true" /> Unpublish
              </Button>
            )}
            {isAdmin && !readOnly && (
              <Button variant="danger-outline" size="sm" onClick={() => setConfirm({ title: `Archive ${hotel.name}?`, description: 'Archived hotels disappear from customer search and become read-only.', confirmLabel: 'Archive hotel', tone: 'danger', actions: ['ARCHIVE'] })}>
                <Archive className="h-4 w-4" aria-hidden="true" /> Archive
              </Button>
            )}
          </div>
        }
      />

      {readOnly && (
        <Alert tone="info" title="This hotel is archived">
          <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Archived hotels are read-only.</span>
        </Alert>
      )}

      <Card>
        <CardContent className="p-5">
          <ValidationSummary hotel={hotel} />
        </CardContent>
      </Card>

      <Tabs
        label="Hotel sections"
        value={tab}
        onChange={setTab}
        items={TABS.map((item) => ({
          ...item,
          badge: item.value === 'images' ? imageCount : item.value === 'amenities' ? selectedAmenities.length : undefined,
        }))}
      />

      <form id={FORM_ID} noValidate onSubmit={handleSubmit((values) => persist(values))} className={cn(sidePanel && 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
        {sidePanel && <aside className="space-y-6 xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">{sidePanel(hotel, { addProviderImage, addingUrl })}</aside>}
        <div className="min-w-0">
          <fieldset disabled={readOnly} className="min-w-0 space-y-6">
            {body}
          </fieldset>
        </div>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]/95 backdrop-blur md:left-[var(--admin-sidebar-width,15rem)] transition-[left] duration-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            {hasUnsaved ? (
              <span className="font-medium text-warning-600">Unsaved changes</span>
            ) : (
              'All changes saved'
            )}
            {blockers.length > 0 && hotel.status !== 'PUBLISHED' && ` · ${blockers.length} item(s) to publish`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {extraActions}
            <Button type="submit" form={FORM_ID} variant="secondary" loading={busy === 'save'} disabled={readOnly || busy !== null}>
              <Save className="h-4 w-4" aria-hidden="true" /> Save draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={readOnly || busy !== null || !NEXT_TAB[tab] || NEXT_TAB[tab] === tab}
              onClick={async () => {
                if (await saveDraft()) setTab(NEXT_TAB[tab]);
              }}
            >
              Save & continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" loading={busy === 'SUBMIT_FOR_REVIEW'} disabled={readOnly || busy !== null || !['DRAFT', 'UNPUBLISHED'].includes(hotel.status)} onClick={handleSubmitForReview}>
              <Send className="h-4 w-4" aria-hidden="true" /> Submit for review
            </Button>
            <Button
              variant="primary"
              disabled={!isAdmin || readOnly || busy !== null || hotel.status === 'PUBLISHED' || (!hasUnsaved && blockers.length > 0)}
              loading={busy !== null && PUBLISH_PATH[hotel.status]?.includes(busy)}
              onClick={handlePublish}
              title={!isAdmin ? 'Only administrators can publish' : blockers.length ? `Complete: ${blockers.join(', ')}` : undefined}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Publish
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        loading={busy !== null}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
