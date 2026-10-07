# Gokaasa: hotel booking platform

Phase 1 (foundation) and the Phase 2 onboarding backbone are implemented. Customer search, booking, and Razorpay are not built yet.

## Layout

- `backend/`: Node 24 + Express 5 + PostgreSQL. Migrations in `migrations/`, provider abstraction in `src/providers/`, normalization in `src/normalizers/`, tests in `tests/`.
- `frontend/`: Vite + React 19 + Tailwind CSS 4. Design tokens in `src/index.css`, UI primitives in `src/components/ui/`.

## Run it

1. Create a PostgreSQL database with `ENCODING 'UTF8'`.
2. `cd backend && cp .env.example .env`, then set `DATABASE_URL`, `JWT_SECRET` (32+ chars), and optionally `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. `npm install && npm run migrate && npm run seed && npm run dev`
4. `cd frontend && npm install && npm run dev` and open http://localhost:5173.

Without provider credentials, search uses the OpenStreetMap source (no key needed) and the labelled mock source. Google Places activates only when `GOOGLE_MAPS_API_KEY` is set.

## Tests

- `cd backend && npm test`: needs `DATABASE_URL` pointing at a database whose name contains `test`. The integration helper refuses any other name because it truncates tables.

## Guarantees

- Imported data always lands as a DRAFT. Publishing requires an ADMIN and passes the publish gate.
- Refresh tokens rotate on every use. Replaying a revoked token revokes all of that user's sessions.
- Money is stored as integer minor units.
