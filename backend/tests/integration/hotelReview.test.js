import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

const PASSWORD = 'Strong-pass-123';
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let app;
let adminToken;
let onboardingToken;
let otherOnboardingToken;
let reviewerToken;
let reviewerUserId;
let hotelId;
let roomId;
let policyId;
let issueId;

async function login(email) {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  assert.equal(response.status, 200);
  return response.body.accessToken;
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'review.admin@test.gokaasa.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'review.onboarding@test.gokaasa.com', password: PASSWORD, roleCode: 'HOTEL_ONBOARDING_EXECUTIVE' });
  await createUserWithRole({ email: 'review.other@test.gokaasa.com', password: PASSWORD, roleCode: 'HOTEL_ONBOARDING_EXECUTIVE' });
  reviewerUserId = await createUserWithRole({ email: 'review.executive@test.gokaasa.com', password: PASSWORD, roleCode: 'HOTEL_REVIEW_EXECUTIVE' });
  adminToken = await login('review.admin@test.gokaasa.com');
  onboardingToken = await login('review.onboarding@test.gokaasa.com');
  otherOnboardingToken = await login('review.other@test.gokaasa.com');
  reviewerToken = await login('review.executive@test.gokaasa.com');

  const created = await request(app).post('/api/admin/hotels').set(bearer(onboardingToken)).send({
    name: 'Internal Review Workflow Hotel', city: 'Mumbai', countryCode: 'IN',
    description: 'A complete hotel used to verify the internal review workflow.',
    addressLine: '10 Review Road', starRating: 4, latitude: 19.07, longitude: 72.88,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  hotelId = created.body.hotel.id;
  await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(onboardingToken)).send({ codes: ['WIFI'] });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/review-cover.jpg', true)`, [hotelId]);

  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(onboardingToken)).send({
    name: 'Review Deluxe Room', roomCode: 'RDR', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4,
  });
  assert.equal(room.status, 201, JSON.stringify(room.body));
  roomId = room.body.roomType.id;

  const policy = await request(app).post(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(onboardingToken)).send({
    code: 'REVIEW_FLEX', name: 'Review flexible', description: 'Full refund until one day before check-in.',
    isNonRefundable: false, cancellationDeadlineHours: 24, refundPercent: 100,
  });
  assert.equal(policy.status, 201, JSON.stringify(policy.body));
  policyId = policy.body.policy.id;
});

after(closeTestDatabase);

