# Contributing to Shipyard

Thank you for contributing to Shipyard.

Shipyard follows a plan-first workflow. Product decisions, UX, UI, architecture, and feature specifications are maintained in the separate [`shipyard-design`](https://github.com/YONATANEMEKETE/shipyard-design) repository. Application changes in this repository should be backed by the relevant planning documents.

## Requirements

- Node.js greater than `24`
- The exact version in `.nvmrc`
- pnpm `11.5.2`
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

Start the applications:

```bash
pnpm dev
```

The web application runs on `http://localhost:3000` and the API runs on `http://localhost:4000`.

## Monorepo rules

Run project-wide commands from the repository root:

```bash
pnpm lint
pnpm typecheck
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

Use `workspace:*` for local package dependencies. Applications should consume shared contracts through `@shipyard/shared`, not through relative imports that cross package boundaries.

## Environment files

Never commit real environment files or secrets.

Allowed:

```text
.env.example
```

Ignored:

```text
.env
.env.local
.env.development
.env.production
```

Use placeholder values only in example files. Do not commit passwords, tokens, OAuth credentials, database URLs, or private keys.

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

The commit-msg hook rejects messages that do not follow this format.

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

For visible UI changes, manually verify the affected flow and include screenshots in the pull request.

## Pull requests

1. Push your branch.
2. Open a pull request into `main`.
3. Complete the pull request template.
4. Explain the problem, solution, and verification steps.
5. Wait for the `quality` CI check to pass.
6. Resolve all review conversations.
7. Rebase if `main` has advanced.
8. Request review from the code owner when applicable.
9. Use the repository's rebase merge strategy after approval.

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
- Pass lint, typecheck, formatting, audit, and build checks.
- Avoid committing secrets or generated output.
- Include screenshots for visible UI changes.

## Keeping the repository healthy

Before updating dependencies:

```bash
pnpm audit --audit-level=high
pnpm outdated
```

Do not add a dependency to an individual app when it belongs at the root, and do not add application dependencies to the root just because the root can resolve them. Keep package dependency boundaries explicit.

Generated directories such as `node_modules`, `.turbo`, `.next`, `dist`, and TypeScript build-info files should not be committed.
