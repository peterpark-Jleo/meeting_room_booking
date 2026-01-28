# Meeting Room Booking

Minimal full-stack setup for a single meeting room booking service.

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Start local PostgreSQL (Docker) and run migrations

```bash
npm run db:up
npm run migrate
```

For Neon, set `DATABASE_URL` and skip `db:up`.

```bash
npm run migrate
```

3) Set environment variables (see `.env.example`)

```bash
DATABASE_URL=postgres://...
JWT_SECRET=your-secret
RESEND_API_KEY=optional
PGSSL=true
```

4) Start server

```bash
npm start
```

## Create Admin User

Run the admin seeder and follow the prompts:

```bash
npm run seed:admin
```

## Create User

```bash
npm run seed:user
```

## Local DB Notes

- Default connection: `postgres://postgres:postgres@localhost:5432/meeting_room_booking`
- `server/db.js` falls back to the local connection when `DATABASE_URL` is missing

## Neon Notes

- Use the pooled connection string in `DATABASE_URL`
- Set `PGSSL=true`

## Migration Notes

- Migrations are tracked in the `migrations` table
- Already-applied SQL files are skipped automatically
- `002_dummy_users.sql` seeds three demo members (password: `user1234`)

## Build Info (Manual)

- Update `public/build-info.js` with the current version/date

## Cloud Run Deployment (GitHub Actions)

Workflow: `.github/workflows/deploy.yml`

Secrets required:
- `GCP_WIF_PROVIDER` (Workload Identity Provider resource name)
- `GCP_SERVICE_ACCOUNT` (Service account email)

Service configuration:
- Project: `hopeful-runner-485518-b8`
- Region: `europe-west1`
- Service: `meeting-room-booking`

## Pages

- `/` Login
- `/signup.html` Sign up request
- `/app.html` User dashboard
- `/reservations.html` My reservations
- `/profile.html` Profile
- `/admin.html` Admin dashboard
