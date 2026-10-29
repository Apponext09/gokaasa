/**
 * Where a notification's own entity actually lives, shared by the bell dropdown and the full
 * notifications page so the deep-link rule is written once. Unknown/missing entities link nowhere --
 * the item still shows, it just isn't clickable.
 */
export function notificationPath(notification) {
  if (notification.entityType === 'booking' && notification.entityId) return `/my-trips/${notification.entityId}`;
  if (notification.entityType === 'hotel' && notification.entityId) return `/admin/hotels/${notification.entityId}?tab=review`;
  return null;
}
