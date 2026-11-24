# 06. Testing and the definition of done

## The checks

| Command | What | Needs |
|---|---|---|
| `pnpm lint` | ESLint; fails on physical left/right CSS | — |
| `pnpm typecheck` | TypeScript for the app and the tests | — |
| `pnpm test` | Vitest unit tests; `*.db.test.ts` use the local Postgres | Postgres up, migrated |
| `pnpm test:e2e` | Playwright at phone width, axe accessibility on every page, the booking flow; starts its own server on port 3600 | `pnpm exec playwright install chromium` once |
| `VISUAL=1 pnpm test:e2e visual` | Compares page pictures (`--update-snapshots` takes new ones) | Only when a visible change is meant |
| `pnpm build` | Production build and the worker bundle | — |
| `pnpm brand --check` | Generated files match `client.json` and the packs | — |
| `pnpm lang:check [code]` | Packs against the contract | — |
| `pnpm migrate --check` | Nothing pending | Postgres |

## Tests that guard the architecture

| Test | Guards |
|---|---|
| `tests/unit/boundaries.test.ts` | SQL only in the core and extensions' `server/`; platform does not reach into booking |
| `tests/unit/brand.test.ts` | `client.json` shape, readable colour contrast, no client name or colour outside `client.json` |
| `tests/unit/languages.test.ts` | Every pack has every key with the same placeholders |
| `tests/unit/extensions.test.ts` | Registries match `client.json`; manifest ids match folders; extension migrations run after the core's |
| `tests/unit/notify.test.ts` | Every driver's keys listed; nothing outside notify imports a driver |
| `tests/unit/kit.test.ts` | `kit new` and `kit update` on a copy of the kit |
| `tests/unit/appointments.db.test.ts` | Holds, overlap, statuses |
| `tests/unit/time.test.ts`, `slots.test.ts` | Local times across both clock changes |

If one of these fails, fix the code, not the test. The "known" lists in
`boundaries.test.ts` may only get shorter.

## The test clients

The suite must pass for several shapes of client, so nothing quietly
depends on the default client or on an extension being on:

| File | Shape |
|---|---|
| `client.json` | The default: Hebrew + English, `pets`, `ai`, `dibs-import` |
| `tests/fixtures/client.sample.json` | Another name, palette, fonts; Hebrew + Arabic; `pets`, `map-links` |
| `tests/fixtures/client.plain.json` | No extensions at all |
| `tests/fixtures/client.notes.json` | `ai` and `split-hours` |
| `tests/fixtures/client.requests.json` | `approval` alone |

Run the whole check as another client with
`scripts/with-client.sh <file> <command>`, which swaps `client.json`,
runs the command and puts the committed one back:

```sh
scripts/with-client.sh tests/fixtures/client.plain.json pnpm test
```

A new extension that the default client does not use gets its own fixture,
added to the CI matrix. Extension tests use
`describe.skipIf(!hasExtension("<id>"))`; a core test never mentions an
extension.

## Writing tests

- Times: build dates through `src/core/platform/time.ts` helpers and the
  helpers in `tests/setup/days.ts`; test both daylight-saving changes when
  touching slots or reminders.
- Messages: with `PROVIDERS=fake`, assert on `fake_messages` or the outbox,
  never on a real provider.
- No real phone numbers, emails or names in tests; use the fake ranges the
  existing tests use (`+97255500xxxx`…) and `owner@example.test`.
- Browser tests run at phone width; check right-to-left pages.

## Definition of done

1. The full check passes for the default client and every fixture
   (CI does this; locally run at least the default, `plain`, and the
   fixture of any extension you touched).
2. Visible changes are checked at phone width in a right-to-left and a
   left-to-right language; page pictures updated on purpose only.
3. A note in `docs/build-notes.md`: what was built, how it was verified,
   what is not done or not checked.
4. A decision taken on the way is written into the design it belongs to,
   with the date.
5. Committed on a branch, merged into `main`, and taken into each client
   with `pnpm kit update`.
