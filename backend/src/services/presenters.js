import { getStorage } from '../storage/index.js';

/** Maps database rows to the camelCase shapes the API returns. Keeps internal columns out of responses. */

export function toImage(row) {
  return {
    id: row.id,
    category: row.category,
    origin: row.origin,
    url: row.origin === 'UPLOADED' && row.storage_key ? getStorage().publicUrl(row.storage_key) : row.source_url,
    sourceUrl: row.origin === 'IMPORTED' ? row.source_url : null,
    sourceProvider: row.source_provider,
    altText: row.alt_text,
    mimeType: row.mime_type ?? null,
    byteSize: row.byte_size ?? null,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
  };
}

export function toHotelSummary(row, { includeInternal = false } = {}) {
  const summary = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    propertyType: row.property_type,
    starRating: row.star_rating,
    guestRating: row.guest_rating,
    reviewCount: row.review_count,
    area: row.area,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    roomTypeCount: row.room_type_count ?? 0,
    coverImageId: row.cover_image_id ?? null,
    updatedAt: row.updated_at,
  };

  if (includeInternal) {
    Object.assign(summary, {
      status: row.status,
      publishedAt: row.published_at,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      externalProvider: row.external_provider,
      externalId: row.external_id,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    });
  }
  return summary;
}

export function toHotelDetail(row, { amenities = [], images = [], blockers = null, fieldStates = null, importJobId = null, includeInternal = false } = {}) {
  return {
    ...toHotelSummary(row, { includeInternal }),
    description: row.description,
    postalCode: row.postal_code,
    phone: row.phone,
    email: row.email,
    website: row.website,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    amenities: amenities.map((amenity) => ({ code: amenity.code, name: amenity.name, category: amenity.category })),
    images: images.map(toImage),
    ...(blockers ? { publishBlockers: blockers } : {}),
    ...(fieldStates ? { fieldStates } : {}),
    ...(includeInternal ? { latestImportJobId: importJobId } : {}),
  };
}

export function toImportJob(row, { includeDetails = false } = {}) {
  const job = {
    id: row.id,
    searchQuery: row.search_query,
    provider: row.provider,
    externalHotelId: row.external_hotel_id,
    status: row.status,
    attempts: row.attempts,
    hotelId: row.hotel_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    createdByName: row.created_by_name ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    // Processing time only (worker start to finish). Queue waiting is excluded on purpose.
    durationMs: row.started_at && row.finished_at ? new Date(row.finished_at) - new Date(row.started_at) : null,
  };
  if (includeDetails) {
    job.normalizedData = row.normalized_data;
    job.rawResponse = row.raw_response;
  }
  return job;
}

export function toPage(items, total, page, limit) {
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
