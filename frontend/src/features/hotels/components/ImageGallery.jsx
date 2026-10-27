import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, GripVertical, ImageOff, ImagePlus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Alert } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Select } from '@/components/ui/form-controls.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/dialog.jsx';
import { EmptyState } from '@/components/shared/index.jsx';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

export const IMAGE_CATEGORY_OPTIONS = [
  { value: 'EXTERIOR', label: 'Exterior' },
  { value: 'LOBBY', label: 'Lobby' },
  { value: 'ROOM', label: 'Room' },
  { value: 'BATHROOM', label: 'Bathroom' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'POOL', label: 'Pool' },
  { value: 'GYM', label: 'Gym' },
  { value: 'SPA', label: 'Spa' },
  { value: 'OTHER', label: 'Other' },
];

// Mirrors the server limits. The server enforces them; this only avoids a wasted upload.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Only JPEG, PNG and WebP images can be uploaded';
  if (file.size > MAX_UPLOAD_BYTES) return 'Images must be 5 MB or smaller';
  return null;
}

/**
 * Gallery management shared by hotels and room types. `adapter` supplies the server calls, so the same UI
 * manages hotel photos and room photos without a second implementation.
 *   adapter = { upload(file, onProgress), remove(image), setCover(image), reorder(ids), setCategory?(image, value) }
 */
