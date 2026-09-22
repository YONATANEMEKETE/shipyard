# syntax=docker/dockerfile:1

# Shipyard API — production image (Render web service / self-hosters).
#
# The build context is the repository root: the API needs the pnpm workspace
# (@shipyard/shared, @shipyard/email) and the lockfile.
#
#   docker build -f apps/api/Dockerfile -t shipyard-api .
#
# The runtime image carries only what the API needs to run: the compiled
# server, the generated Prisma client, the Prisma CLI (migrations run from the
# start command, ADR-007), and the API's production dependencies.

FROM node:26-alpine AS build

# Node's official images no longer bundle corepack (Node 25+), so install it
# from npm; it then honours the `packageManager` pin in package.json.
# OpenSSL is required by the Prisma CLI (schema engine) on Alpine.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache openssl \
 && npm install -g corepack \
 && corepack enable

WORKDIR /repo

# HUSKY=0: the root `prepare` script runs husky, which fails without a .git
# directory. That same script still runs `prisma generate` — exactly what the
# image needs, since apps/api/src/generated is gitignored.
# The store is thrown away in the same layer: it is a duplicate of everything
# in node_modules and would otherwise be committed to the layer (~1 GB).
COPY . .
RUN HUSKY=0 pnpm install --frozen-lockfile --filter "@shipyard/api..." --store-dir /tmp/pnpm-store \
 && rm -rf /tmp/pnpm-store

# Build the workspace dependencies first — the API imports their compiled
# output, and its own build resolves @shipyard/shared through node_modules.
RUN pnpm --filter @shipyard/shared build \
 && pnpm --filter @shipyard/email build \
 && pnpm --filter @shipyard/api build

# ── Runtime ──────────────────────────────────────────────────────────────────

FROM node:26-alpine AS runtime

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache openssl \
 && npm install -g corepack \
 && corepack enable

ENV NODE_ENV=production
WORKDIR /repo

# Production dependency tree for the API only. The manifests are copied first
# so the install resolves just this closure — the web app's dependencies and
# every dev tool stay out of the image.
#
# One RUN on purpose: everything installed-but-unwanted must be deleted in the
# same layer, because a later RUN could only white files out, not reclaim the
# bytes. That means the pnpm store and cache (both duplicates of what is
# already in node_modules) and `next` — which enters the graph only as an
# optional peer of better-auth and a devDependency of @react-email/ui, and is
# never imported by the API. The corepack cache stays: the start command runs
# `pnpm`, and a cold cache would make the container download pnpm at boot.
# `--ignore-scripts` skips lifecycle scripts (the root `prepare`, package
# postinstalls): nothing here needs them, because the compiled output is
# copied from the build stage below.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/email/package.json packages/email/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --store-dir /tmp/pnpm-store \
 && rm -rf /tmp/pnpm-store /root/.cache/pnpm /root/.npm \
 && rm -rf node_modules/.pnpm/next@* node_modules/.pnpm/@next+*

# Compiled output, generated Prisma client, schema and migrations, and the
# start command.
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/email/dist packages/email/dist
COPY apps/api/scripts/start.sh apps/api/scripts/start.sh

EXPOSE 4000

# CMD, not ENTRYPOINT: `docker run <image> <cmd>` must be able to override the
# start command (e.g. a one-off `prisma migrate deploy`).
CMD ["sh", "apps/api/scripts/start.sh"]
