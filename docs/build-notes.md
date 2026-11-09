# Build notes

Notes for the kit itself. Fluffy Fur's notes, from the system this started as,
are in [`reference/fluffy_fur_build_notes.md`](reference/fluffy_fur_build_notes.md).

## Step 1: the brand in one file

Design: [`designs/step1_brand.md`](designs/step1_brand.md).

### 0. The repo (2026-11-09)

- A clean copy of Fluffy Fur's tracked files at `8bd7e5e`, with a new history.
- Fluffy Fur's design, brief, concepts and build notes moved to
  `docs/reference/`; its release notes and review reports were dropped.
- Its own compose project (`bookingkit`) and ports, so it runs next to the
  client projects: Postgres 5435, end-to-end tests 3600.
- CI names the image after the repository, in lower case.
- `tests/e2e/visual.spec.ts` takes a picture of each public page in both
  languages at phone and wide widths. It runs only with `VISUAL=1` and the
  pictures are not committed.

### 1–7. The brand file (2026-11-09)

**Built**

- `client.json` holds the name (Hebrew and English), the brand mark, the
  client's own wording, fonts, 29 palette colours, five corner radii, three
  shadows and the app icon colours. `src/brand.schema.ts` describes and checks
  it; `src/brand.ts` is what the code imports.
- `pnpm brand` (`scripts/brand-css.ts`) writes `src/app/brand.css` from it.
  The file is committed; `globals.css` imports it after Tailwind and keeps
  only the status colours, which are the same for every client.
- The manifests, theme colour, app icon, fallback name, email subject and the
  authenticator app name read the brand. The icon shown for a missing logo or
  photo is the brand mark.
- The language files say `{brand}` where the name goes; `src/i18n/t.ts` lays
  the client's wording over them once, for pages, browser code and the worker.
- The seed text says `%BRAND%` and `seed()` fills it in.
- Neutral names: cookies `bk_*`, calendar classes `cal-*`, log tag
  `APP_SERVICE`, WhatsApp templates `booking_*`, schema from `DB_SCHEMA`
  (default `app`, local role `app_user`).

**Verified**

- After each of the six code steps, the 40 page pictures (20 pages, phone and
  wide) matched the starting look with no pixel changed, and the five app
  icons are byte-identical to Fluffy Fur's.
- `pnpm test`: 206 tests. `pnpm test:e2e`: 61 pass, including axe on every
  page in both languages.
- Swap proof: with `tests/fixtures/client.sample.json` in place of
  `client.json` (another name, a teal palette, Heebo, the sparkle mark,
  tighter corners), the unit tests and all 61 browser tests pass, and neither
  the build output nor a freshly seeded database contains the default name or
  accent colour.
- Unit tests that stay: the palette's main text pairs reach 4.5:1 (both
  clients), `brand.css` matches `client.json`, the client's wording only
  replaces strings that exist, the seed leaves no marker behind, and no file
  in `src`, `public`, `worker`, `scripts` or `db` repeats the client's name or
  accent colour.

**Changed on purpose**

- The owner app's manifest had an older palette; it now uses the current
  accent and page colours.
- The owner calendar's selection highlight follows the accent; it had kept an
  older raspberry.

**Left for the next steps**

- The pet wording, pet icons on service cards, the hero sticker and the seed
  content (services, products such as "Fluffy Fresh", hours) are still
  Fluffy Fur's. They belong to the modules step and to per-client seed data.
- The privacy and accessibility pages are written for a grooming salon.
- Languages are still Hebrew and English in code; Arabic comes from Safa's
  work as a setting.
- A new font means adding its `@fontsource-variable` package; four are
  installed (Rubik, Fredoka, Nunito, Heebo).
- The bundled `worker/dist/migrate.js` only finds the migrations inside the
  image layout, as before.
