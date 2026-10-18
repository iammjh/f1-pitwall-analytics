# F1 Analytics Hub

Formula 1 standings, historical results, race dashboards, telemetry views, and personal watchlists.

## Architecture and feature status

- `next-app`: Next.js 14, React, NextAuth, Prisma/MongoDB, user accounts, watchlists, dashboards, and HTTP APIs.
- `server`: optional Express support service that polls Jolpica and caches results in Redis. Its HTTP endpoint is `/api/health`.
- Data comes from Jolpica and OpenF1. Telemetry screens identify simulated or estimated values separately from official samples.
- Race-start email alerts are sent by `next-app` through `/api/notifications/race-alerts`, which a scheduler runs every 15 minutes. They go out only when `SMTP_HOST`, `SMTP_FROM`, and `CRON_SECRET` are set, and users opt in on the Alerts page. Each alert is sent once per user. Browser push alerts require VAPID configuration and browser permission.

## Local setup

Use Node.js 22, npm, Docker, and Docker Compose v2. Run these commands from the repository root unless a step changes directories.

### 1. Configure local services and the app

```bash
cp .env.example .env
cp next-app/.env.example next-app/.env.local
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Put the first two generated values in root `.env` as `MONGO_ROOT_PASSWORD` and `REDIS_PASSWORD`. Set the same passwords in `next-app/.env.local`'s `MONGODB_URI` and `REDIS_URL`; use the third value for `NEXTAUTH_SECRET`. The templates use `MONGO_ROOT_USER=f1admin`. Each generated value should be different. Leave optional OAuth credentials empty unless configured.

For the local Docker database, the app connection string is:

```dotenv
MONGODB_URI=mongodb://f1admin:YOUR_MONGO_PASSWORD@localhost:27017/f1-analytics?authSource=admin&replicaSet=rs0&directConnection=true
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379
```

The generated hex passwords are URL safe. Percent-encode usernames or passwords containing special URI characters if using your own values. These templates and root database credentials are for local development; use a dedicated app database user and deployment-specific secrets when hosting.

### 2. Start and initialize MongoDB and Redis

```bash
docker compose up -d mongodb redis
docker compose run --rm mongodb-init
docker compose ps
```

The initialization command waits for authentication and promotes the local single-node `rs0` replica set to PRIMARY. It is safe to rerun and also initializes existing standalone `mongodb_data` volumes without deleting data. MongoDB needs a replica set for Prisma transactions and nested writes. The keyfile is created at runtime with owner-only permissions and persisted in the separate `mongodb_config` Docker volume.

The member advertises `mongodb:27017` inside Docker. `directConnection=true` allows the app running on the host to connect through `localhost:27017` without needing to resolve that Docker hostname. Services bind to localhost.

If reusing a volume, keep the MongoDB root username/password that created it; changing `.env` does not change an existing MongoDB user's password. Back up existing data before converting the database topology. Keep the data and keyfile volumes together and use `docker compose down` to stop services while preserving them.

### 3. Install and start Next.js

```bash
cd next-app
npm ci
npm run db:push
npm run dev
```

Open `http://localhost:3000`. Create an account through the sign-in page. `db:push` creates the Prisma collections/indexes; both `db:push` and `db:studio` load `.env.local` with the same precedence as Next.js. MongoDB uses `db push`, rather than Prisma SQL migrations.

For Atlas, replace `MONGODB_URI` with your Atlas replica-set URI and skip the local MongoDB bootstrap. Configure the database user's access and Atlas network access for your app host.

### 4. Optional polling support service

From the repository root:

```bash
docker compose up -d --build backend
```

The support service connects to Redis using root `.env` values. Visit `http://localhost:5000/api/health`. It has no dependency on the app's database and does not send notifications. Its image includes only dependency manifests and runtime JavaScript; environment files are excluded from the build context and COPY inputs.

To run it directly with Node instead, see [server/SETUP.md](server/SETUP.md).

## Optional database synchronization

