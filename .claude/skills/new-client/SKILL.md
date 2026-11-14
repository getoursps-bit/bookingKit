---
name: new-client
description: Start a new client project from the bookingKit template. Use when the user describes a new business that needs a website with online booking ("new client", "start a project for ...", "make a site for a salon/clinic/studio"), or types /new-client. Takes the client's description in any form (notes, voice-note transcripts, a treatment list, opening hours, a logo) and does the whole job - blueprint, project folder, database, checks - then hands over a ready project.
---

# New client from bookingKit

The user gives a description of a business. You turn it into a blueprint, make
the project with `pnpm kit new`, set it up, prove it works, and report. Do the
whole job in one go. Ask only when something below says to.

The kit is at `~/Containers/bookingKit`. Client projects are made next to it,
in `~/Containers/<folder>`. Read the kit's `README.md` section "A new client"
and `blueprints/example.yaml` before you start: the example explains every
blueprint field and is the source of truth if this file and it disagree.

Commands in the kit and in client projects need the sandbox off (they are
outside the session's folder, and they use Docker and the network). Use
`corepack pnpm`, not plain `pnpm`.

## 1. Read what the user gave

Pull out of the description:

| Needed | Where it goes | If it is missing |
| --- | --- | --- |
| Business name, in each language | `name` | Ask. Never invent a name. |
| What kind of business | `business` | Infer from the services. |
| Languages, and which is the default | `languages` | Ask. The kit has packs for `he`, `en`, `ar`; another language needs a pack added to the kit first, so say so and stop. |
| Services: name, minutes, price | `services` | Ask for the list. Use the user's durations; when they give a range, pick per service and say what you picked. "Price on request" is price 0. |
| Opening hours per day | `hours` | Ask. |
| Does the owner approve each booking | `extensions: [approval]` | Infer ("by prior arrangement only" means approval). |
| A break in the day | `extensions: [split-hours]` | Off unless the hours show one. |
| The look: colours, feel, logo | `theme`, `mark` | Keep the kit's look and list it as still to do. |
| Anything that is this client's alone | `wishes` | None. |

Ask every missing "Ask" item in one message, not one at a time. Everything
else you decide, and you list your decisions in the final report so the user
can correct them.

A wish is something the kit does not do (a courses page, a lead form, a
special section). Write each as one clear sentence in `wishes`. Do not build
wishes in this skill: they become tasks in the project's `INITIAL_PROMPT.md`.

For the look, read `src/brand.schema.ts` for the colour names and the font
list. Every text colour pair must reach 4.5:1 contrast; `tests/unit/brand.test.ts`
in the new project checks the main pairs. If the user points at a logo file,
look at it and take the palette from it. A font that is not in the schema's
list has to be added to the kit first; pick the closest one that is there and
say so.

Translate service names into each of the site's languages yourself and mark
them in the report as needing a native read.

## 2. Things that never go in a blueprint

- Phone numbers, addresses, emails or any customer data. The owner types her
  phone and address into her own settings later. If the user's text contains
  a phone number, leave it out and say that you did.
- Keys, passwords or tokens of any kind.

## 3. Make the blueprint

1. Folder name: the business name in camelCase (`veredBeauty`). Check that
   `~/Containers/<folder>` does not exist.
2. Postgres port: read "Ports in use" in `~/Containers/CLAUDE.md`, then check
   what is really bound with `docker ps --format '{{.Names}}\t{{.Ports}}'`.
   Take the next free port after the highest per-app Postgres port.
3. Write `~/Containers/bookingKit/blueprints/<folder>.yaml`, following
   `blueprints/example.yaml`. Blueprints other than the example are
   git-ignored on purpose; do not commit it to the kit.

## 4. Make the project

In `~/Containers/bookingKit`:

1. `git branch --show-current` must say `main` and `git status --short` must
   be empty. If the kit is on another branch or has uncommitted work, stop
   and tell the user what is there. Do not stash, commit or discard it.
2. `corepack pnpm kit new blueprints/<folder>.yaml`
3. If it reports problems with the blueprint, fix the blueprint and run it
   again. It writes nothing until the blueprint is valid.

## 5. Set the project up

Docker Desktop must be running. If `docker ps` fails, tell the user to start
it and stop here; you cannot start it yourself.

In `~/Containers/<folder>`:

```sh
corepack pnpm install
docker compose -f docker/compose.dev.yml up -d
corepack pnpm migrate
corepack pnpm seed
```

Do not read or print `.env` or `.env.local`.

## 6. Prove it works

```sh
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

`test:e2e` needs `corepack pnpm exec playwright install chromium` once per
machine. Report the real numbers. A failure caused by this client's content
(a colour pair under 4.5:1, a missing translation) you fix in the project and
commit there. A failure in the kit's own code is a kit bug: report it with
the output and do not patch around it inside the client's project.

## 7. Record it

- Add the project's row to the stack registry and its port to "Ports in use"
  in `~/Containers/CLAUDE.md`, and move the "next port" on by one.
- In the project, correct the lines of `INITIAL_PROMPT.md` that say nothing
  is installed and that the registry is still to do, since both are now done,
  and commit that.

## 8. Report

In plain, full sentences:

- where the project is, its Postgres port, and the test numbers;
- every decision you made for the user (durations, colours, fonts, which
  extensions are on) so they can correct them;
- what is still owed by the client (logo file, prices, a native read of the
  translations, course details and so on);
- the wishes, which are waiting as tasks in `INITIAL_PROMPT.md`;
- how to carry on: `cd ~/Containers/<folder>`, `claude`, then the message
  "Read INITIAL_PROMPT.md and CLAUDE.md, then start."

## Rules that are easy to break

- Never run the fake providers on a live site, and never choose a messaging,
  email or storage provider for the client. Ask.
- Do not create the owner's account. `pnpm staff:create <email>` is run by a
  person on the live system, with her real address.
- Do not push anything, create a GitHub repo, contact a server, or create a
  paid account.
- Do not delete Docker volumes or change a port another project uses.
- Do not change the kit's code to suit one client. What only this client
  needs is a wish, built later in the client's own project as its own
  extension.
