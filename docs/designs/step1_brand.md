# bookingKit, step 1: the brand in one file

## Context

The booking system is now sold to more than one client. Safa Clinic was made by
copying Fluffy Fur and hand-editing about 180 files: the name, the `ff_`
prefixes and the `fluffyfur` schema name had to be replaced in about 45 files,
the brand colour drifted across four places outside the CSS, and the pet
features were deleted. The two repos have already built the same features twice.

The agreed direction is a template repo outside the client projects,
`~/Containers/bookingKit`, built in three steps:

1. **The brand in one file** (this plan).
2. Later: features as modules, switched on or off by config. A switched-off
   module stays in the code and is never deleted.
3. Later: a `kit new` command that reads a client blueprint, clones the
   template and writes the starting prompt.

Outcome of step 1: changing one file (`client.json`) and running one command
re-skins the whole app: name, colours, fonts, corner rounding, logo mark, app
icon and brand wording. No client name is left anywhere else in the code.

Fluffy Fur and Safa are not touched. The kit starts from Fluffy Fur's current
code (`build/v1` at `8bd7e5e`) and not from Safa, because Fluffy Fur still has
every feature intact, and the rule is switch off, never delete. Safa's
additions (Arabic, booking approval, split hours, logo upload) are brought in
later as a languages setting and modules.

## Decisions

- **One source file: `client.json` at the repo root.** It holds `brand` and
  `theme` now and gains `modules` in step 2, so `kit new` only ever writes one
  JSON file. `src/brand.ts` is a small typed loader; `src/brand.schema.ts`
  (zod) validates it.
- **The brand is fixed at build time.** Each client has its own repo and image,
  so nothing needs to change at runtime.
- **The CSS is generated and committed.** `scripts/brand-css.ts` writes
  `src/app/brand.css` (the font imports plus the Tailwind `@theme` block) from
  `client.json`. `pnpm brand` regenerates it and a unit test fails when it is
  out of date. No build hooks are needed, because Playwright and `next dev`
  start Next directly.
- **`brand.css` is imported after `@import "tailwindcss"`** in `globals.css`.
  Imported before it, the theme lands outside Tailwind's layer and breaks the
  English font switch (`html[lang="en"]`, `globals.css:81`).
- **The palette is about 27 values.** Status colours (focus, success, warn,
  danger, closed) stay fixed in `globals.css`.
- **Fonts come from a small pre-installed set** of `@fontsource-variable`
  packages (Rubik, Fredoka, Nunito, Heebo are already installed). The generator
  fails with a clear message when `client.json` names a font that is not
  installed.
- **Identifiers become neutral once**, not per client: every client has its own
  domain and database, so cookie names, the cache name and the schema name do
  not need the client's name in them.
- **The owner's own entries still win.** The name she types in the owner area
  (`business_profile`) keeps showing in the header, footer and search results;
  `client.json` supplies the default, the browser title, the app name and the
  seed.

## `client.json` shape

```json
{
  "brand": {
    "name": { "he": "Fluffy Fur", "en": "Fluffy Fur" },
    "shortName": "Fluffy Fur",
    "description": { "he": "…", "en": "…" },
    "adminTitle": { "he": "…", "en": "…" },
    "mark": "paw",
    "messages": { "he": { "home.heroTitleAccent": "…" }, "en": { … } }
  },
  "theme": {
    "colors": { "brand": "#b23a6b", "ink": "#3a1f2b", "canvas": "#fff8f5", … },
    "fonts": { "sans": "rubik", "display": "fredoka", "latin": "nunito" },
    "radius": { "card": "1.75rem", "control": ".875rem", "pill": "999px", "panel": "1.5rem" },
    "shadowFloat": "0 8px 24px rgb(178 58 107 / 0.1)",
    "appIcon": { "from": "#8d3a6c", "to": "#5e2147", "mark": "#fdeee2" }
  }
}
```

`mark` is limited to closed-shape icons (`paw`, `sparkle`, `home`, …) because
the app icon fills the shape.

## Steps

One commit per step; `pnpm typecheck && pnpm lint && pnpm test` after each.

**0. Create the repo.**
`git archive HEAD` from fluffyFare into `~/Containers/bookingKit`, `git init`,
first commit "Start from the Fluffy Fur system at 8bd7e5e". Drop client-only
docs (`docs/releases`, drift and zoom-out reports); keep the Fluffy design as
`docs/reference/`. Rewrite `CLAUDE.md` and `README.md` for the kit. Set the CI
image tag to `ghcr.io/${{ github.repository }}`. Add
`tests/e2e/visual.spec.ts`, run only with `VISUAL=1`, snapshots gitignored, and
capture the baseline (static pages, both languages, 390 and 1440 wide).
No GitHub remote and no push until you create the repo and give me its link.

