const STAFF_CUSTOMER_VIEW_KEY = 'gokaasa:staff-customer-view';

export function isStaffCustomerView() {
  try {
    return sessionStorage.getItem(STAFF_CUSTOMER_VIEW_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStaffCustomerView(enabled) {
  try {
    if (enabled) sessionStorage.setItem(STAFF_CUSTOMER_VIEW_KEY, 'true');
    else sessionStorage.removeItem(STAFF_CUSTOMER_VIEW_KEY);
  } catch {
    // The switch still navigates correctly when browser storage is unavailable.
  }
}