describe('internal hotel review workflow', () => {
  it('lets onboarding manage room availability before submitting the hotel', async () => {
    const from = addDays(localToday('Asia/Kolkata'), 30);
    const to = addDays(from, 1);
    const updated = await request(app).post(`/api/admin/room-types/${roomId}/calendar/bulk`).set(bearer(onboardingToken)).send({
      from, to: from, units: 3, isClosed: false,
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.days[0].unitsOverride, 3);

    const calendar = await request(app).get(`/api/admin/room-types/${roomId}/calendar`).set(bearer(onboardingToken)).query({ from, to: from });
    assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
    assert.equal(calendar.body.days[0].sellable, 3);

    const block = await request(app).post(`/api/admin/room-types/${roomId}/blocks`).set(bearer(onboardingToken)).send({
      startDate: from, endDate: to, quantity: 1, reason: 'MAINTENANCE', note: 'Availability workflow check',
    });
    assert.equal(block.status, 201, JSON.stringify(block.body));
    const removed = await request(app).delete(`/api/admin/availability-blocks/${block.body.block.id}`).set(bearer(onboardingToken));
    assert.equal(removed.status, 204);
  });

  it('creates a pending review when onboarding submits a hotel', async () => {
    const submitted = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(onboardingToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.hotel.status, 'PENDING_REVIEW');

    const detail = await request(app).get(`/api/admin/hotels/${hotelId}/review`).set(bearer(reviewerToken));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.review.status, 'PENDING');
    assert.equal(detail.body.review.submittedBy, 'Test User');
  });

  it('prevents onboarding from approving its own submission', async () => {
    const response = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(onboardingToken)).send({ action: 'MARK_READY' });
    assert.equal(response.status, 403);
  });

  it('lets an admin assign the review executive', async () => {
    const response = await request(app).post(`/api/admin/hotels/${hotelId}/review/assign`).set(bearer(adminToken)).send({ reviewerId: reviewerUserId });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.review.assignedReviewerId, reviewerUserId);
  });

  it('lets the assigned reviewer add an issue', async () => {
    const response = await request(app).post(`/api/admin/hotels/${hotelId}/review/issues`).set(bearer(reviewerToken)).send({
      section: 'IMAGES', severity: 'REQUIRED', comment: 'Replace the blurry lobby photograph.',
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.review.assignedReviewer, 'Test User');
    issueId = response.body.review.issues[0].id;
  });

  it('sends requested changes to the submitting onboarding executive', async () => {
    const response = await request(app).post(`/api/admin/hotels/${hotelId}/review/request-changes`).set(bearer(reviewerToken)).send({ summary: 'Please correct the required image issue.' });
    assert.equal(response.status, 200);
    assert.equal(response.body.review.status, 'CHANGES_REQUESTED');

    const hotel = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(onboardingToken));
    assert.equal(hotel.body.hotel.status, 'CHANGES_REQUESTED');
    const notices = await pool.query(`SELECT type FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1`, ['review.onboarding@test.gokaasa.com']);
    assert.ok(notices.rows.some((row) => row.type === 'hotel.changes_requested'));
  });

  it('allows only the submitting onboarding executive to mark the issue fixed', async () => {
    const blocked = await request(app).post(`/api/admin/hotels/${hotelId}/review/issues/${issueId}/fix`).set(bearer(otherOnboardingToken));
    assert.equal(blocked.status, 403);
    const fixed = await request(app).post(`/api/admin/hotels/${hotelId}/review/issues/${issueId}/fix`).set(bearer(onboardingToken));
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.review.issues[0].status, 'FIXED_BY_ONBOARDING');
  });

  it('resubmits, verifies the fix, approves, and then permits publishing', async () => {
    const resubmitted = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(onboardingToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
    assert.equal(resubmitted.status, 200);
    assert.equal(resubmitted.body.hotel.status, 'PENDING_REVIEW');

    const verified = await request(app).post(`/api/admin/hotels/${hotelId}/review/issues/${issueId}/verify`).set(bearer(reviewerToken));
    assert.equal(verified.status, 200);
    assert.equal(verified.body.review.issues[0].status, 'VERIFIED');

    const approved = await request(app).post(`/api/admin/hotels/${hotelId}/review/approve`).set(bearer(reviewerToken)).send({ summary: 'All required corrections are verified.' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.review.status, 'APPROVED');

    const published = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(onboardingToken)).send({ action: 'PUBLISH' });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.hotel.status, 'PUBLISHED');
  });

  it('keeps reviewer access read-only outside the internal review endpoints', async () => {
    const rooms = await request(app).get(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(reviewerToken));
    assert.equal(rooms.status, 200);
    assert.ok(rooms.body.roomTypes.some((room) => room.id === roomId && room.name === 'Review Deluxe Room'));
    const room = await request(app).get(`/api/admin/room-types/${roomId}`).set(bearer(reviewerToken));
    assert.equal(room.status, 200, JSON.stringify(room.body));
    assert.equal(room.body.roomType.id, roomId);
    const ratePlans = await request(app).get(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(reviewerToken));
    assert.equal(ratePlans.status, 200, JSON.stringify(ratePlans.body));
    const from = addDays(localToday('Asia/Kolkata'), 30);
    const calendar = await request(app).get(`/api/admin/room-types/${roomId}/calendar`).set(bearer(reviewerToken)).query({ from, to: from });
    assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
    const blocks = await request(app).get(`/api/admin/room-types/${roomId}/blocks`).set(bearer(reviewerToken));
    assert.equal(blocks.status, 200, JSON.stringify(blocks.body));
    const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(reviewerToken));
    assert.equal(policies.status, 200);
    assert.ok(policies.body.policies.some((policy) => policy.id === policyId && policy.code === 'REVIEW_FLEX'));
    const imports = await request(app).get(`/api/admin/hotels/${hotelId}/import-history`).set(bearer(reviewerToken));
    assert.equal(imports.status, 200);
    const response = await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(reviewerToken)).send({ name: 'Reviewer must not edit this' });
    assert.equal(response.status, 403);
    const createRoom = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(reviewerToken)).send({});
    assert.equal(createRoom.status, 403);
    const createPolicy = await request(app).post(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(reviewerToken)).send({});
    assert.equal(createPolicy.status, 403);
    const users = await request(app).get('/api/admin/users').set(bearer(reviewerToken));
    assert.equal(users.status, 403);
    const queue = await request(app).get('/api/admin/hotel-reviews').set(bearer(reviewerToken));
    assert.equal(queue.status, 200);
  });

  it('allows an admin to create another Hotel Review Executive account', async () => {
    const response = await request(app).post('/api/admin/users/staff').set(bearer(adminToken)).send({
      firstName: 'Quality', lastName: 'Reviewer', email: 'quality.reviewer@test.gokaasa.com',
      password: PASSWORD, role: 'HOTEL_REVIEW_EXECUTIVE',
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.deepEqual(response.body.user.roles, ['HOTEL_REVIEW_EXECUTIVE']);
  });
});