`BACKGROUND_JOBS_ENABLED=false` is the default in `next-app/.env.local`. Enable it only when the Next.js Bull jobs, Redis, and MongoDB are intended to run. Scheduled race syncs use the current season, and race identifiers include the season so equal round numbers from different years do not collide. Existing matching races are updated in place to preserve result relations. This is separate from the Express cache polling service.

## Data access and recovery

### Live data credentials

Historical OpenF1 data works without provider credentials. Live session data requires an active OpenF1 subscription and `OPENF1_USERNAME` plus `OPENF1_PASSWORD` in `next-app/.env.local` or the hosting environment. The server exchanges these for short-lived bearer tokens, refreshes them automatically, and proxies session requests through `/api/sessions`. Credentials and tokens are never returned to the browser. See the [OpenF1 authentication guide](https://openf1.org/auth.html). Missing or denied provider access is reported explicitly instead of being presented as an empty live feed.

### Password compatibility

Email passwords must be at least six characters at signup and at most 72 UTF-8 bytes at signup and sign-in. Accented letters and emoji may use multiple bytes. Existing bcrypt hashes within this limit remain compatible. Older passwords over the limit were irreversibly truncated by bcrypt; affected users can choose **Forgot your password?** on the sign-in page to set a compatible password.

Recovery needs `SMTP_HOST`, `SMTP_FROM`, SMTP credentials when required, `CRON_SECRET`, and a trusted `NEXTAUTH_URL` (HTTPS in production). Run `npm run db:push` when upgrading to create the recovery outbox and indexes. Vercel's schedule in `next-app/vercel.json` delivers queued recovery emails every minute. On other hosts, schedule an authenticated GET or POST to `/api/auth/password-reset/deliver` every minute with `Authorization: Bearer <CRON_SECRET>`. This durable MongoDB queue works without Redis. Enable the scheduler before offering recovery to users.

Recovery responses do not disclose account existence. Links expire 30 minutes after creation, work once, and only hashed tokens are stored. A successful reset revokes previous sessions and queues a confirmation email. OAuth-only accounts should continue signing in with their provider. Accounts without access to their registered inbox still need an administrator to verify ownership.

### Legacy migration recovery

Run `npm run db:migrate-legacy-users` from `next-app` only against the intended database. It reads every legacy batch, preserves existing account credentials and watchlist edits, and records source-to-target list mappings in `_F1LegacyWatchlistMap` for safe reruns. Keep this collection in database backups. Source collections are not removed. Pause concurrent account/watchlist edits while migrating.

The older importer generated random watchlist IDs. Resolve ambiguous lists using an explicit review manifest:

```bash
npm run db:migrate-legacy-users -- --dry-run --report legacy-review.json
# Edit each entry: map to an existing candidate targetId, import separately, or skip.
npm run db:migrate-legacy-users -- --dry-run --apply-resolutions legacy-review.json
npm run db:migrate-legacy-users -- --apply-resolutions legacy-review.json
```

Dry runs make no database changes. A report exits with code 2 when review is required, and an existing report file is never overwritten. Manifests contain private list contents and are ignored by git when named `legacy-review*.json`. The importer checks ownership and source snapshots before applying any decisions; stale or invalid reports abort before writes. Existing edits, deletions, and explicit skips survive reruns. Account identity conflicts require separate ownership verification.

### Service verification

Run `npm run services:verify` from `next-app` to check authenticated MongoDB replica-set access, Redis, and historical OpenF1 without changing service data. Add `-- --json` for machine-readable results, or `-- --require-live` to require configured live OpenF1 access. Diagnostics omit credentials, tokens, and connection URLs. Start local Redis with `docker compose up -d redis` from the repository root before checking it.

## Development checks

Run from `next-app`:

```bash
npm test
npm run lint
npm run build
```

## Project structure

```text
next-app/           Next.js app, Prisma schema, tests, and scripts
server/             Optional Express polling service
docker/mongo/      Replica-set bootstrap and healthcheck scripts
docker-compose.yml Local MongoDB, Redis, and support-service containers
```
