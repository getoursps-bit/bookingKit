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
