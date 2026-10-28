export const MASTER_DEFINITIONS = {
  'property-types': { label: 'Property Types', singular: 'property type', needsCategory: false },
  'room-categories': { label: 'Room Types', singular: 'room type', needsCategory: false },
  'bed-types': { label: 'Bed Types', singular: 'bed type', needsCategory: false },
  'image-categories': { label: 'Image Categories', singular: 'image category', needsCategory: false },
  'meal-plans': { label: 'Meal Plans', singular: 'meal plan', needsCategory: false, needsMealFlags: true },
  amenities: { label: 'Amenities', singular: 'amenity', needsCategory: true },
};

export const AMENITY_CATEGORIES = [
  'CONNECTIVITY', 'DINING', 'WELLNESS', 'LEISURE', 'ROOM', 'SERVICES', 'TRANSPORT', 'ACCESSIBILITY', 'OTHER',
];

export const toOptions = (items) => items.map((item) => ({ value: item.code, label: item.name }));

