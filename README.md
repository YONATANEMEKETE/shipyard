# Shipyard

Plan. Build. Ship.

Shipyard is an open-source project management platform for small software engineering teams —
projects, cycles, issues, comments, and activity in one place, without the enterprise machinery. It
runs as a web app, an API, and an MCP server, so a team and its AI agents work in the same
workspace.

|              |                                                                        |
| ------------ | ---------------------------------------------------------------------- |
| **Live app** | <https://shipyard.yonatanem.com>                                       |
| **API**      | <https://api.shipyard.yonatanem.com> — `/healthz`, `/readyz`, `/mcp`   |
| **Planning** | [`shipyard-design`](https://github.com/YONATANEMEKETE/shipyard-design) |
| **License**  | [MIT](LICENSE) — free to self-host and modify                          |

![Shipyard — plan, build, ship](apps/web/public/og-image.png)

This repository contains the application monorepo. Product planning, UX, UI, architecture, and
engineering specifications are maintained separately in
[`shipyard-design`](https://github.com/YONATANEMEKETE/shipyard-design).

## What it does

| Area                   | Capability                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workspaces and members | Multiple workspaces, email invitations, `OWNER` / `ADMIN` / `MEMBER` roles, archiving, workspace switching                            |
| Issues                 | Board and list views, statuses, priorities, labels, assignees, due dates, blockers, issue history, workspace-scoped keys (`SHIP-12`)  |
| Projects               | Planned / active / completed projects with owners, target dates, and progress derived from their issues rather than stored separately |
| Cycles                 | Time-boxed cycles with non-overlapping date ranges, current-cycle tracking, and progress derived the same way                         |
| Comments and mentions  | Threaded discussion on an issue, `@mentions` that notify the mentioned member                                                         |
| Notifications          | In-app and email notifications for assignments and mentions                                                                           |
| Search                 | One search across issues, projects, cycles, members, and comment text                                                                 |
| Dashboard and activity | Current cycle, assigned work, and a workspace-wide activity feed of who changed what                                                  |
| Settings               | Profile, theme, workspace details, avatar upload, notification preferences, and agent access                                          |
| Auth                   | Email and password with verification, password reset, Google and GitHub OAuth, server-side sessions                                   |
| Agents (MCP)           | A streamable-HTTP MCP server at `/mcp`, driven by scoped per-member tokens minted in agent access                                     |

## Stack

- Next.js App Router and React for the web app (`apps/web`)
- Express and TypeScript modular monolith for the API (`apps/api`)
- PostgreSQL 17 and Prisma for persistence and migrations
- Better Auth for sessions, OAuth, and email verification
- Zod contracts shared by both applications (`packages/shared`)
- React Email templates (`packages/email`) delivered through Resend
- S3-compatible object storage (Cloudflare R2 in the reference deployment) for avatars
- Optional Sentry, PostHog, and OpenTelemetry → Grafana Cloud, each disabled when unset
- pnpm workspaces and Turborepo; ESLint, Prettier, Husky, lint-staged, Commitlint
- Vitest for unit and integration tests, Playwright for end-to-end tests
- Docker for the API image and the local database, with a Render blueprint for the reference
  deployment

## Repositories

| Repository                                                             | Responsibility                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| [`shipyard`](https://github.com/YONATANEMEKETE/shipyard)               | Application source code and implementation              |
| [`shipyard-design`](https://github.com/YONATANEMEKETE/shipyard-design) | Product, UX, UI, architecture, and engineering planning |

When working locally, keep both repositories beside each other:

```text
Shipyard/
├── shipyard-design/
└── shipyard/
```

## Monorepo structure

```text
apps/
├── web/                 Next.js App Router — marketing, auth, and the workspace app
│   ├── src/app/         routes: (marketing)/, (auth)/, w/, onboarding/, invite/
│   ├── src/components/  UI grouped by feature
│   └── e2e/             Playwright specs
└── api/                 Express + TypeScript modular monolith
    ├── prisma/          schema and migrations
    ├── scripts/         container start command
    └── src/
        ├── features/    one module per feature (routes → validation → permission → controller → service → repository)
        ├── common/      config, db, telemetry, analytics, middleware
        ├── lib/         auth, mailer, storage, logging
        └── generated/   Prisma client output (gitignored, built by `prepare`)

packages/
├── shared/              Shared Zod contracts and TypeScript types
└── email/               React Email templates

scripts/                 repository tooling (third-party notices, lint-staged runner)
.github/workflows/       GitHub Actions CI
```

The intended dependency direction is:

```text
packages/shared ──► apps/web
        │
        └──────────► apps/api
```

Applications consume shared contracts through the workspace package:

```json
{
  "@shipyard/shared": "workspace:*"
}
```

## Requirements

- Node.js greater than `24` — the exact local version is in `.nvmrc`
- pnpm `11.5.2`
- Docker (for the local PostgreSQL container) or any reachable PostgreSQL 17 instance
- Git

This repository intentionally supports **pnpm only**. npm, Yarn, and Bun installations are rejected
by the root `preinstall` guard.

## Local development

```bash
git clone https://github.com/YONATANEMEKETE/shipyard.git
cd shipyard
corepack enable pnpm
pnpm install
```

Create the API's environment file and fill in the values below:

```bash
cp .env.example .env
```

Start the database and apply migrations:

```bash
pnpm db:up
pnpm --filter @shipyard/api db:migrate
```

Start the web and API development servers together:

```bash
pnpm dev
```

Open:

- Web: <http://localhost:3000>
- API liveness: <http://localhost:4000/healthz>

The web app needs no configuration to start: `NEXT_PUBLIC_API_URL` falls back to
`http://localhost:4000`. The API validates its environment at boot and refuses to start when a
required variable is missing or malformed, so the values in the next table must be real.

### What the API needs before it starts

| Variable                                                                                            | Local value                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                      | Matches `pnpm db:up` out of the box: `postgresql://shipyard:shipyard@localhost:5433/shipyard`                                           |
| `BETTER_AUTH_SECRET`                                                                                | Any random string of 32+ characters (`openssl rand -base64 32`)                                                                         |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                         | A Google OAuth app whose redirect URI is `http://localhost:4000/api/v1/auth/callback/google`                                            |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                                                         | A GitHub OAuth app whose callback URL is `http://localhost:4000/api/v1/auth/callback/github`                                            |
| `RESEND_API_KEY`                                                                                    | A [Resend](https://resend.com) API key — verification, invite, and reset mail is sent through it                                        |
| `R2_ENDPOINT`, `R2_PUBLIC_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | Any S3-compatible endpoint and a public-read bucket for avatars. The bucket holds no secrets: access control is unguessable object keys |

`API_URL` and `WEB_URL` default to `localhost:4000` and `localhost:3000` and only need changing when
the app is reachable on other origins. Everything else in `.env.example` is optional — Sentry,
PostHog, and OpenTelemetry stay off entirely while their variables are empty, which is why local
development and the test suites send no telemetry.

## Commands

Run these commands from the repository root.

| Command                         | Purpose                                             |
| ------------------------------- | --------------------------------------------------- |
| `pnpm dev`                      | Start web and API development servers               |
| `pnpm build`                    | Build all workspaces through Turborepo              |
| `pnpm lint`                     | Lint all workspaces                                 |
| `pnpm typecheck`                | Typecheck all workspaces                            |
| `pnpm test`                     | Run the API and web test suites                     |
| `pnpm format`                   | Format supported repository files                   |
| `pnpm format:check`             | Check formatting without modifying files            |
| `pnpm audit --audit-level=high` | Fail on high or critical dependency vulnerabilities |
| `pnpm check`                    | Run lint, typecheck, formatting, audit, and build   |

Database and workspace commands:

| Command                                         | Purpose                                                        |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs`  | Start, stop, or follow the local PostgreSQL container          |
| `pnpm db:psql`                                  | Open a `psql` shell on the local database                      |
| `pnpm --filter @shipyard/api db:migrate`        | Create and apply a migration in development                    |
| `pnpm --filter @shipyard/api db:migrate:deploy` | Apply pending migrations (the API container runs this at boot) |
| `pnpm licenses:notices`                         | Regenerate `THIRD_PARTY_NOTICES.md`                            |

Useful targeted commands:

```bash
pnpm --filter @shipyard/web dev
pnpm --filter @shipyard/api dev
pnpm --filter @shipyard/api test
pnpm --filter @shipyard/web test
pnpm --filter @shipyard/web test:e2e
pnpm turbo run build --filter=@shipyard/web
pnpm turbo run build --dry-run
pnpm turbo run build --force
```

Use `pnpm --filter` when intentionally working with one workspace. Use root commands for the normal
project-wide workflow.

## Environment files

Environment files containing real values must never be committed. Each app reads its own file:

| File                         | Belongs to | Notes                                                                          |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `.env` (from `.env.example`) | API        | Read from the repository root by the API only                                  |
| `apps/web/.env.local`        | Web        | From `apps/web/.env.example`; `NEXT_PUBLIC_*` values are inlined at build time |

Real local files such as these are ignored:

```text
.env
.env.local
.env.development
.env.production
```

Never place passwords, API keys, tokens, OAuth secrets, or database URLs in example files.

## Self-hosting

Shipyard is a web app, an API, and a PostgreSQL database. The reference deployment runs the web app
on Vercel, the API as a container on Render, and the database on Neon, but nothing in the
application depends on those platforms.

| Piece    | What to run                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database | PostgreSQL 17. The cycles migration creates the `btree_gist` extension, so the role running migrations needs `CREATE` on the database.                                           |
| API      | The image built from `apps/api/Dockerfile`. It applies pending migrations on boot (`prisma migrate deploy`) and listens on `$PORT`, falling back to `API_PORT` (default `4000`). |
| Web      | The Next.js app: `pnpm --filter @shipyard/web build` then `pnpm --filter @shipyard/web start`, on any Node host or platform that builds from source.                             |

Build and run the API image from the repository root — the build context is the root, because the
API compiles against the workspace packages:

```bash
docker build -f apps/api/Dockerfile -t shipyard-api .
docker run --env-file .env.production -p 4000:4000 shipyard-api
```

### Required for a public instance

| Variable                                                                                                | Why                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV=production`                                                                                   | Secure session cookies and real email delivery                                                                                                                                 |
| `DATABASE_URL`                                                                                          | A PostgreSQL 17 connection string                                                                                                                                              |
| `BETTER_AUTH_SECRET`                                                                                    | Random string of 32+ characters; rotating it invalidates every session                                                                                                         |
| `API_URL` / `WEB_URL`                                                                                   | Public origins. `API_URL` builds OAuth redirect URIs and email links; `WEB_URL` is the trusted browser origin                                                                  |
| `COOKIE_DOMAIN`                                                                                         | The parent domain shared by both hosts (e.g. `example.com`). Without it the session cookie is host-only and the web app cannot authenticate against an API on another hostname |
| `TRUST_PROXY_HOPS`                                                                                      | `1` behind a single reverse proxy or platform edge                                                                                                                             |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`               | OAuth apps whose callback URLs are `{API_URL}/api/v1/auth/callback/google` and `…/github`                                                                                      |
| `RESEND_API_KEY` / `RESEND_FROM`                                                                        | Verification, invite, and reset email                                                                                                                                          |
| `R2_ENDPOINT` / `R2_PUBLIC_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_PUBLIC_BASE_URL` | An S3-compatible endpoint and a public-read bucket for avatars                                                                                                                 |

Optional integrations — Sentry (`SENTRY_API_DSN`, plus `NEXT_PUBLIC_SENTRY_DSN` for the web app),
PostHog (`POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`), and OpenTelemetry
(`OTEL_EXPORTER_OTLP_*`) — each stay completely off while their variables are unset. Set
`SENTRY_RELEASE` on hosts that expose no commit SHA, and see the comments in `.env.example` for the
rest.

The operator still owns the pieces a platform would otherwise provide: TLS and a reverse proxy in
front of both services, PostgreSQL backups, OAuth app registration, domain verification at the mail
provider, and the bucket policy. The
[`docker-compose.yml`](docker-compose.yml) in this repository is the **development** compose — it
starts PostgreSQL for local work — and `render.yaml` is the reference deployment's blueprint rather
than a requirement.

## Quality gates

Before opening a pull request, run:

```bash
pnpm check
pnpm test
```

The same gates run in GitHub Actions, as two status checks:

```text
quality:  repository policy → frozen pnpm install → dependency audit → lint
          → typecheck → format check → build
test:     frozen pnpm install → API and web test suites
```

## Git workflow

Shipyard uses GitHub Flow:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
```

Allowed branch prefixes:

```text
feature/
fix/
chore/
docs/
ci/
hotfix/
```

Commits use Conventional Commits:

```text
type(optional-scope): description
```

Examples:

```text
feat: add dashboard shell
fix(api): handle invalid health request
docs: update local setup
chore: update dependencies
ci: strengthen quality gate
```

Pull requests are merged using the repository's **rebase** strategy. If `main` advances before
merging:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the complete workflow.

## License

Shipyard is released under the [MIT License](LICENSE).

The license covers the source code. It does not cover the project's name or its logo: forks are
welcome, but a fork must not present itself as the official Shipyard project, and the Shipyard name
and the Precision Loop mark may not be used in a way that suggests endorsement or authorship.

Third-party components and assets keep their own licenses — including the typefaces the web app
bundles. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); regenerate it with
`pnpm licenses:notices` after adding or changing a dependency.

Self-hosters run their own instance: their users' data, and any terms of service or privacy notice
they publish, are their responsibility rather than this project's. Report vulnerabilities privately
as described in [`SECURITY.md`](SECURITY.md).
