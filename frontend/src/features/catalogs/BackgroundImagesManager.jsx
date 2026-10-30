import { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { Alert, Card, Skeleton } from '@/components/ui/surfaces.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function BackgroundSlot({ slot, image, onChanged }) {
  const [file, setFile] = useState(null);
  const [altText, setAltText] = useState(image?.altText ?? '');
  const [heroText, setHeroText] = useState(image?.heroText ?? '');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setAltText(image?.altText ?? '');
    setHeroText(image?.heroText ?? '');
  }, [image]);

  const upload = async () => {
    if (!file && !image) return;
    setSaving(true);
    try {
      await adminApi.uploadHomepageBackground(
        slot,
        file,
        { altText: altText.trim(), heroText: heroText.trim() },
        setProgress,
      );
      setFile(null);
      toast.success(`Background image ${slot} saved`);
      await onChanged();
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setSaving(false);
      setProgress(0);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await adminApi.deleteHomepageBackground(slot);
      toast.success(`Background image ${slot} removed`);
      await onChanged();
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-center">
      <div className="aspect-[16/7] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-slate-100">
        <SafeImage src={image?.url} alt={image?.altText || `Homepage background ${slot}`} className="h-full w-full object-cover" fallbackLabel={`Slot ${slot} is empty`} />
      </div>
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="font-semibold text-[var(--text-strong)]">Background {slot}</h3>
          <p className="text-xs text-[var(--text-muted)]">Recommended: 1920 × 700, JPEG or WebP, up to 5 MB.</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          <Input aria-label={`Background ${slot} accessibility description`} placeholder="Accessibility description" value={altText} maxLength={160} onChange={(event) => setAltText(event.target.value)} />
          <Input aria-label={`Background ${slot} homepage display text`} placeholder="Homepage display text" value={heroText} maxLength={160} onChange={(event) => setHeroText(event.target.value)} />
          <Input aria-label={`Choose background ${slot}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </div>
        {file && <p className="truncate text-xs text-[var(--text-muted)]">Selected: {file.name}{saving ? ` · ${progress}%` : ''}</p>}
      </div>
      <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
        <Button type="button" size="sm" loading={saving} disabled={!file && !image} onClick={upload}><ImagePlus className="h-4 w-4" /> {image ? (file ? 'Replace' : 'Save') : 'Upload'}</Button>
        {image && <Button type="button" size="sm" variant="danger-outline" disabled={saving} onClick={remove}><Trash2 className="h-4 w-4" /> Remove</Button>}
      </div>
    </div>
  );
}

export function BackgroundImagesManager() {
  const [images, setImages] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      setImages(await adminApi.listHomepageBackgrounds());
      setError(null);
    } catch (nextError) {
      setError(normalizeError(nextError).message);
    }
  };
  useEffect(() => { load(); }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!images) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="space-y-4">
      <div><h2 className="text-base font-semibold text-[var(--text-strong)]">Homepage background images</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Upload up to four images. They appear on the homepage in slot order and rotate automatically.</p></div>
      <Card className="divide-y divide-[var(--border-subtle)] overflow-hidden">
        {[1, 2, 3, 4].map((slot) => <BackgroundSlot key={slot} slot={slot} image={images.find((item) => item.slot === slot)} onChanged={load} />)}
      </Card>
    </div>
  );
}

