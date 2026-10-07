import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PageHeader } from '@/components/shared/index.jsx';
import { HotelWorkspace } from '@/features/hotels/HotelWorkspace.jsx';
import { HotelFieldsForm } from '@/features/hotels/components/HotelFieldsForm.jsx';
import { EMPTY_HOTEL_FORM, TAB_FIELDS, hotelFormSchema, toPayload } from '@/features/hotels/hotelForm.js';
import { adminApi } from '@/services/endpoints.js';
import { applyServerFieldErrors, normalizeError } from '@/services/api.js';

/** Creates a hotel by hand. Everything else is edited in the workspace once the draft exists. */
function NewHotelPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm({ resolver: zodResolver(hotelFormSchema), defaultValues: EMPTY_HOTEL_FORM, mode: 'onTouched' });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const hotel = await adminApi.createHotel(toPayload(values));
      toast.success('Draft created. Add images and amenities next.');
      navigate(`/admin/hotels/${hotel.id}`, { replace: true });
    } catch (error) {
      const normalized = normalizeError(error);
      if (!applyServerFieldErrors(form, normalized)) toast.error(normalized.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/hotels" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All hotels
      </Link>
      <PageHeader title="New hotel" description="Create a draft by hand. Drafts stay private until you publish them." />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Hotel details</CardTitle>
            <CardDescription>You can complete the rest after the draft is created.</CardDescription>
          </CardHeader>
          <CardContent>
            <HotelFieldsForm fields={[...TAB_FIELDS.overview, ...TAB_FIELDS.location]} form={form} hotel={null} />
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={submitting}>
            Create draft
          </Button>
        </div>
      </form>
    </div>
  );
}

export function HotelEditorPage() {
  const { id } = useParams();
  if (!id) return <NewHotelPage />;
  return (
    <div className="space-y-6">
      <Link to="/admin/hotels" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All hotels
      </Link>
      <HotelWorkspace hotelId={Number(id)} />
    </div>
  );
}