export function ImageGallery({ images, disabled, onChanged, adapter, categories = null, maxImages = 30, uploadHint }) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const [replaceTarget, setReplaceTarget] = useState(null);

  const run = async (id, action, success) => {
    setBusyId(id);
    try {
      await action();
      if (success) toast.success(success);
      await onChanged();
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setUploadError(`Maximum of ${maxImages} images already reached.`);
      return;
    }

    let filesToUpload = Array.from(fileList);
    if (filesToUpload.length > remainingSlots) {
      toast.warning(`Only ${remainingSlots} more image(s) can be added. Extra images were skipped.`);
      filesToUpload = filesToUpload.slice(0, remainingSlots);
    }

    setUploading(true);
    let successCount = 0;
    const errors = [];

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const problem = validateImageFile(file);
        if (problem) {
          errors.push(`${file.name}: ${problem}`);
          continue;
        }

        setUploadStatus(
          filesToUpload.length > 1
            ? `Uploading ${i + 1} of ${filesToUpload.length}…`
            : 'Uploading…'
        );

        try {
          await adapter.upload(file, (pct) => {
            if (pct != null) {
              setUploadStatus(
                filesToUpload.length > 1
                  ? `Uploading ${i + 1} of ${filesToUpload.length} (${pct}%)`
                  : `Uploading ${pct}%`
              );
            }
          });
          successCount++;
        } catch (err) {
          errors.push(`${file.name}: ${normalizeError(err).message}`);
        }
      }

      if (successCount > 0) {
        toast.success(
          successCount === 1 ? 'Image uploaded' : `${successCount} images uploaded`
        );
        await onChanged();
      }

      if (errors.length > 0) {
        setUploadError(errors.join(' • '));
      }
    } finally {
      setUploading(false);
      setUploadStatus(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const triggerReplace = (image) => {
    setReplaceTarget(image);
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
      replaceInputRef.current.click();
    }
  };

  const handleReplaceFile = async (file) => {
    if (!file || !replaceTarget) return;
    const target = replaceTarget;

    const problem = validateImageFile(file);
    if (problem) {
      toast.error(problem);
      setReplaceTarget(null);
      return;
    }

    setBusyId(target.id);
    try {
      if (adapter.replace) {
        await adapter.replace(target, file);
      } else {
        const newImg = await adapter.upload(file);
        if (target.isCover && adapter.setCover) await adapter.setCover(newImg);
        if (target.category && adapter.setCategory) await adapter.setCategory(newImg, target.category);
        const nextIds = images.map((img) => (img.id === target.id ? newImg.id : img.id));
        if (adapter.reorder) await adapter.reorder(nextIds);
        await adapter.remove(target);
      }
      toast.success('Photo replaced successfully');
      await onChanged();
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setBusyId(null);
      setReplaceTarget(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const moveTo = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= images.length || fromIndex === toIndex) return;
    const next = [...images];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    run(null, () => adapter.reorder(next.map((image) => image.id)));
  };

  const onDrop = (targetIndex) => {
    const fromIndex = images.findIndex((image) => image.id === dragId);
    setDragId(null);
    if (fromIndex >= 0) moveTo(fromIndex, targetIndex);
  };

  const confirmDelete = () => {
    const image = pendingDelete;
    setPendingDelete(null);
    run(image.id, () => adapter.remove(image), 'Image deleted');
  };

  const cover = images.find((image) => image.isCover);
  const full = images.length >= maxImages;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium text-[var(--text-strong)]">Upload photos</p>
          <p className="text-[var(--text-muted)]">
            {uploadHint ?? 'JPEG, PNG or WebP, up to 5 MB each.'} {images.length} of {maxImages} used.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            id={`image-upload-${adapter.name ?? 'gallery'}`}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || uploading || full}
            onChange={(event) => event.target.files && handleFiles(event.target.files)}
          />
          <Button type="button" variant="secondary" loading={uploading} disabled={disabled || full} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" aria-hidden="true" /> {uploading ? (uploadStatus ?? 'Uploading…') : 'Upload photos'}
          </Button>
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => event.target.files?.[0] && handleReplaceFile(event.target.files[0])}
          />
        </div>
      </div>

      {uploadError && <Alert tone="error">{uploadError}</Alert>}

      {images.length === 0 ? (
        <EmptyState icon={ImageOff} title="No images yet" description="Add at least one photo. Choose the cover yourself." />
      ) : (
        <>
          {!cover && (
            <Alert tone="warning" title="No cover selected">
              Choose one image as the cover. Gokaasa never picks it for you.
            </Alert>
          )}
          <ol className="space-y-3" aria-label="Images, in display order">
            {images.map((image, index) => (
              <li
                key={image.id}
                draggable={!disabled}
                onDragStart={() => setDragId(image.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(index)}
                onDragEnd={() => setDragId(null)}
                className={cn(
                  'grid grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-lg border bg-[var(--surface-card)] p-3',
                  image.isCover ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-[var(--border-subtle)]',
                  dragId === image.id && 'opacity-60',
                )}
              >
                <img
                  src={image.url}
                  alt={image.altText ?? `Photo ${index + 1}`}
                  loading="lazy"
                  className="h-24 w-28 rounded-md bg-[var(--surface-muted)] object-cover"
                />

                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <GripVertical className="h-4 w-4 cursor-grab text-[var(--text-muted)]" aria-hidden="true" />
                    <span className="font-medium text-[var(--text-strong)]">Photo {index + 1}</span>
                    {image.isCover && <Badge tone="brand">Cover</Badge>}
                    {image.origin && (
                      <Badge tone={image.origin === 'UPLOADED' ? 'neutral' : 'brand'}>
                        {image.origin === 'UPLOADED' ? 'Uploaded' : `From ${image.sourceProvider ?? 'provider'}`}
                      </Badge>
                    )}
                    <Badge tone={image.imageType === 'ILLUSTRATIVE' ? 'warning' : 'success'}>
                      {image.imageType === 'ILLUSTRATIVE' ? 'Illustrative' : 'Real property'}
                    </Badge>
                  </div>
                  {categories && adapter.setCategory && (
                    <Select
                      aria-label={`Category for photo ${index + 1}`}
                      value={image.category}
                      disabled={disabled || busyId === image.id}
                      className="h-9 max-w-xs"
                      onChange={(event) => run(image.id, () => adapter.setCategory(image, event.target.value), 'Category updated')}
                    >
                      {categories.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  )}
                </div>

                <div className="col-span-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-3">
                  <Button variant="ghost" size="icon" aria-label={`Move photo ${index + 1} up`} disabled={disabled || index === 0} onClick={() => moveTo(index, index - 1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move photo ${index + 1} down`} disabled={disabled || index === images.length - 1} onClick={() => moveTo(index, index + 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Preview photo ${index + 1}`} onClick={() => setPreview(image)}>
                    <Eye className="h-4 w-4" aria-hidden="true" /> Preview
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || image.isCover}
                    loading={busyId === image.id && !image.isCover}
                    onClick={() => run(image.id, () => adapter.setCover(image), 'Cover image updated')}
                  >
                    <Star className="h-4 w-4" aria-hidden="true" /> {image.isCover ? 'Cover' : 'Set as cover'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled || busyId === image.id}
                    loading={busyId === image.id && replaceTarget?.id === image.id}
                    aria-label={`Replace photo ${index + 1}`}
                    onClick={() => triggerReplace(image)}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Replace
                  </Button>
                  <Button
                    variant="danger-outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => (image.origin === 'IMPORTED' ? run(image.id, () => adapter.remove(image), 'Removed from gallery') : setPendingDelete(image))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> {image.origin === 'IMPORTED' ? 'Remove' : 'Delete'}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-[var(--text-muted)]">Drag photos or use the arrows to change their order.</p>
        </>
      )}

      <Modal open={preview !== null} title={preview ? 'Photo preview' : ''} onClose={() => setPreview(null)} wide>
        {preview && (
          <div className="space-y-3">
            <img src={preview.url} alt={preview.altText ?? ''} className="max-h-[70vh] w-full rounded-lg bg-[var(--surface-muted)] object-contain" />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this uploaded photo?"
        description="The file is removed from storage. This cannot be undone."
        confirmLabel="Delete photo"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
