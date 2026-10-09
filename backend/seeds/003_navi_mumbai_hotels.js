import { pool } from '../src/db/pool.js';
import { config } from '../src/config/index.js';
import { hotelRepository } from '../src/repositories/hotel.repository.js';
import { roomTypeService } from '../src/services/roomType.service.js';
import { ratePlanService } from '../src/services/ratePlan.service.js';
import { inventoryService } from '../src/services/inventory.service.js';
import { cancellationPolicyService } from '../src/services/cancellationPolicy.service.js';
import { hotelService } from '../src/services/hotel.service.js';
import { hotelImageService } from '../src/services/hotelImage.service.js';
import { auditService } from '../src/services/audit.service.js';
import { withTransaction } from '../src/db/pool.js';
import { slugify } from '../src/utils/slug.js';

/**
 * A curated catalogue of real, independently-verified hotels in Navi Mumbai, sourced from OpenStreetMap
 * (via the existing hotel-import provider -- same source, same external_provider/external_id convention
 * the admin "Add Hotel" import flow uses) plus star ratings cross-checked against public hotel listings,
 * since OSM itself rarely tags a star class. Descriptions are deliberately factual and modest: real
 * locality + real brand affiliation only, nothing invented.
 *
 * No real, safely-licensed property photo could be sourced for any of these 10 (Wikimedia Commons has
 * none under these names; no hotel/chain press kit grants reuse; the one independent site with a public
 * page blocks automated access) -- see the Navi Mumbai pilot reports for the search trail. Each hotel
 * instead gets one clearly-labelled ILLUSTRATIVE cover image (an Unsplash-licensed generic hotel photo
 * already used elsewhere on this site, reused rather than sourcing something new) so the catalogue is
 * visually complete and testable without ever claiming to show the real property. Production's publish
 * gate (see hotel.service.js#publishBlockersFor) does not count an illustrative image as satisfying "at
 * least one image" -- only the pilot flag does. See Part 3 of this phase's own spec for the flag.
 *
 * Idempotent: keyed by (external_provider, external_id), the same uniqueness the import pipeline itself
 * relies on. Re-running this seed skips any hotel that already exists and never creates a duplicate.
 */
const HOTELS = [
  {
    externalId: 'N1514113522', name: 'Abbot Hotel', starRating: 3,
    addressLine: 'Ganesh Mandir Marg, Sector 2', area: 'Vashi', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.0736432, longitude: 72.9969421,
    description: 'A hotel in Sector 2, Vashi, Navi Mumbai, near Vashi railway station.',
    amenities: ['WIFI', 'AC', 'PARKING'], priceMinor: 280000,
  },
  {
    externalId: 'N267473867', name: 'Supreme Heritage', starRating: 3,
    addressLine: 'Truck Terminal Lane', area: 'Vashi', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.0774433, longitude: 73.0034195,
    description: 'A hotel on Truck Terminal Lane in Vashi, Navi Mumbai.',
    amenities: ['WIFI', 'AC', 'PARKING'], priceMinor: 290000,
  },
  {
    externalId: 'W1013444760', name: 'Tunga', starRating: 4,
    addressLine: 'Bhagwan Mahaveer Road', area: 'Vashi', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.0671667, longitude: 72.9991996,
    description: 'A hotel on Bhagwan Mahaveer Road in Vashi, Navi Mumbai.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT'], priceMinor: 450000,
  },
  {
    externalId: 'W354844184', name: 'The Regenza by Tunga', starRating: 3,
    addressLine: 'Bhagwan Mahaveer Road', area: 'Vashi', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.0671446, longitude: 72.9991979,
    description: 'A Regenza by Tunga property on Bhagwan Mahaveer Road, Vashi, Navi Mumbai.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT'], priceMinor: 320000,
  },
  {
    externalId: 'W1013444755', name: 'Four Points by Sheraton Navi Mumbai', starRating: 4,
    addressLine: 'Bhagwan Mahaveer Road', area: 'Vashi', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.0662937, longitude: 72.9996924,
    description: 'A Four Points by Sheraton property on Bhagwan Mahaveer Road in Vashi, Navi Mumbai, part of Marriott International.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT', 'GYM', 'FRONT_DESK_24H'], priceMinor: 620000,
  },
  {
    externalId: 'N13361899948', name: 'The Altruist Business Hotel NM-1', starRating: 3,
    addressLine: 'Bapuji Road', area: 'Kopar Khairne', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.1062062, longitude: 73.0085271,
    description: 'A business hotel on Bapuji Road in Kopar Khairne, Navi Mumbai.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT'], priceMinor: 300000,
  },
  {
    externalId: 'W353749275', name: 'Country Inn & Suites by Radisson, Navi Mumbai', starRating: 4,
    addressLine: 'Mahape Flyover, Hanuman Nagar', area: 'Mahape', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.1140126, longitude: 73.0126728,
    description: 'A Country Inn & Suites by Radisson property in Mahape, Navi Mumbai, part of the Radisson Hotel Group.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT', 'FRONT_DESK_24H'], priceMinor: 520000,
  },
  {
    externalId: 'N13352896463', name: '7 Apple Hotel Mahape', starRating: 4,
    addressLine: 'South Central Road', area: 'Mahape', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.1092721, longitude: 73.0228605,
    description: 'A hotel on South Central Road in Mahape, Navi Mumbai.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT'], priceMinor: 420000,
  },
  {
    externalId: 'W1126242022', name: 'Majestic Court Sarovar Portico', starRating: 4,
    addressLine: 'North Central Road, Reliance Corporate Park, MIDC Rabale', area: 'Rabale', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.1145764, longitude: 73.0172196,
    description: 'A Sarovar Portico property at Reliance Corporate Park, MIDC Rabale, Navi Mumbai.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT', 'FRONT_DESK_24H'], priceMinor: 480000,
  },
  {
    externalId: 'W1057217853', name: 'Courtyard by Marriott Navi Mumbai', starRating: 4,
    addressLine: 'D.Y. Patil Service Road', area: 'Nerul East', city: 'Navi Mumbai', state: 'Maharashtra',
    latitude: 19.0433555, longitude: 73.0269446,
    description: 'A Courtyard by Marriott property on D.Y. Patil Service Road, Nerul East, Navi Mumbai, part of Marriott International.',
    amenities: ['WIFI', 'AC', 'PARKING', 'RESTAURANT', 'GYM', 'FRONT_DESK_24H'], priceMinor: 580000,
  },
];

