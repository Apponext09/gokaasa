import { ExternalLink, Plus, Check } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';

const ROWS = [
  { key: 'name', label: 'Hotel name', hotelField: 'name' },
  { key: 'description', label: 'Description', hotelField: 'description' },
  { key: 'address', label: 'Address', hotelField: 'addressLine' },
  { key: 'city', label: 'City', hotelField: 'city' },
  { key: 'state', label: 'State', hotelField: 'state' },
  { key: 'country', label: 'Country', hotelField: null },
  { key: 'postalCode', label: 'Postal code', hotelField: 'postalCode' },
  { key: 'latitude', label: 'Latitude', hotelField: 'latitude' },
  { key: 'longitude', label: 'Longitude', hotelField: 'longitude' },
  { key: 'phone', label: 'Phone', hotelField: 'phone' },
  { key: 'website', label: 'Website', hotelField: 'website', link: true },
  { key: 'starRating', label: 'Star rating', hotelField: 'starRating' },
  { key: 'propertyType', label: 'Property type', hotelField: 'propertyType' },
];

const comparable = (value) => (value == null ? '' : String(value).trim().toUpperCase().replace(/\s+/g, '_'));

/** Display-only comparison. The authoritative rules (normalisation, provenance) live on the server. */
function compareState(external, hotelValue) {
  if (external == null || String(external).trim() === '') return { label: 'Not provided', tone: 'neutral' };
  if (hotelValue == null || String(hotelValue).trim() === '') return { label: 'Not in Gokaasa', tone: 'danger' };
  return comparable(external) === comparable(hotelValue) ? { label: 'Same', tone: 'success' } : { label: 'Different', tone: 'warning' };
}

/** LEFT side of the review workspace: exactly what the provider sent, with a comparison against Gokaasa. */
export function ExternalPanel({ external, hotel, onAddImage, addingUrl }) {
  const record = external?.record ?? {};
  const galleryUrls = new Set((hotel?.images ?? []).map((image) => image.sourceUrl).filter(Boolean));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{external.displayName}</CardTitle>
            <Badge tone="neutral">External</Badge>
          </div>
          <CardDescription>
            Provider record <span className="font-mono text-xs">{external.externalId}</span>. Values are shown as received.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="divide-y divide-[var(--border-subtle)]">
            {ROWS.map((row) => {
              const raw = record[row.key];
              const display = raw == null || raw === '' ? 'Not provided' : String(raw);
              const hotelValue = row.hotelField ? hotel?.[row.hotelField] : null;
              // Compare the normalised provider value (what Gokaasa would store) with the draft, not the raw text.
              const comparedValue = row.hotelField && record && external.normalized ? external.normalized[row.hotelField] : raw;
              const state = row.hotelField ? compareState(comparedValue, hotelValue) : null;
              return (
                <div key={row.key} className="grid grid-cols-[7.5rem_1fr_auto] items-start gap-3 px-5 py-3 text-sm">
                  <dt className="text-[var(--text-muted)]">{row.label}</dt>
                  <dd className="min-w-0 break-words text-[var(--text-body)]">
                    {row.link && raw ? (
                      <a href={raw} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                        {raw} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : (
                      display
                    )}
                  </dd>
                  <dd>{state && <Badge tone={state.tone}>{state.label}</Badge>}</dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amenities from provider</CardTitle>
          <CardDescription>Mapped to Gokaasa amenity codes on import. Edit the selection in the Amenities tab.</CardDescription>
        </CardHeader>
        <CardContent>
          {(record.amenities ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">The provider did not send amenities.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {record.amenities.map((label) => (
                <li key={label}>
                  <Badge tone="neutral">{label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images from provider</CardTitle>
          <CardDescription>Add the photos you want to keep. Only images in this record can be added.</CardDescription>
        </CardHeader>
        <CardContent>
          {(record.images ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">The provider did not send images.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {record.images.map((image) => {
                const inGallery = galleryUrls.has(image.url);
                return (
                  <li key={image.url} className="space-y-2">
                    <img src={image.url} alt={image.altText ?? ''} loading="lazy" className={cn('aspect-[4/3] w-full rounded-lg object-cover', !inGallery && 'opacity-60')} />
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[var(--text-muted)]">{String(image.category ?? 'other').toLowerCase()}</span>
                      {inGallery ? (
                        <span className="inline-flex items-center gap-1 text-success-600">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> In gallery
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" loading={addingUrl === image.url} disabled={!onAddImage} onClick={() => onAddImage(image.url)}>
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