**1. `client.json`, loader, schema, generator.**
New: `client.json`, `src/brand.ts`, `src/brand.schema.ts`,
`scripts/brand-css.ts`, `src/app/brand.css`, `.prettierignore`,
`tests/unit/brand.test.ts` (schema, drift, contrast of about 12 colour pairs).
Edit: `src/app/globals.css` (font imports and `@theme` colour, font, radius and
shadow values move out), `package.json` (`"brand"` script, name).
A pure move: the built CSS must be identical.

**2. Stray values become tokens.**
`globals.css`: literal colours at lines 68, 251, 304–311, 389, 396–397 and the
component radii (`.btn`, `.chip`, `.input`, `.choice`, `.slot`, `.alert`,
`.day`, `.cal-sheet`) use tokens. In TSX only `rounded-[28px]` (12 uses)
becomes `rounded-card`, which is the same 28px. The hero arch shapes and other
one-off radii stay.

**3. Code reads the brand.**
`src/app/layout.tsx` (theme colour), `src/app/manifest.ts`,
`src/app/admin/manifest.webmanifest/route.ts`,
`src/app/app-icon/[variant]/route.tsx` (uses `ICON_PATHS[brand.mark]`, exported
from `src/components/ui/Icon.tsx`; the copied paw path is deleted),
`src/server/site.ts` (fallback name), `src/server/notify/email.ts` (subject),
`src/server/staff/auth.ts` (authenticator app name), and the brand-mark uses of
the paw (site header fallback, admin header, admin login, not-found, offline).
Pet decoration paws stay as they are.
One intended visible change: the admin app manifest's stale colours
(`#2b2238`, `#fbf6f1`) are replaced by the current palette.

**4. Brand wording.**
`src/i18n/t.ts`: merge `brand.messages` where `STRINGS` is built, which covers
server, client and worker. `site.name` and `admin.title` come from the brand.
The three "fluff" pun keys get neutral text in `he.json`/`en.json` and the
Fluffy wording moves to `client.json`. `tests/unit/t.test.ts` checks parity on
the merged strings.

**5. Seed and service workers.**
`db/seed/data.he.json`, `data.en.json`: the name becomes a `%BRAND%` marker,
replaced inside `seed()` in `db/seed/seed.ts` (not a `{brand}` placeholder,
which would shift the WhatsApp parameter count). WhatsApp template names
become neutral (`booking_code`, …). `public/sw.js`: cache name `app-v1`.
`public/admin-sw.js`: generic fallback title.

**6. Neutral identifiers.**
Cookies and headers `ff_*` → `bk_*` (8 constants in `src/server/staff/cookie.ts`,
`staff/auth.ts`, `security.ts`, `booking/draft.ts`, `identity/tokens.ts`,
`attribution.ts`, `src/i18n/locales.ts`), the storage key in
`src/components/site/InstallPrompt.tsx`, CSS classes `ff-event*`/`ff-day*` →
`cal-*` (`globals.css`, `src/components/admin/Calendar.tsx`), env `FF_SERVICE`
→ `APP_SERVICE`. Schema name: one helper `src/server/db-schema.ts` reading
`DB_SCHEMA` (default `app`, validated as a plain identifier), used by
`src/server/db.ts`, `scripts/migrate.ts`, `db/seed/seed.ts`,
`docker/dev-init/01-schema.sql`, `tests/setup/env.ts`, the e2e specs,
`playwright.config.ts`, `.github/workflows/ci.yml`, `env.example`.

**7. Prove the swap.**
`tests/fixtures/client.sample.json` (a different name, palette, fonts and
mark). A permanent unit test scans `src/`, `public/` and `worker/` for the
default name and brand hex outside `client.json`. Note in
`docs/build-notes.md`; short "how to re-brand" section in `README.md`.

## Not in this step

Modules, extra languages (Arabic), logo upload, layout variants, legal page
wording, the Dibs import, and the `kit new` command.

## Verification

- After steps 1–6: `VISUAL=1 pnpm test:e2e` shows zero pixel difference from
  the step 0 baseline, except the admin manifest colours in step 3. After
  step 1 the built CSS in `.next/static` is byte-identical.
- Full `pnpm test` and `pnpm test:e2e` (axe contrast on every page, both
  languages) pass with the default brand.
- Swap test in a scratch copy: put `client.sample.json` over `client.json`,
  run `pnpm brand`, unit tests and `CI=1 pnpm test:e2e`; then search the build
  output and a freshly seeded database for `fluffy` and `b23a6b` and expect no
  hits. Screenshots of the home page and booking page at 390 and 1440 wide for
  you to look at.

## Working notes

- The new folder is outside this session's working directory, so creating it
  and running its tests need the sandbox off, as with Safa.
- The kit uses its own dev database and ports so it can run next to Fluffy Fur
  and Safa (Postgres 5435, dev 3500, e2e 3600).
- Commits as Khalil, local only, until you ask for a push.
