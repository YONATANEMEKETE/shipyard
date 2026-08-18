# Shipyard

Plan. Build. Ship.

Shipyard is an open-source project management platform for small software engineering teams.

This repository contains the application monorepo. Product planning, UX, UI, architecture, and engineering specifications remain in the separate [`shipyard-design`](../shipyard-design) repository.

## Repository structure

```text
apps/
├── web/          Next.js public surface
└── api/          Express + TypeScript modular monolith

packages/
└── shared/       Shared Zod contracts and TypeScript types
```

## Phase 1 status

The repository currently contains the minimal monorepo foundation:

- pnpm workspace declaration
- Turborepo task graph
- Next.js web starter
- Express API starter
- Shared TypeScript/Zod package
- Root development and build commands

Repository environment pinning, formatting, linting, Git hooks, CI, and GitHub collaboration rules are added in later setup phases.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
```

The development command starts the web application on port `3000` and the API on port `4000`.
