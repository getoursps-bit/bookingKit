# Fluffy Fur

Hebrew, right-to-left website and booking system for one grooming salon.
The plan is `docs/designs/fluffy_fur.md`; the original brief is
`docs/build-brief.md` (the design wins where they differ). Build stage notes
are in `docs/build-notes.md`.

## Rules

- Hebrew, right to left, mobile first. Check every page at phone width.
- Use logical CSS only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`); lint fails on physical left/right classes.
- Wrap numbers, prices, times and phone numbers with `isolate()` / `t()` so they display in the right order.
- Two languages: Hebrew at plain paths, English under `/en`. Every string goes in both `src/i18n/he.json` and `en.json`; use `getI18n()` / `useI18n()`, `lp()` for links and `pick()` for owner text with an English field.
- One stateless container with two entry points (web, worker); health path `/healthz`; config from environment variables only; JSON logs; immutable image tags.
- Never write secrets, real phone numbers or customer data into code, tests, logs or commits.
- Every outside service sits behind an interface with a fake; `PROVIDERS=fake` locally and in CI.
- Times are stored in UTC and handled in Asia/Jerusalem through `src/server/time.ts` only. Test both clock changes.
- The no-overlap booking rule lives in the database, not only in code.
- Every message goes through the outbox and `route()`; nothing else picks a channel.
- AI never blocks or changes a booking.
- Migrations are plain SQL, additive first, and never run on app start-up.
- Ask before choosing a provider, adding a paid service, or changing a decision in the design.
- Finish each build stage with tests passing and a short note in `docs/build-notes.md`.

## Commands

- `docker compose -f docker/compose.dev.yml up -d` starts local Postgres (port 5433).
- `pnpm migrate` (`--check` lists pending) and `pnpm seed` apply the schema and starting content; both are safe to repeat.
- `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- `pnpm test:e2e` needs `pnpm exec playwright install chromium` once.
- `pnpm worker` runs the worker; `pnpm staff:create <email>` makes an owner account.
- `pnpm import:dibs <file.csv> --dry-run` (then `--freeze-time=<ISO>`, `--queue-links`, `--export-future=<file>`); switch day steps are in `docs/launch-checklist.md`.
