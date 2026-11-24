# 05. Local setup and deployment

The kit itself is never deployed. **Each client project is deployed on its
own**, from its own repo, image, database and domain. Everything here applies
to a client project (and to the kit when you run it locally).

## Local (laptop)

Needs Node 22, pnpm 9 (`corepack pnpm` if `pnpm` is not on the path) and
Docker Desktop.

```sh
pnpm install
cp env.example .env.local     # set APP_BASE_URL=http://localhost:3000, a SESSION_SECRET of 32+ chars,
                              # DATABASE_URL=postgres://app_user:app-dev@localhost:<port>/postgres, PROVIDERS=fake
set -a; . ./.env.local; set +a
docker compose -f docker/compose.dev.yml up -d   # Postgres; kit 5435, clients have their own port
pnpm migrate && pnpm seed
pnpm dev                      # http://localhost:3000
pnpm worker                   # second shell: sends messages, runs timed jobs
pnpm staff:create owner@example.test             # owner login at /admin
```

With `PROVIDERS=fake` nothing leaves the machine: messages land in
`app.fake_messages` (read booking codes there), photos go to memory, AI
answers are fixed. The local Postgres containers are listed in
`~/Containers/CLAUDE.md`; inside Claude Code's sandbox, `docker` commands
need the sandbox turned off for that command.

## What production runs

One image (`docker/Dockerfile`), built by CI on every merge into `main`,
tagged **only** with the commit SHA (`ghcr.io/<owner>/<repo>:<sha>`; never
`latest`), pushed only after smoke tests pass.

| Container | Command | Notes |
|---|---|---|
| web | `node server.js` (image default) | Port 3000, plain HTTP behind the server's proxy (Traefik on the current VPS). Health: `GET /healthz` (200 only when the database answers) |
| worker | `node worker/main.js` | No port. Without it no code, reminder or alert is ever sent |

Both read the same environment, are stateless and can be replaced at any
time. Logs are JSON on stdout. No persistent folders: back up the database
schema and the storage bucket.

## Environment

Every name is in `env.example` with a comment. Required: `APP_BASE_URL`,
`SESSION_SECRET` (`openssl rand -hex 32`; changing it logs everyone out and
breaks private links), `DATABASE_URL` (the app's restricted role),
`DB_SCHEMA` (empty means `app`), `PROVIDERS=real`, `SITE_NOINDEX=true` until
launch.

Each outside service is **all or nothing**: fill all its keys or none. A
half-filled service stops start-up and names the missing key; an empty one
hides its feature.

| Service | Keys | Empty means |
|---|---|---|
| Storage (S3-compatible, public bucket) | `STORAGE_*` | No photo uploads |
| Messaging | `MESSAGING_DRIVER` + `WHATSAPP_*`, `WEBHOOK_SECRET_MESSAGING` (meta) or `TWILIO_*` (twilio) | Booking by email only, or "call us" |
| Email | `EMAIL_DRIVER`, `EMAIL_FROM` + `EMAIL_API_*` (http) or `SMTP_*` or `GMAIL_*` | No email codes or messages |
| Owner push | `VAPID_*` (generate once, never change) | No phone alerts |
| AI | `AI_*` | AI switches greyed out (only if the `ai` extension is on) |

Booking online needs messaging or email, because it sends a code.
Provider setup steps (Resend, Meta WhatsApp templates and webhook) are in
`docs/guide.md` Part 1.

## Database

- Postgres 16, its own schema per client (`DB_SCHEMA`), its own role with
  `usage, create` on that schema only. Row-level security on every table.
  `docker/dev-init/01-schema.sql` is the local equivalent.
- `btree_gist` and `pgcrypto` must be created by a superuser before the
  first migration (the first migration stops with a clear message if not).
- **Migrations never run on start-up.** They are a release step, run with
  the **new** image before switching:

  ```sh
  docker run --rm --env-file .env --network <net> <image> node worker/migrate.js --check
  docker run --rm --env-file .env --network <net> <image> node worker/migrate.js
  docker run --rm --env-file .env --network <net> <image> node worker/seed.js   # when new starting content was added
  ```

  The runner applies the core's migrations and then **every** extension's,
  whether the extension is on or off, one transaction per file, recorded in
  `schema_migrations`. (Sarah's `DEPLOY.md` says switched-off extensions'
  folders "must not be applied"; that is wrong, the runner applies them all
  by design, and it is harmless.)
- Because migrations are additive, the previous image still runs on the new
  database, so a rollback is just switching the tag back.

## First deploy of a client

How it is done today: the **app agent** (a session in the client's repo)
writes `DEPLOY.md` in the client repo, a handover with names only, no
secret values; the **server agent** (a session with access to the VPS)
follows it. `~/Containers/sarah/DEPLOY.md` is the model; copy its headings:
App, Image, Containers, Environment variables, Database, Storage, Persistent
folders, Resources, Check after deploy, Deploy notes, Questions.

Order on the server:

1. Create the schema, the role and the two Postgres extensions.
2. Create the storage bucket (public read).
3. Write the server's `.env` from `env.example`.
4. Pull the image by SHA, run `migrate.js`, then `seed.js`.
5. Start web and worker; route the domain to web:3000 (keep
   `/api/webhooks/` reachable without any password gate).
6. The owner creates their own account: `node worker/staff-create.js <email>`
   in the web container (it prints the authenticator key; nobody else keeps it).
7. Check: `/healthz` is 200; home page in each language; `/admin` login;
   `migrate.js --check` lists nothing; the worker log has no repeating error;
   one real booking end to end once a code channel is set up.

## Each later release

1. Merge into the client's `main`; wait for CI's `image` job.
2. On the server, with the new tag: `migrate.js --check`, `migrate.js`
   (and `seed.js` if the build notes say so).
3. Switch web and worker to the new tag together (on Fluffy Fur's server:
   `bin/ffctl deploy <tag>`; elsewhere, the server's own compose).
4. Check `/healthz`, the home page and `/admin`.
5. Roll back by switching the tag back.

When a kit update brings a new environment variable or migration, add it to
the client's `DEPLOY.md` "Later commits" with the commit that needs it.

## CI (`.github/workflows/ci.yml`)

On every pull request and push to `main`, for each test client in the
matrix: install, apply that client file with `pnpm brand`, migrate and seed
twice, lint, typecheck, unit tests, build, check the bundled scripts start,
browser tests, dependency audit. On `main` only: build the image, run each
script in it, push by SHA. A client project's matrix is trimmed by
`pnpm kit new` to the test clients that fit it.

The kit and the clients currently have **no git remote**. To use CI, each
repo needs a host (GitHub: `git remote add origin <url> && git push -u origin main`),
and each client's `kit` remote must point at the kit's new address
(`pnpm kit update --from <url>` once).
