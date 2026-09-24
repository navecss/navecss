# Getting started

> **Status: scaffold.** Fill in as the setup stabilizes.

## Prerequisites

- Node >= 22.18 (the repo is ESM-only)
- pnpm (version pinned via `packageManager` in the root `package.json`)

## Setup

```bash
pnpm install
pnpm run build     # builds the full Turborepo graph: tokens -> core -> bridge -> cli
```

`pnpm run dev` runs the package watchers. `pnpm run ci:check` is the full local gate (typecheck, lint, test, build); it must be green before a PR is marked ready.

## Where things live

See the [architecture section of `CLAUDE.md`](../../CLAUDE.md) for the package map and the dependency direction, and [03-tech-docs](../03-tech-docs/index.md) for the deep-dives.
