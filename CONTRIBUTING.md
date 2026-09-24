# Contributing to Shipyard

Thank you for contributing to Shipyard.

Shipyard follows a plan-first workflow. Product decisions, UX, UI, architecture, and feature
specifications are maintained in the separate
[`shipyard-design`](https://github.com/YONATANEMEKETE/shipyard-design) repository. Application
changes in this repository should be backed by the relevant planning documents.

## Requirements

- Node.js greater than `24` — the exact version is in `.nvmrc`
- pnpm `11.5.2`
- Docker — the local database and the API integration tests both use containers
- Git

Shipyard uses pnpm only. Do not use npm, Yarn, or Bun in this repository.

## Local setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/YONATANEMEKETE/shipyard.git
cd shipyard
corepack enable pnpm
pnpm install
```

Create the API's environment file, start the database, and apply migrations:

```bash
cp .env.example .env
pnpm db:up
pnpm --filter @shipyard/api db:migrate
```

Start the applications:

```bash
pnpm dev
```

The web application runs on `http://localhost:3000` and the API runs on `http://localhost:4000`.

The API validates its environment when it starts and refuses to boot with a missing or malformed
required variable. `DATABASE_URL` matches the container above out of the box, but
`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, the Google and GitHub OAuth credentials, and the five `R2_*`
storage variables need real values. The README's local development section lists each one and where
to get it. Sentry, PostHog, and OpenTelemetry are optional and stay off while their variables are
empty.

## Database and migrations

- The schema is `apps/api/prisma/schema.prisma`; migrations live in `apps/api/prisma/migrations/`.
- Create a migration with a snake_case name:

  ```bash
  pnpm --filter @shipyard/api exec prisma migrate dev --name add_issue_watchers
  ```

- Never edit a migration that has already been applied — add a new one instead.
- The Prisma client is generated into `apps/api/src/generated/`, which is gitignored. `pnpm install`
  regenerates it through the root `prepare` script, so never commit generated files.
- The API integration tests deploy every migration onto a fresh PostgreSQL container, so a broken
  migration fails the suite rather than a review. The cycles migration creates the `btree_gist`
  extension, which needs `CREATE` on the database — a role without that privilege fails fast with a
  clear extension error.

## Tests

| Scope      | Command                                | What it covers                                                 |
| ---------- | -------------------------------------- | -------------------------------------------------------------- |
| Everything | `pnpm test`                            | Both suites through Turborepo                                  |
| API        | `pnpm --filter @shipyard/api test`     | Unit and integration tests (`apps/api/test/`), Vitest          |
| Web        | `pnpm --filter @shipyard/web test`     | Unit and component tests (`apps/web/test/`), Vitest with jsdom |
| End to end | `pnpm --filter @shipyard/web test:e2e` | Playwright specs in `apps/web/e2e/`                            |

The API suite starts its own PostgreSQL 17 container, so Docker must be running — it never touches
your development database. The Playwright suite is not wired into CI; run it locally when a change
touches a flow it covers.

## Monorepo rules

Run project-wide commands from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Use workspace filters for targeted work:

```bash
pnpm --filter @shipyard/web dev
pnpm --filter @shipyard/api dev
pnpm --filter @shipyard/web add <dependency>
pnpm --filter @shipyard/api add <dependency>
```

Add repository-wide tooling at the root:

```bash
pnpm add -Dw <dependency>
```

Use `workspace:*` for local package dependencies. Applications should consume shared contracts
through `@shipyard/shared`, not through relative imports that cross package boundaries. Email
templates belong in `@shipyard/email` for the same reason.

## Environment files

Never commit real environment files or secrets. Each app reads its own file — the repository root
belongs to the API, `apps/web` to the web app:

```text
.env                  API (from .env.example)
apps/web/.env.local   Web (from apps/web/.env.example)
```

Ignored:

```text
.env
.env.local
.env.development
.env.production
```

Use placeholder values only in example files. Do not commit passwords, tokens, OAuth credentials,
database URLs, or private keys. `NEXT_PUBLIC_*` values are inlined when the web app is built, so a
change to one needs a rebuild rather than a restart.

## Branches

Create every branch from an updated `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
```

Allowed branch prefixes are:

- `feature/`
- `fix/`
- `chore/`
- `docs/`
- `ci/`
- `hotfix/`

Use lowercase kebab-case after the prefix:

```text
feature/add-issue-filters
fix/invalid-cycle-state
chore/update-eslint
```

The pre-push hook rejects branch names outside these patterns.

## Commits

Use Conventional Commits:

```text
type(optional-scope): description
```

Examples:

```text
feat: add dashboard shell
feat(auth): add login form
fix(api): return consistent health response
docs: update contribution guide
chore: update dependencies
ci: add dependency audit
refactor(shared): simplify issue schema
test: add issue service tests
```

The commit-msg hook rejects messages that do not follow this format. Keep the body wrapped at 100
characters per line — `body-max-line-length` in `@commitlint/config-conventional` rejects longer
lines.

## Hooks

Husky runs these checks automatically:

| Hook         | Responsibility                   |
| ------------ | -------------------------------- |
| `pre-commit` | Run lint-staged on changed files |
| `commit-msg` | Validate Conventional Commits    |
| `pre-push`   | Validate the branch name         |

The complete quality suite runs in CI and through `pnpm check` rather than on every commit.

## Before opening a pull request

Format and verify the repository:

```bash
pnpm format
pnpm check
pnpm test
git diff --check
```

`pnpm check` runs:

```text
lint
→ typecheck
→ format check
→ dependency audit
→ build
```

For visible UI changes, manually verify the affected flow and include screenshots in the pull
request.

## Pull requests

1. Push your branch.
2. Open a pull request into `main`.
3. Complete the pull request template.
4. Explain the problem, solution, and verification steps.
5. Wait for both the `quality` and `test` CI checks to pass.
6. Resolve all review conversations.
7. Rebase if `main` has advanced.
8. Request review from the code owner when applicable.
9. Use the repository's rebase merge strategy after approval.

CI runs the same gates locally available through `pnpm check` and `pnpm test`:

```text
quality:  repository policy → frozen pnpm install → dependency audit → lint
          → typecheck → format check → build
test:     frozen pnpm install → API and web test suites
```

If the base branch has advanced:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Do not use plain `git push --force` after rebasing.

## Pull request expectations

Every pull request should:

- Have a focused purpose.
- Include relevant planning references when applicable.
- Avoid unrelated formatting or dependency changes.
- Include tests or explain why tests are not applicable.
- Pass lint, typecheck, formatting, audit, build, and test checks.
- Avoid committing secrets or generated output.
- Include screenshots for visible UI changes.
- Update the documentation in this repository when a change alters how the project is set up,
  configured, or self-hosted.

## Keeping the repository healthy

Before updating dependencies:

```bash
pnpm audit --audit-level=high
pnpm outdated
```

Do not add a dependency to an individual app when it belongs at the root, and do not add application
dependencies to the root just because the root can resolve them. Keep package dependency boundaries
explicit.

Generated directories such as `node_modules`, `.turbo`, `.next`, `dist`, `coverage`, and TypeScript
build-info files should not be committed.

## Licensing

Shipyard is released under the MIT License — see [`LICENSE`](../LICENSE).

By opening a pull request you agree that your contribution is licensed under the same terms. No
contributor agreement, copyright assignment, or sign-off is required, which means three rules apply
to what you send:

- **Do not paste code, configuration, or assets you do not have the right to license under MIT.** If
  a snippet came from a blog post, another repository, or a generated file whose terms you have not
  checked, say where it came from in the pull request so its license can be verified.
- **Keep dependencies license-compatible.** Permissive licenses (MIT, ISC, BSD, Apache-2.0), weak
  copyleft (MPL-2.0, LGPL-3.0), and public-domain dedications are acceptable when unmodified. Do not
  add a GPL or AGPL dependency to any workspace, and do not add an asset under a non-commercial or
  no-derivatives license.
- **Keep the notices current.** After adding, removing, or upgrading a dependency, run:

  ```bash
  pnpm licenses:notices
  ```

  and commit the regenerated `THIRD_PARTY_NOTICES.md` in the same pull request.

If you want your contribution attributed differently than your commit author line, say so in the
pull request.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow [`SECURITY.md`](SECURITY.md) and report it
privately through GitHub's private vulnerability reporting.
