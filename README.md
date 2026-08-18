# Shipyard

Plan. Build. Ship.

Shipyard is an open-source project management platform for small software engineering teams.

This repository contains the application monorepo. Product planning, UX, UI, architecture, and engineering specifications are maintained separately in [`shipyard-design`](https://github.com/YONATANEMEKETE/shipyard-design).

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
├── web/                 Next.js App Router public surface
└── api/                 Express + TypeScript modular monolith

packages/
└── shared/              Shared Zod contracts and TypeScript types

.github/
└── workflows/           GitHub Actions CI
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

## Stack

- Next.js App Router and React
- Express and TypeScript
- PostgreSQL and Prisma
- Zod API contracts in `packages/shared`
- pnpm workspaces
- Turborepo
- ESLint and Prettier
- Husky, lint-staged, and Commitlint

## Requirements

- Node.js greater than `24`
- The exact local Node version listed in `.nvmrc`
- pnpm `11.5.2`
- Git

This repository intentionally supports **pnpm only**. npm, Yarn, and Bun installations are rejected by the root `preinstall` guard.

## Quick start

Clone the repository:

```bash
git clone https://github.com/YONATANEMEKETE/shipyard.git
cd shipyard
```

Enable the pinned pnpm version through Corepack and install dependencies:

```bash
corepack enable pnpm
pnpm install
```

Start the web and API applications together:

```bash
pnpm dev
```

Open:

- Web: <http://localhost:3000>
- API health check: <http://localhost:4000/healthz>

The current foundation does not require production secrets or external services to start the starter applications.

## Commands

Run these commands from the repository root.

| Command                         | Purpose                                             |
| ------------------------------- | --------------------------------------------------- |
| `pnpm dev`                      | Start web and API development servers               |
| `pnpm build`                    | Build all workspaces through Turborepo              |
| `pnpm lint`                     | Lint all workspaces                                 |
| `pnpm typecheck`                | Typecheck all workspaces                            |
| `pnpm format`                   | Format supported repository files                   |
| `pnpm format:check`             | Check formatting without modifying files            |
| `pnpm audit --audit-level=high` | Fail on high or critical dependency vulnerabilities |
| `pnpm check`                    | Run lint, typecheck, formatting, audit, and build   |

Useful targeted commands:

```bash
pnpm --filter @shipyard/web dev
pnpm --filter @shipyard/api dev
pnpm turbo run build --filter=@shipyard/web
pnpm turbo run build --dry-run
pnpm turbo run build --force
```

Use `pnpm --filter` when intentionally working with one workspace. Use root commands for the normal project-wide workflow.

## Environment files

Environment files containing real values must never be committed.

The repository tracks examples such as:

```text
.env.example
```

Real local files such as these are ignored:

```text
.env
.env.local
.env.development
.env.production
```

Never place passwords, API keys, tokens, OAuth secrets, or database URLs in `.env.example`.

## Quality gates

Before opening a pull request, run:

```bash
pnpm check
```

The same quality gates run in GitHub Actions:

```text
repository policy
→ frozen pnpm install
→ dependency audit
→ lint
→ typecheck
→ format check
→ build
```

The workflow status check is named `quality`.

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

Pull requests are merged using the repository's **rebase** strategy. If `main` advances before merging:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the complete workflow.

## Current foundation status

The repository foundation currently includes:

- pnpm workspace and Turborepo configuration
- Next.js web starter
- Express API starter
- Shared TypeScript and Zod package
- Node and pnpm environment enforcement
- ESLint, TypeScript, and Prettier quality tooling
- EditorConfig and VS Code recommendations
- Environment-file protection
- Husky and Commitlint hooks
- GitHub collaboration files
- Strict GitHub Actions CI

Product feature implementation follows the engineering plan in `shipyard-design/04-Engineering`.
