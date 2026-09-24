# NaveCSS monorepo documentation

Engineering documentation for the **NaveCSS** monorepo: a standards-first, zero-runtime CSS design-system library published as the `@navecss/*` packages (`tokens`, `core`, `bridge`, `cli`), built with pnpm + Turborepo and versioned with Changesets.

This tree holds the docs that version with the code: getting started, contribution workflow, technical deep-dives, and Architecture Decision Records. The reasoning behind an architectural decision is in its ADR under [`04-adr/`](./04-adr/index.md), which is the place to read before changing what it covers. For anything these pages do not answer, such as a feature request, a bug or a question about where the project is heading, [open an issue](https://github.com/navecss/navecss/issues).

> **Status: scaffold.** The structure below is authoritative; pages are being filled in as the subsystems settle. When a page you need is missing, flag the gap rather than inventing a convention.

## 🏁 Getting started

Prerequisites, install, and your first build of the token pipeline.

[Let's get started!](./01-getting-started/index.md)

## 🫶 How to contribute

Branching, Conventional Commits, Changesets, the CI check set, and how a change becomes a release.

[Let's push some changes](./02-contribute/index.md)

## 🧑‍🚀 Technical documentation

How the packages work and why: the `@layer` model, the DTCG 2025.10 token pipeline, the PostCSS `@nave` plugin, the bridges, the CLI registry.

[Let's dive in!](./03-tech-docs/index.md)

## 📐 Architecture Decision Records

The key architectural decisions that shape this library, with context, options, and consequences.

[View ADRs](./04-adr/index.md)

## Packages

- **[packages/tokens](../packages/tokens/)** — DTCG 2025.10 token source + first-party build pipeline; emits CSS custom properties and JS/TS.
- **[packages/core](../packages/core/README.md)** — Layer architecture, reset, generated atomic utilities, `cx()`/atoms, PostCSS `@nave` plugin.
- **[packages/bridge](../packages/bridge/)** — CSS token bridges for Base UI and Radix UI.
- **[packages/cli](../packages/cli/)** — Component-registry CLI (`navecss add ...`).
