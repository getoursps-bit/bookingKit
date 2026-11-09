# Production image for Fluffy Fur. One image, two entry points:
#   web (default):  node server.js
#   worker:         node worker/main.js
# Release steps:    node worker/migrate.js [--check], node worker/seed.js
# No secrets are baked in; all configuration comes from the environment.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
# The app handles SIGTERM itself (src/instrumentation.ts), not Next.js.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 NEXT_MANUAL_SIG_HANDLE=true
WORKDIR /app

# Web: Next.js standalone server with its static assets.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Worker and release scripts: one bundled file each. Migrations run as a
# separate release step (node worker/migrate.js), never on start-up.
COPY --from=build --chown=node:node /app/worker/dist/main.js /app/worker/dist/migrate.js /app/worker/dist/seed.js \
  /app/worker/dist/import-dibs.js /app/worker/dist/staff-create.js ./worker/
COPY --from=build --chown=node:node /app/db/migrations ./db/migrations

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
