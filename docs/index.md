# NaveCSS monorepo documentation

Engineering documentation for the **NaveCSS** monorepo: a standards-first, zero-runtime CSS design-system library published as the `@navecss/*` packages (`tokens`, `core`, `stylelint-config`, `eslint-plugin`, and `base-ui` from its first release), built with pnpm + Turborepo and versioned with Changesets.

This tree holds the docs that version with the code: getting started, contribution workflow, technical deep-dives, and Architecture Decision Records. The reasoning behind an architectural decision is in its ADR under [`04-adr/`](./04-adr/index.md), which is the place to read before changing what it covers. For anything these pages do not answer, such as a feature request, a bug or a question about where the project is heading, [open an issue](https://github.com/navecss/navecss/issues).

> **Status: scaffold.** The structure below is authoritative; pages are being filled in as the subsystems settle. When a page you need is missing, flag the gap rather than inventing a convention.

## 🏁 Getting started

Prerequisites, install, and your first build of the token pipeline.

[Let's get started!](./01-getting-started/index.md)

## 🫶 How to contribute

Branching, Conventional Commits, Changesets, the CI check set, and how a change becomes a release.

[Let's push some changes](./02-contribute/index.md)

## 🧑‍🚀 Technical documentation

How the packages work and why: the `@layer` model, the DTCG 2025.10 token pipeline, the `@nave` directive (core implements it; PostCSS is one adapter), the Base UI package, the CLI registry.

[Let's dive in!](./03-tech-docs/index.md)

## 📐 Architecture Decision Records

The key architectural decisions that shape this library, with context, options, and consequences.

[View ADRs](./04-adr/index.md)

## Packages

Every directory under `packages/`. The published ones are also in the [README's package table](../README.md#packages), which is the place to look for what to install.

Published to npm:

- **[packages/tokens](../packages/tokens/README.md)** (`@navecss/tokens`): DTCG 2025.10 token source and first-party build pipeline; emits CSS custom properties and JS/TS.
- **[packages/core](../packages/core/README.md)** (`@navecss/core`): layer architecture, reset, generated atomic utilities, `cx()`/atoms, and the `@nave` directive, with its Vite, PostCSS and Lightning CSS adapters and the `navecss-core` command.
- **[packages/stylelint-config](../packages/stylelint-config/README.md)** (`@navecss/stylelint-config`): stylelint rules for a consumer's project that make `@nave` known to stylelint, require a `var()` or an admitted keyword on listed properties, flag `outline: none` and `outline: 0`, and check that a `var(--nave-*)` reference names a declared custom property.
- **[packages/eslint-plugin](../packages/eslint-plugin/README.md)** (`@navecss/eslint-plugin`): ESLint rules for a consumer's project that report a literal class in `className` unless it is declared, and a literal value on a tokenized `style` property.
- **[packages/base-ui](../packages/base-ui/)** (`@navecss/base-ui`, from its first release): Base UI's components pre-styled with Nave's tokens. Each component has its own subpath (`./dialog`, `./select` and the rest; the package root exports them all) that re-exports the parts of `@base-ui/react`, adding Nave's class names to the ones it styles. Their styles are one `styles.css`, built from role atoms through core's PostCSS adapter, so a consumer needs neither PostCSS nor the `@nave` directive. `@base-ui/react`, `react`, `react-dom` and `@navecss/tokens` are peer dependencies.

In the repository but not published (`private: true`):

- **[packages/cli](../packages/cli/)** (`@navecss/cli`): the `navecss` component-registry command; its commands are stubs until the registry exists.
