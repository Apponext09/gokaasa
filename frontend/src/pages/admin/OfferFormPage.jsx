import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';
import { BackLink, EmptyState, FormField, PageHeader, formatDateTime, formatMoney } from '@/components/shared/index.jsx';
import { minorToRupees, rupeesToMinor } from '@/features/rooms/roomForm.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const toInputDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

function emptyForm() {
  return {
    code: '', discountType: 'PERCENT', discountValue: '', maxDiscountMinor: '', minAmountMinor: '0',
    validFrom: '', validTo: '', usageLimit: '', perUserLimit: '', minNights: '', customerEligibility: 'ALL',
    stayFrom: '', stayTo: '', description: '', hotelIds: [], cities: '',
  };
}

function toForm(coupon) {
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountType === 'PERCENT' ? String(coupon.discountValue) : minorToRupees(coupon.discountValue),
    maxDiscountMinor: coupon.maxDiscountMinor == null ? '' : minorToRupees(coupon.maxDiscountMinor),
    minAmountMinor: minorToRupees(coupon.minAmountMinor) || '0',
    validFrom: toInputDate(coupon.validFrom),
    validTo: toInputDate(coupon.validTo),
    usageLimit: coupon.usageLimit ?? '',
    perUserLimit: coupon.perUserLimit ?? '',
    minNights: coupon.minNights ?? '',
    customerEligibility: coupon.customerEligibility,
    stayFrom: coupon.stayFrom ?? '',
    stayTo: coupon.stayTo ?? '',
    description: coupon.description ?? '',
    hotelIds: coupon.hotelIds ?? [],
    cities: (coupon.cities ?? []).join(', '),
  };
}

function toBody(form) {
  return {
    code: form.code.trim().toUpperCase(),
    discountType: form.discountType,
    discountValue: form.discountType === 'PERCENT' ? Number(form.discountValue) : rupeesToMinor(form.discountValue),
    maxDiscountMinor: form.maxDiscountMinor === '' ? null : rupeesToMinor(form.maxDiscountMinor),
    minAmountMinor: rupeesToMinor(form.minAmountMinor) ?? 0,
    validFrom: new Date(form.validFrom).toISOString(),
    validTo: new Date(form.validTo).toISOString(),
    usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
    perUserLimit: form.perUserLimit === '' ? null : Number(form.perUserLimit),
    minNights: form.minNights === '' ? null : Number(form.minNights),
    customerEligibility: form.customerEligibility,
    stayFrom: form.stayFrom || null,
    stayTo: form.stayTo || null,
    description: form.description.trim() || null,
    hotelIds: form.hotelIds,
    cities: form.cities.split(',').map((c) => c.trim()).filter(Boolean),
  };
}

