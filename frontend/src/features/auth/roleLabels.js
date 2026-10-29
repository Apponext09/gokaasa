const ROLE_LABELS = {
  CUSTOMER: 'Customer',
  ADMIN: 'Administrator',
  HOTEL_MANAGER: 'Hotel Manager',
  HOTEL_OWNER: 'Hotel Owner',
  SALES_EXECUTIVE: 'Sales Executive',
  HOTEL_ONBOARDING_EXECUTIVE: 'Hotel Onboarding Executive',
  HOTEL_REVIEW_EXECUTIVE: 'Hotel Review Executive',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}
