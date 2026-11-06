import { onboardingAnalyticsService } from '../services/onboardingAnalytics.service.js';
import { sendCsv } from '../utils/csv.js';

export const onboardingAnalyticsController = {
  async overview(_req, res) {
    const [overview, employeeWiseOnboarding, employeeWiseEditing, recentActivities] = await Promise.all([
      onboardingAnalyticsService.overview(),
      onboardingAnalyticsService.employeeWiseOnboarding(),
      onboardingAnalyticsService.employeeWiseEditing(),
      onboardingAnalyticsService.recentActivities(10),
    ]);
    return res.json({ overview, employeeWiseOnboarding, employeeWiseEditing, recentActivities });
  },

  async monthlyTrends(req, res) {
    return res.json({ trends: await onboardingAnalyticsService.monthlyTrends(req.validated.query) });
  },

  async listEmployees(req, res) {
    return res.json(await onboardingAnalyticsService.employeePerformanceList(req.validated.query));
  },

  async employeeDetail(req, res) {
    return res.json({ employee: await onboardingAnalyticsService.employeeDetail(req.validated.params.id, req.validated.query) });
  },

  async employeeActivities(req, res) {
    return res.json(await onboardingAnalyticsService.employeeActivities(req.validated.params.id, req.validated.query));
  },

  async exportEmployeePerformanceCsv(req, res) {
    return sendCsv(res, 'employee-performance.csv', await onboardingAnalyticsService.exportEmployeePerformance(req.validated.query));
  },
};
