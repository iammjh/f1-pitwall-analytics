# Polling support service setup

The Next.js app owns authentication, watchlists, MongoDB/Prisma, and user-facing APIs. This optional Express service polls Jolpica and caches race data in Redis. It exposes `GET /api/health` on port 5000.

## Docker

Complete the environment and MongoDB setup in [the project README](../README.md), then run from the repository root:

```bash
docker compose up -d --build backend
```

Compose supplies Redis credentials at runtime. The image uses an allowlist of runtime files; `.env` files, keys, local dependencies, and documentation are excluded. Do not add secrets to application JavaScript or Docker build arguments.

## Run directly with Node.js

Use Node.js 22 and npm. Start Redis using the project's Compose configuration:

```bash
# From the repository root, after configuring root .env:
docker compose up -d redis
cd server
npm ci
cp .env.example .env
```

Set `REDIS_PASSWORD` in `server/.env` to the same value as root `.env`. The host and port defaults (`localhost:6379`) match the local Docker port. Then run:

```bash
npm start
# Or use auto-reload during development:
npm run dev
```

Check `http://localhost:5000/api/health`.

## Environment

- `PORT`: defaults to 5000.
- `POLLING_ENABLED`: set `false` to disable background Jolpica fetches.
- `POLL_INTERVAL_MINUTES`: polling interval, 1–1440 minutes; default 5.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection settings. Compose Redis requires a password. The service requires a password when `NODE_ENV=production`. A locally installed Redis that is restricted to localhost and has no authentication can use an empty password during development.
- `JOLPICA_API`: upstream historical data endpoint.
- `FRONTEND_URL` and `ALLOWED_ORIGINS`: frontend URL and comma-separated CORS origins.

MongoDB, NextAuth, OAuth, and the Next.js Bull job flag belong in `next-app/.env.local`; this service does not consume them. See [the project README](../README.md) for authenticated replica-set bootstrap, Prisma `db:push`, and app startup instructions.

## Notification status

This service does not send notifications. Race-start email alerts are sent by `next-app` (`/api/notifications/race-alerts`), which needs the SMTP and `CRON_SECRET` variables listed in `next-app/.env.example`. Push notifications are not connected. Email is optional for running this service.

## Troubleshooting

- **Redis connection errors:** confirm the Redis service is running and host/port/password match. Use `redis` as the hostname from Compose containers and `localhost` from the host.
- **Production exits on startup:** set a nonempty Redis password and configure Redis to require it.
- **MongoDB or account-creation errors:** troubleshoot the Next.js app, verify `MONGODB_URI`, and rerun `docker compose run --rm mongodb-init`. Existing data volumes retain their original account credentials. Never remove volumes to bypass a connection problem.
- **CORS errors:** set `ALLOWED_ORIGINS` to the exact frontend origin, including scheme and port.
- **No alert emails:** alerts come from `next-app`, not this service. Check `SMTP_HOST`, `SMTP_FROM`, and `CRON_SECRET` there, and that the user has email and race-start alerts on.
