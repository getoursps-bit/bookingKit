# 04. Client projects

## The model

```text
~/Containers/bookingKit        the kit (this repo), branch main
        │  pnpm kit new                       │  pnpm kit update (run in the client)
        ▼                                     ▲
~/Containers/<client>          a git clone of the kit + the client's own commits
                               remote "kit" → the kit; kit.json → the kit commit it is level with
```

A client project is a **clone of the kit with the client's commits on top**,
not a copy. That is what lets `pnpm kit update` merge later kit changes in.

Client projects today:

| Client | Folder | Postgres port | Own extensions | Own views |
|---|---|---|---|---|
| Vered Beauty | `~/Containers/veredBeauty` | 5436 | `courses` | `site.*` (frame, home, services, gallery, hours, …) |
| Sarah | `~/Containers/sarah` | 5437 | `atelier` | `site.frame`, `site.home` |

The next client gets port 5438 (see `~/Containers/CLAUDE.md`, the Docker
workspace registry, and update it). Fluffy Fur (`fluffyFare`) and Safa Clinic
(`safaClinic`) were built before the kit and are **not** clones of it.

## Making a client

Use the `new-client` skill (`.claude/skills/new-client/SKILL.md`): give it
the business's description in any form and it writes the blueprint, makes
the project, starts its database, migrates, seeds, runs the checks and
reports. By hand:

1. Write `blueprints/<client>.yaml` from `blueprints/example.yaml`, which
   explains every field (name per language, business, languages,
   extensions, mark, theme colours, wording, services, products, hours,
   wishes). Blueprints of real clients are git-ignored in the kit.
2. The kit must have nothing uncommitted. Run
   `pnpm kit new blueprints/<client>.yaml` (or `--into <folder>`).
3. In the new folder: `pnpm install`, `cp env.example .env.local` and fill
   the local values, `docker compose -f docker/compose.dev.yml up -d`,
   `pnpm migrate && pnpm seed`, then the full check.
4. `INITIAL_PROMPT.md` in the project is the task list for the first working
   session there: the look, the wishes, what is still to translate.

## Keeping clients level

```sh
pnpm kit status          # in the kit: each client next to it, and how many kit commits behind
cd ~/Containers/<client>
pnpm kit update          # fetch the kit's main, merge, regenerate, record kit.json, commit
pnpm install             # if it says the libraries changed
pnpm migrate             # if it lists new migrations
# then the full check, then that client's own release (05-deployment.md)
```

`pnpm kit update` refuses a project with uncommitted work. On a conflict it
stops with the merge open and names the files; resolve them (the client's
own intent wins in its own files, the kit's in core files), or
`git merge --abort`. If the kit has moved or is on a git host,
`pnpm kit update --from <folder or url>` once.

After every kit change that clients should get: commit in the kit, then run
the update in **every** client that `pnpm kit status` lists as behind.

## What a client may change (and what it must not)

| In a client repo | Allowed | Why |
|---|---|---|
| `client.json`, `theme/`, `languages/*/content.json`, `db/seed/data.json` | Yes | These are the client's |
| `extensions/<its own id>/` | Yes | Its own customisations |
| `theme/views.ts` overrides of `site.*` views | Yes | Merges cleanly |
| Overrides of `admin.*` views | Avoid | It stops receiving the kit's owner-area improvements |
| Core files (`src/core`, `src/views`, `src/extension`, `db/migrations`, `scripts`) | **No** | Every such edit conflicts on the next update. Fix it in the kit instead |
| A kit extension's files | **No** | Same; switch it off or make its own |
| `CLAUDE.md` / `README.md` opening paragraph | Yes (it was rewritten by `kit new`) | The kit never changes those paragraphs |

If a client needs something the core cannot do, the answer is a new
extension point in the kit (`03-adding-features.md` recipe C), then the
client's own extension uses it.

## Promoting a client's work into the kit

When a second client wants what one client built (for example Vered's
`courses`): copy the extension into the kit's `extensions/`, remove anything
client-specific (names, colours, wording go to `client.json` or packs),
add strings for every pack, tests with `skipIf`, a test client, and a build
note. Then in the original client, delete its own copy in the same commit
that takes the kit update, so it uses the kit's.

## Never

- Connect the kit to a client's server or database, or copy client data
  into the kit.
- Commit a client's blueprint, `.env`, phone numbers or customer data into
  the kit.
- Fix the same bug by hand in two clients.
