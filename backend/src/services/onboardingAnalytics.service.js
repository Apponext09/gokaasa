import { onboardingAnalyticsRepository } from '../repositories/onboardingAnalytics.repository.js';
import { auditLogService } from './auditLog.service.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';
import { toCsv } from '../utils/csv.js';

const HOTEL_ACTIVITY_ENTITIES = ['hotel', 'room_type', 'rate_plan'];
const EXPORT_CAP = 5000;

function toEmployeeRow(row) {
  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    phone: row.phone,
    roles: row.roles ?? [],
    onboarded: row.onboarded,
    approved: row.approved,
    pending: row.pending,
    changesRequested: row.changes_requested,
    totalModifications: row.total_modifications,
    hotelsEdited: row.hotels_edited,
    lastActivityAt: row.last_activity_at ?? null,
  };
}

export const onboardingAnalyticsService = {
  /** Overview Dashboard KPIs + status donut, computed from real hotel/audit rows. ADMIN only (route-enforced). */
  async overview() {
    const row = await onboardingAnalyticsRepository.overview();
    return {
      totalHotelsOnboarded: row.total_hotels,
      onboardedThisMonth: row.onboarded_this_month,
      onboardedThisWeek: row.onboarded_this_week,
      activeOnboardingExecutives: row.active_onboarding_executives,
      totalHotelsEdited: row.total_hotels_edited,
      pendingReview: row.pending_review,
      approved: row.approved,
      changesRequested: row.changes_requested,
    };
  },

  async monthlyTrends({ months }) {
    const rows = await onboardingAnalyticsRepository.monthlyTrends(months);
    return rows.map((row) => ({ month: row.month, count: row.count }));
  },

  async employeeWiseOnboarding() {
    const rows = await onboardingAnalyticsRepository.employeeWiseOnboarding();
    return rows.map((row) => ({ id: row.id, name: row.name, onboarded: row.onboarded, approved: row.approved, pending: row.pending, changesRequested: row.changes_requested }));
  },

  async employeeWiseEditing() {
    const rows = await onboardingAnalyticsRepository.employeeWiseEditing();
    return rows.map((row) => ({ id: row.id, name: row.name, totalModifications: row.total_modifications, uniqueHotelsEdited: row.unique_hotels_edited }));
  },

  /** Latest hotel-related activity across every employee, for the dashboard's "Recent Activities" panel. */
  async recentActivities(limit = 10) {
    const page = await auditLogService.list({ entity: HOTEL_ACTIVITY_ENTITIES, page: 1, limit });
    // room_type/rate_plan rows are keyed by their own id, not a hotel id, so only 'hotel' rows get a name/link here.
    const hotelIds = [...new Set(page.items.filter((item) => item.entity === 'hotel').map((item) => Number(item.entityId)))];
    const hotels = await onboardingAnalyticsRepository.hotelNamesByIds(hotelIds);
    const nameById = new Map(hotels.map((hotel) => [hotel.id, hotel.name]));
    return page.items.map((item) => (
      item.entity === 'hotel' ? { ...item, hotelId: Number(item.entityId), hotelName: nameById.get(Number(item.entityId)) ?? null } : item
    ));
  },

  async employeePerformanceList(query) {
    const { rows, total } = await onboardingAnalyticsRepository.employeePerformanceList(query);
    return toPage(rows.map(toEmployeeRow), total, query.page, query.limit);
  },

  async employeeDetail(employeeId, { from, to }) {
    const profile = await onboardingAnalyticsRepository.employeeProfile(employeeId);
    if (!profile) throw AppError.notFound('Employee not found');
    const [stats, monthly] = await Promise.all([
      onboardingAnalyticsRepository.employeeStats(employeeId, { from, to }),
      onboardingAnalyticsRepository.employeeMonthlyOnboarding(employeeId, 12),
    ]);
    return {
      id: profile.id,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(' '),
      email: profile.email,
      phone: profile.phone,
      isActive: profile.is_active,
      roles: profile.roles ?? [],
      joinedAt: profile.created_at,
      onboarded: stats.onboarded,
      approved: stats.approved,
      pending: stats.pending,
      changesRequested: stats.changes_requested,
      totalModifications: stats.total_modifications,
      hotelsEdited: stats.hotels_edited,
      monthlyOnboarding: monthly.map((row) => ({ month: row.month, count: row.count })),
    };
  },

  /** An employee's hotel-wise activity history -- the generic audit viewer, scoped to this actor and these entities. */
  async employeeActivities(employeeId, query) {
    return auditLogService.list({ ...query, actorId: employeeId, entity: HOTEL_ACTIVITY_ENTITIES });
  },

  async exportEmployeePerformance(query) {
    const { rows } = await onboardingAnalyticsRepository.employeePerformanceList({ ...query, page: 1, limit: EXPORT_CAP });
    const items = rows.map(toEmployeeRow);
    return toCsv(items, [
      { key: 'id', header: 'Employee ID' }, { key: 'name', header: 'Employee Name' }, { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Mobile Number' }, { key: 'roles', header: 'Role' },
      { key: 'onboarded', header: 'Total Hotels Onboarded' }, { key: 'approved', header: 'Approved Hotels' },
      { key: 'pending', header: 'Pending Hotels' }, { key: 'changesRequested', header: 'Changes Requested' },
      { key: 'hotelsEdited', header: 'Total Hotels Edited' }, { key: 'totalModifications', header: 'Total Modification Activities' },
      { key: 'lastActivityAt', header: 'Last Activity' },
    ]);
  },
};
