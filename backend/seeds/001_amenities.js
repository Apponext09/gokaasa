/** Canonical amenity catalogue. Codes must match normalizers/amenities.js. */
const AMENITIES = [
  ['WIFI', 'Free WiFi', 'CONNECTIVITY'],
  ['POOL', 'Swimming Pool', 'LEISURE'],
  ['BEACH_ACCESS', 'Beach Access', 'LEISURE'],
  ['KIDS_CLUB', 'Kids Club', 'LEISURE'],
  ['PARKING', 'Parking', 'TRANSPORT'],
  ['AIRPORT_SHUTTLE', 'Airport Shuttle', 'TRANSPORT'],
  ['RESTAURANT', 'Restaurant', 'DINING'],
  ['BAR', 'Bar', 'DINING'],
  ['BREAKFAST', 'Breakfast', 'DINING'],
  ['GYM', 'Gym', 'WELLNESS'],
  ['SPA', 'Spa', 'WELLNESS'],
  ['AC', 'Air Conditioning', 'ROOM'],
  ['ROOM_SERVICE', 'Room Service', 'ROOM'],
  ['LAUNDRY', 'Laundry', 'SERVICES'],
  ['FRONT_DESK_24H', '24-hour Front Desk', 'SERVICES'],
  ['CONFERENCE_ROOM', 'Conference Room', 'SERVICES'],
  ['PETS_ALLOWED', 'Pets Allowed', 'OTHER'],
  ['WHEELCHAIR_ACCESS', 'Wheelchair Accessible', 'ACCESSIBILITY'],
];

export async function seedAmenities(client) {
  for (const [code, name, category] of AMENITIES) {
    await client.query(
      `INSERT INTO amenities (code, name, category) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category`,
      [code, name, category],
    );
  }
  return AMENITIES.length;
}