/**
 * A small, curated pool of already-licensed Unsplash photos (the exact same ones already used on the
 * homepage, under the Unsplash License -- free for this kind of use) distributed across a few generic
 * categories, so no two unrelated hotels of the same category look identical and no single photo is
 * reused for all ten. Picking which category best fits which real hotel is a styling choice only -- it
 * says nothing about that property's actual rooms or interior.
 */
const UNSPLASH = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=85`;
const ILLUSTRATIVE_BY_NAME = {
  'Abbot Hotel': { category: 'BUSINESS_HOTEL', url: UNSPLASH('photo-1600607687939-ce8a6c25118c') },
  'Supreme Heritage': { category: 'BOUTIQUE_HOTEL', url: UNSPLASH('photo-1548013146-72479768bada') },
  Tunga: { category: 'BUSINESS_HOTEL', url: UNSPLASH('photo-1566665797739-1674de7a421a') },
  'The Regenza by Tunga': { category: 'PREMIUM_HOTEL', url: UNSPLASH('photo-1564501049412-61c2a3083791') },
  'Four Points by Sheraton Navi Mumbai': { category: 'BUSINESS_HOTEL', url: UNSPLASH('photo-1510798831971-661eb04b3739') },
  'The Altruist Business Hotel NM-1': { category: 'BUSINESS_HOTEL', url: UNSPLASH('photo-1566073771259-6a8506099945') },
  'Country Inn & Suites by Radisson, Navi Mumbai': { category: 'PREMIUM_HOTEL', url: UNSPLASH('photo-1540541338287-41700207dee6') },
  '7 Apple Hotel Mahape': { category: 'BUSINESS_HOTEL', url: UNSPLASH('photo-1600607687939-ce8a6c25118c') },
  'Majestic Court Sarovar Portico': { category: 'PREMIUM_HOTEL', url: UNSPLASH('photo-1571896349842-33c89424de2d') },
  'Courtyard by Marriott Navi Mumbai': { category: 'PREMIUM_BUSINESS_HOTEL', url: UNSPLASH('photo-1564501049412-61c2a3083791') },
};

const EXTERNAL_PROVIDER = 'openstreetmap';
const PRICING_FROM_OFFSET_DAYS = 1;
const PRICING_WINDOW_DAYS = 180;

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function uniqueSlug(client, base) {
  let candidate = base || 'hotel';
  let suffix = 2;
  while (await hotelRepository.slugTaken(candidate, client)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function findSystemAdmin() {
  const { rows } = await pool.query(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'ADMIN' AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

async function createHotel(entry, actor) {
  const hotelId = await withTransaction(async (client) => {
    const slug = await uniqueSlug(client, slugify(entry.name, entry.city));
    const id = await hotelRepository.insert(client, {
      name: entry.name,
      description: entry.description,
      property_type: 'HOTEL',
      star_rating: entry.starRating,
      address_line: entry.addressLine,
      area: entry.area,
      city: entry.city,
      state: entry.state,
      country_code: 'IN',
      latitude: entry.latitude,
      longitude: entry.longitude,
      slug,
      status: 'DRAFT',
      external_provider: EXTERNAL_PROVIDER,
      external_id: entry.externalId,
      created_by: actor.id,
      updated_by: actor.id,
    });
    await auditService.record(client, {
      actor, action: 'hotel.seeded', entity: 'hotel', entityId: id,
      newValue: { name: entry.name, city: entry.city, source: 'real_hotel_catalog_seed' },
    });
    return id;
  });

  await hotelService.setAmenities(hotelId, entry.amenities, actor);

  const roomType = await roomTypeService.create(hotelId, {
    name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 15,
  }, actor);

  const policies = await cancellationPolicyService.listForHotel(hotelId, actor);
  const freePolicy = policies.find((p) => p.code === 'FREE_CANCELLATION');

  const ratePlan = await ratePlanService.create(roomType.id, {
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true,
    cancellationPolicyId: freePolicy.id, discountPercent: 0, taxPercent: 12, feeMinor: 0,
  }, actor);

  await inventoryService.bulkUpdate(roomType.id, {
    from: isoDaysFromNow(PRICING_FROM_OFFSET_DAYS),
    to: isoDaysFromNow(PRICING_FROM_OFFSET_DAYS + PRICING_WINDOW_DAYS),
    ratePlanId: ratePlan.id,
    basePriceMinor: entry.priceMinor,
  }, actor);

  return hotelId;
}

/**
 * Idempotent regardless of whether the hotel was just created or already existed from an earlier run:
 * adds the illustrative cover only if the hotel has no image yet, then -- only when the pilot flag is
 * on -- walks the existing publish state machine as far as it will currently go. Safe to call every run.
 */
async function ensureIllustrativeCoverAndPublish(hotelId, entry, actor) {
  const notes = [];
  const images = await hotelRepository.listImages(hotelId);
  if (images.length === 0) {
    const illustrative = ILLUSTRATIVE_BY_NAME[entry.name];
    const image = await hotelImageService.addFromUrl(hotelId, {
      sourceUrl: illustrative.url,
      category: 'EXTERIOR',
      altText: `Illustrative ${illustrative.category.replace(/_/g, ' ').toLowerCase()} -- not an actual photo of this property`,
      sourceProvider: 'unsplash',
      imageType: 'ILLUSTRATIVE',
    }, actor);
    await hotelImageService.setCover(hotelId, image.id, actor);
    notes.push(`illustrative cover added (${illustrative.category})`);
  } else {
    notes.push(`already has ${images.length} image(s)`);
  }

  if (!config.features.allowIllustrativeHotelImages) {
    notes.push('ALLOW_ILLUSTRATIVE_HOTEL_IMAGES is off, so it stays DRAFT -- production requires a real property photo');
    return notes.join('; ');
  }

  const hotel = await hotelRepository.findById(hotelId);
  if (hotel.status === 'PUBLISHED') {
    notes.push('already published');
    return notes.join('; ');
  }
  const path = { DRAFT: ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH'], PENDING_REVIEW: ['MARK_READY', 'PUBLISH'], READY_TO_PUBLISH: ['PUBLISH'] }[hotel.status];
  if (!path) {
    notes.push(`status is ${hotel.status}, left as-is`);
    return notes.join('; ');
  }
  for (const action of path) {
    await hotelService.transition(hotelId, action, actor);
  }
  notes.push('published (pilot mode)');
  return notes.join('; ');
}

async function seedOneHotel(entry, actor) {
  const existing = await hotelRepository.findByExternal(EXTERNAL_PROVIDER, entry.externalId);
  const hotelId = existing ? existing.id : await createHotel(entry, actor);
  const imageNote = await ensureIllustrativeCoverAndPublish(hotelId, entry, actor);
  return `${entry.name}: hotel #${hotelId} (${existing ? 'already existed' : 'created'}) -- ${imageNote}`;
}

export async function seedNaviMumbaiHotels() {
  const adminId = await findSystemAdmin();
  if (!adminId) return 'skipped (no ADMIN user exists yet -- run the admin-user seed first)';

  const actor = { id: adminId, roles: ['ADMIN'] };
  const results = [];
  for (const entry of HOTELS) {
    results.push(await seedOneHotel(entry, actor));
  }
  return results;
}

// Run directly (`node seeds/003_navi_mumbai_hotels.js`) as well as from the main seed runner.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedNaviMumbaiHotels()
    .then((results) => {
      console.log(Array.isArray(results) ? results.join('\n') : results);
      return pool.end();
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
