import { hotelService } from '../services/hotel.service.js';
import { hotelImportService } from '../services/hotelImport.service.js';
import { dashboardService } from '../services/dashboard.service.js';
import { getActiveProviders, describeProviders } from '../providers/index.js';
import { pool } from '../db/pool.js';
import { sendCsv } from '../utils/csv.js';

/** Actor for audit logging and ownership columns, taken from the verified token only. */
function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const hotelController = {
  // Public
  async listPublic(req, res) {
    return res.json(await hotelService.listPublic(req.validated.query));
  },

  async getPublic(req, res) {
    return res.json({ hotel: await hotelService.getPublic(req.validated.params.idOrSlug, { userId: req.user?.id ?? null }) });
  },

  async listAmenities(_req, res) {
    const { rows } = await pool.query(`SELECT code, name, category FROM amenities WHERE is_active = TRUE ORDER BY sort_order, category, name`);
    return res.json({ amenities: rows });
  },

  // Admin: hotel management
  async listAdmin(req, res) {
    return res.json(await hotelService.listAdmin(req.validated.query, req.user));
  },

  async exportHotelsCsv(req, res) {
    return sendCsv(res, 'hotels.csv', await hotelService.exportHotels(req.validated.query, req.user));
  },

  async getAdmin(req, res) {
    return res.json({ hotel: await hotelService.getAdmin(req.validated.params.id, req.user) });
  },

  async createManual(req, res) {
    const hotel = await hotelService.createManual(req.validated.body, actorOf(req));
    return res.status(201).json({ hotel });
  },

  async update(req, res) {
    const hotel = await hotelService.updateDetails(req.validated.params.id, req.validated.body, actorOf(req));
    return res.json({ hotel });
  },

  async setAmenities(req, res) {
    const hotel = await hotelService.setAmenities(req.validated.params.id, req.validated.body.codes, actorOf(req));
    return res.json({ hotel });
  },

  async transition(req, res) {
    const hotel = await hotelService.transition(
      req.validated.params.id,
      req.validated.body.action,
      actorOf(req),
      { feedback: req.validated.body.feedback },
    );
    return res.json({ hotel });
  },

  // Admin: onboarding
  async importSearch(req, res) {
    return res.json(await hotelImportService.search(req.validated.body.query));
  },

  async importRequest(req, res) {
    const job = await hotelImportService.requestImport(req.validated.body, actorOf(req));
    return res.status(202).json({ job });
  },

  async importJobs(req, res) {
    return res.json(await hotelImportService.listJobs(req.validated.query, req.user));
  },

  async importJob(req, res) {
    return res.json({ job: await hotelImportService.getJob(req.validated.params.id) });
  },

  async providers(_req, res) {
    return res.json({
      providers: describeProviders(),
      activeCount: getActiveProviders().length,
      usingMockOnly: getActiveProviders().every((provider) => provider.code === 'mock'),
    });
  },

  async dashboard(req, res) {
    return res.json(await dashboardService.summary(req.user));
  },

  async dashboardTrends(req, res) {
    return res.json(await dashboardService.trends(req.validated.query, req.user));
  },

  async hotelPerformance(req, res) {
    return res.json(await dashboardService.hotelPerformance(req.validated.query, req.user));
  },

  async dashboardAlerts(req, res) {
    return res.json(await dashboardService.alerts(req.user));
  },
};
