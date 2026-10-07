# Getting started

> **Status: scaffold.** Fill in as the setup stabilizes.

## Prerequisites

- Node >= 22.18 (the repo is ESM-only)
- pnpm (version pinned via `packageManager` in the root `package.json`)

## Setup

```bash
pnpm install
pnpm run build     # builds every package in the workspace through Turborepo
```

`pnpm run dev` runs the package watchers. `pnpm run ci:check` is the full local gate; it must be green before a PR is marked ready. Its steps are enumerated once, in [`.github/CONTRIBUTING.md`](../../.github/CONTRIBUTING.md).

## Where things live

See the [package list](../index.md#packages) for what each package is and whether it is published, the [architecture section of `CLAUDE.md`](../../CLAUDE.md#architecture) for the dependency direction, and [03-tech-docs](../03-tech-docs/index.md) for the deep-dives.