export function OfferFormPage() {
  const { isSalesExecutive } = useAuth();
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState(null);
  const [hotels, setHotels] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [imageProgress, setImageProgress] = useState(0);
  const imageInputRef = useRef(null);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  useEffect(() => {
    adminApi.hotelLookup().then(setHotels).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) {
      setCoupon({});
      return;
    }
    let cancelled = false;
    adminApi.getCoupon(id).then((result) => {
      if (cancelled) return;
      setCoupon(result);
      setForm(toForm(result));
    }).catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
  }, [id, isNew]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleHotel = (hotelId) => setForm((f) => ({
    ...f,
    hotelIds: f.hotelIds.includes(hotelId) ? f.hotelIds.filter((h) => h !== hotelId) : [...f.hotelIds, hotelId],
  }));

  const chooseImage = (file) => {
    setImageError(null);
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setImageError('Only JPEG, PNG and WebP images can be uploaded.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Images must be 5 MB or smaller.');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    let saved = null;
    try {
      const body = toBody(form);
      saved = isNew ? await adminApi.createCoupon(body) : await adminApi.updateCoupon(id, body);
      if (imageFile) {
        setImageProgress(0);
        saved = await adminApi.uploadCouponImage(saved.id, imageFile, setImageProgress);
      }
      toast.success(isNew ? 'Coupon created' : 'Coupon updated');
      navigate(`/admin/offers/${saved.id}`, { replace: true });
    } catch (err) {
      const message = normalizeError(err).message;
      if (saved && isNew) {
        toast.error(`Coupon created, but its image could not be uploaded: ${message}`);
        navigate(`/admin/offers/${saved.id}`, { replace: true });
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    try {
      const updated = await adminApi.setCouponStatus(id, !coupon.isActive);
      setCoupon(updated);
      toast.success(updated.isActive ? 'Coupon activated' : 'Coupon deactivated');
    } catch (err) {
      toast.error(normalizeError(err).message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await adminApi.deleteCoupon(id);
      toast.success('Coupon deleted');
      navigate('/admin/offers', { replace: true });
    } catch (err) {
      toast.error(normalizeError(err).message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink to="/admin/offers">Back to offers</BackLink>
        <EmptyState title="We couldn't load this coupon" description={error} />
      </div>
    );
  }
  if (!coupon) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <BackLink to="/admin/offers">Back to offers</BackLink>
      <PageHeader
        title={isNew ? 'New coupon' : coupon.code}
        description={isNew ? 'Create a discount code customers can apply at checkout.' : 'Edit this coupon and review how it has been used.'}
        actions={!isNew && (
          <>
            <Badge tone={coupon.isActive ? 'success' : 'neutral'}>{coupon.isActive ? 'Active' : 'Inactive'}</Badge>
            <Button variant="secondary" size="sm" onClick={toggleActive}>{coupon.isActive ? 'Deactivate' : 'Activate'}</Button>
            {!isSalesExecutive && <Button variant="danger-outline" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</Button>}
          </>
        )}
      />

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Discount</CardTitle></CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <FormField id="code" label="Code">
              <Input id="code" required value={form.code} onChange={set('code')} className="font-mono uppercase" placeholder="SUMMER25" />
            </FormField>
            <FormField id="discountType" label="Type">
              <Select id="discountType" value={form.discountType} onChange={set('discountType')}>
                <option value="PERCENT">Percentage off</option>
                <option value="FIXED">Flat amount off</option>
              </Select>
            </FormField>
            <FormField id="discountValue" label={form.discountType === 'PERCENT' ? 'Discount (%)' : 'Discount (₹)'}>
              <Input id="discountValue" required type="number" min="1" max={form.discountType === 'PERCENT' ? 100 : undefined} value={form.discountValue} onChange={set('discountValue')} />
            </FormField>
            {form.discountType === 'PERCENT' && (
              <FormField id="maxDiscountMinor" label="Maximum discount (₹)" hint="Leave blank for no cap">
                <Input id="maxDiscountMinor" type="number" min="0" value={form.maxDiscountMinor} onChange={set('maxDiscountMinor')} />
              </FormField>
            )}
            <FormField id="minAmountMinor" label="Minimum booking amount (₹)">
              <Input id="minAmountMinor" type="number" min="0" value={form.minAmountMinor} onChange={set('minAmountMinor')} />
            </FormField>
            <FormField id="description" label="Description (internal note)" className="sm:col-span-2">
              <Textarea id="description" value={form.description} onChange={set('description')} rows={2} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Offer image</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-4 rounded-lg border border-dashed border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center">
              <SafeImage
                key={imagePreview ?? coupon.imageUrl ?? 'empty-offer-image'}
                src={imagePreview ?? coupon.imageUrl}
                alt="Offer preview"
                className="h-32 w-full shrink-0 rounded-lg sm:w-52"
                fallbackLabel="No offer image"
              />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-strong)]">Promotional card image</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">JPEG, PNG or WebP, up to 5 MB. A landscape image works best.</p>
                </div>
                <input
                  ref={imageInputRef}
                  id="offer-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => event.target.files?.[0] && chooseImage(event.target.files[0])}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {imageFile || coupon.imageUrl ? 'Change image' : 'Choose image'}
                </Button>
                {imageFile && <p className="text-xs text-[var(--text-muted)]">Selected: {imageFile.name}. It will upload when you save the coupon.</p>}
                {saving && imageFile && imageProgress > 0 && <p className="text-xs text-brand-700">Uploading image: {imageProgress}%</p>}
              </div>
            </div>
            {imageError && <Alert tone="error" className="mt-3">{imageError}</Alert>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Validity &amp; limits</CardTitle></CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <FormField id="validFrom" label="Valid from">
              <Input id="validFrom" required type="datetime-local" value={form.validFrom} onChange={set('validFrom')} />
            </FormField>
            <FormField id="validTo" label="Valid to">
              <Input id="validTo" required type="datetime-local" value={form.validTo} onChange={set('validTo')} />
            </FormField>
            <FormField id="usageLimit" label="Total usage limit" hint="Leave blank for unlimited">
              <Input id="usageLimit" type="number" min="1" value={form.usageLimit} onChange={set('usageLimit')} />
            </FormField>
            <FormField id="perUserLimit" label="Per-customer usage limit" hint="Leave blank for unlimited">
              <Input id="perUserLimit" type="number" min="1" value={form.perUserLimit} onChange={set('perUserLimit')} />
            </FormField>
            <FormField id="minNights" label="Minimum nights" hint="Leave blank for no minimum">
              <Input id="minNights" type="number" min="1" value={form.minNights} onChange={set('minNights')} />
            </FormField>
            <FormField id="customerEligibility" label="Customer eligibility">
              <Select id="customerEligibility" value={form.customerEligibility} onChange={set('customerEligibility')}>
                <option value="ALL">All customers</option>
                <option value="NEW_CUSTOMERS">New customers only</option>
              </Select>
            </FormField>
            <FormField id="stayFrom" label="Stay dates from" hint="Restricts which stay dates qualify, leave blank for any">
              <Input id="stayFrom" type="date" value={form.stayFrom} onChange={set('stayFrom')} />
            </FormField>
            <FormField id="stayTo" label="Stay dates to">
              <Input id="stayTo" type="date" value={form.stayTo} onChange={set('stayTo')} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Restrictions</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-0">
            <FormField id="cities" label="Destination (city) restriction" hint="Comma-separated city names. Leave blank for every destination.">
              <Input id="cities" value={form.cities} onChange={set('cities')} placeholder="Goa, Jaipur" />
            </FormField>
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text-strong)]">Hotel restriction</p>
              <p className="mb-2 text-xs text-[var(--text-muted)]">Leave every hotel unchecked to allow this coupon at all hotels.</p>
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
                {hotels.map((hotel) => (
                  <Checkbox key={hotel.id} label={`${hotel.name} (${hotel.city})`} checked={form.hotelIds.includes(hotel.id)} onChange={() => toggleHotel(hotel.id)} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>{isNew ? 'Create coupon' : 'Save changes'}</Button>
        </div>
      </form>

      {!isNew && (
        <Card>
          <CardHeader><CardTitle>Usage analytics</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Confirmed uses</p>
                <p className="text-xl font-semibold text-[var(--text-strong)]">{coupon.usage.confirmedCount}</p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
                <p className="text-xs text-[var(--text-muted)]">In progress</p>
                <p className="text-xl font-semibold text-[var(--text-strong)]">{coupon.usage.pendingCount}</p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Total discount given</p>
                <p className="text-xl font-semibold text-[var(--text-strong)]">{formatMoney(coupon.usage.totalDiscountMinor)}</p>
              </div>
            </div>
            {coupon.recentUsages.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Not used yet.</p>
            ) : (
              <Table minWidth="480px">
                <caption className="sr-only">Recent coupon usage</caption>
                <TableHeader>
                  <tr>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {coupon.recentUsages.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="font-medium text-[var(--text-strong)]">{u.customerName || u.customerEmail}</p>
                        <p className="text-xs text-[var(--text-muted)]">{u.bookingRef ?? 'Checkout not completed'} · {formatDateTime(u.createdAt)}</p>
                      </TableCell>
                      <TableCell><Badge tone={u.status === 'CONFIRMED' ? 'success' : u.status === 'PENDING' ? 'warning' : 'neutral'}>{u.status}</Badge></TableCell>
                      <TableCell className="text-right text-[var(--text-strong)]">{formatMoney(u.discountMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${coupon.code}?`}
        description="This cannot be undone. A coupon that has already been used cannot be deleted -- deactivate it instead."
        confirmLabel="Delete coupon"
        tone="danger"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
