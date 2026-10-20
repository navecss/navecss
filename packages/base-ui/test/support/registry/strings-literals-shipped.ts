/**
 * The files the registry's shipped sentences live in, as they stood at the base release
 * (`e3f7c153`), held as literals: the lines a check needs, in their original line positions where
 * a check reads a line number. A control feeds them to a check to show the old line reds it.
 */

/**
 * `packages/cli/src/index.ts`, whole.
 */
export const BASE_CLI = [
  '#!/usr/bin/env node',
  '/**',
  ' * Nave CLI — @navecss/cli',
  ' * Component registry client. The commands are stubs until the registry exists;',
  ' * the package stays unpublished (ignored in .changeset/config.json) until then.',
  ' */',
  '',
  'const [command, ...args] = process.argv.slice(2)',
  '',
  "const NOT_YET = 'not implemented yet — the component registry does not exist'",
  '',
  'switch (command) {',
  "  case 'add': {",
  "    console.log(`[navecss] add: ${args.join(' ')} — ${NOT_YET}`)",
  '    break',
  '  }',
  "  case 'eject': {",
  '    console.log(`[navecss] eject — ${NOT_YET}`)',
  '    break',
  '  }',
  "  case 'init': {",
  '    console.log(`[navecss] init — ${NOT_YET}`)',
  '    break',
  '  }',
  '  default: {',
  '    console.log(',
  '      `',
  '  navecss — Nave Design System CLI',
  '',
  '  Commands:',
  '    init            Initialise Nave in your project',
  '    add [component] Add a component from the registry',
  '    eject           Export full token config for manual editing',
  '',
  '  Run \\`navecss [command] --help\\` for details.',
  '    `.trim(),',
  '    )',
  '  }',
  '}',
  '',
].join('\n')

/**
 * `CLAUDE.md`, the architecture block.
 */
export const BASE_CLAUDE = [
  '## Architecture',
  '',
  '```',
  'packages/tokens/   → DTCG token source (tokens.json) + first-party DTCG reader (build.ts); emits CSS custom properties + JS/TS',
  'packages/core/     → reset.css, @layer stack (index.css), generated atomic utilities, cx()/atoms, implements @nave (PostCSS is one adapter)',
  "packages/base-ui/  → Base UI's components styled with Nave's tokens: one React wrapper subpath per component that adds Nave's classes to the Base UI parts it styles, plus one stylesheet (dist/styles.css) of role atoms built through @nave; builds on core; peers on tokens, @base-ui/react and react",
  'packages/cli/      → navecss CLI (component registry: `navecss add ...`); thin registry client',
  "packages/stylelint-config/ → published stylelint rules for a consumer's project (`@nave` known, `var()`-or-keyword values on listed properties, the outline guard, declared `--nave-*` names); peer on tokens",
  "packages/eslint-plugin/   → published ESLint rules for a consumer's project (a declared/atom class channel in JSX, a reasoned `cx.raw()` escape, its count, tokenized `style` values); peer on core",
  '```',
  '',
].join('\n')

/**
 * `docs/index.md`, whole.
 */
export const BASE_DOCS_INDEX = [
  '# NaveCSS monorepo documentation',
  '',
  'Engineering documentation for the **NaveCSS** monorepo: a standards-first, zero-runtime CSS design-system library published as the `@navecss/*` packages (`tokens`, `core`, `stylelint-config`, `eslint-plugin`, and `base-ui` from its first release), built with pnpm + Turborepo and versioned with Changesets.',
  '',
  'This tree holds the docs that version with the code: getting started, contribution workflow, technical deep-dives, and Architecture Decision Records. The reasoning behind an architectural decision is in its ADR under [`04-adr/`](./04-adr/index.md), which is the place to read before changing what it covers. For anything these pages do not answer, such as a feature request, a bug or a question about where the project is heading, [open an issue](https://github.com/navecss/navecss/issues).',
  '',
  '> **Status: scaffold.** The structure below is authoritative; pages are being filled in as the subsystems settle. When a page you need is missing, flag the gap rather than inventing a convention.',
  '',
  '## 🏁 Getting started',
  '',
  'Prerequisites, install, and your first build of the token pipeline.',
  '',
  "[Let's get started!](./01-getting-started/index.md)",
  '',
  '## 🫶 How to contribute',
  '',
  'Branching, Conventional Commits, Changesets, the CI check set, and how a change becomes a release.',
  '',
  "[Let's push some changes](./02-contribute/index.md)",
  '',
  '## 🧑‍🚀 Technical documentation',
  '',
  'How the packages work and why: the `@layer` model, the DTCG 2025.10 token pipeline, the `@nave` directive (core implements it; PostCSS is one adapter), the Base UI package, the CLI registry.',
  '',
  "[Let's dive in!](./03-tech-docs/index.md)",
  '',
  '## 📐 Architecture Decision Records',
  '',
  'The key architectural decisions that shape this library, with context, options, and consequences.',
  '',
  '[View ADRs](./04-adr/index.md)',
  '',
  '## Packages',
  '',
  "Every directory under `packages/`. The published ones are also in the [README's package table](../README.md#packages), which is the place to look for what to install.",
  '',
  'Published to npm:',
  '',
  '- **[packages/tokens](../packages/tokens/README.md)** (`@navecss/tokens`): DTCG 2025.10 token source and first-party build pipeline; emits CSS custom properties and JS/TS.',
  '- **[packages/core](../packages/core/README.md)** (`@navecss/core`): layer architecture, reset, generated atomic utilities, `cx()`/atoms, and the `@nave` directive, with its Vite, PostCSS and Lightning CSS adapters and the `navecss-core` command.',
  "- **[packages/stylelint-config](../packages/stylelint-config/README.md)** (`@navecss/stylelint-config`): stylelint rules for a consumer's project that make `@nave` known to stylelint, require a `var()` or an admitted keyword on listed properties, flag `outline: none` and `outline: 0`, and check that a `var(--nave-*)` reference names a declared custom property.",
  "- **[packages/eslint-plugin](../packages/eslint-plugin/README.md)** (`@navecss/eslint-plugin`): ESLint rules for a consumer's project that report a literal class in `className` unless it is declared, and a literal value on a tokenized `style` property.",
  "- **[packages/base-ui](../packages/base-ui/)** (`@navecss/base-ui`, from its first release): Base UI's components pre-styled with Nave's tokens. Each component has its own subpath (`./dialog`, `./select` and the rest; the package root exports them all) that re-exports the parts of `@base-ui/react`, adding Nave's class names to the ones it styles. Their styles are one `styles.css`, built from role atoms through core's PostCSS adapter, so a consumer needs neither PostCSS nor the `@nave` directive. `@base-ui/react`, `react`, `react-dom` and `@navecss/tokens` are peer dependencies.",
  '',
  'In the repository but not published (`private: true`):',
  '',
  '- **[packages/cli](../packages/cli/)** (`@navecss/cli`): the `navecss` component-registry command; its commands are stubs until the registry exists.',
  '',
].join('\n')

/**
 * `docs/03-tech-docs/index.md`, its first 14 lines.
 */
export const BASE_TECH_INDEX = [
  '# Technical documentation',
  '',
  '> **Status: scaffold.** Deep-dives get added here as subsystems settle; planned pages below. Until a page exists, the package source plus its README is the reference (`packages/core/README.md`, `packages/core/CONSUMER-ATOMS.md`).',
  '',
  '## Planned pages',
  '',
  "- **The `@layer` model** — the cascade contract (`tokens.defaults -> tokens.presets -> reset -> atomic -> components.nave -> components.consumer -> overrides`), the precondition it holds under (Nave's order statement is the first `@layer` declaration the page sees), where consumer CSS goes, and what counts as a breaking change. The decision itself is [ADR 0003](../04-adr/0003-layer-cascade-contract.md).",
  '- **The DTCG 2025.10 token pipeline** — `tokens.json` (DTCG 2025.10, a Final Community Group Report; a community specification, not a standards-track one) through the first-party reader (`build.ts`) into CSS custom properties and JS/TS; the three-tier token hierarchy; theming and modes.',
  '- **The `@nave` directive** — the host-free directive core (resolution, CSS placement) that inlines atomic utilities at build time, and its adapters (PostCSS today); the zero-runtime guarantee.',
  '- **`cx()` and consumer atoms** — static atom mapping and the consumer-atoms story.',
  "- **The Base UI package** — how `@navecss/base-ui` wraps Base UI's components and builds its one stylesheet from Nave's tokens, and what it does NOT redistribute.",
  '- **The CLI registry** — the component-registry format and the `navecss add` flow.',
  '- **CI/CD and release topology** — the Turborepo graph, Changesets, and the publish flow.',
  '',
].join('\n')

/**
 * ADR 0003: the order statement's block, and `## Decision` through the precondition paragraph.
 */
export const BASE_ADR_0003 = [
  'The order is one statement:',
  '',
  '```css',
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;',
  '```',
  '',
  '## Decision',
  '',
  '**1. The contract is the seven names, in this order, and each has one owner.**',
  '',
  '| Layer                 | Holds                                                                                | Written by         |',
  '| --------------------- | ------------------------------------------------------------------------------------ | ------------------ |',
  "| `tokens.defaults`     | Nave's shipped token values (CSS custom properties)                                  | `@navecss/tokens`  |",
  '| `tokens.presets`      | Token values generated for a project (`navecss-tokens build`), and any future preset | the token build    |',
  '| `reset`               | Cross-browser normalisation                                                          | `@navecss/core`    |',
  '| `atomic`              | The global atom classes (`.nave-flex`, …) that `cx()` names                          | `@navecss/core`    |',
  '| `components.nave`     | Components Nave publishes                                                            | `@navecss/base-ui` |',
  "| `components.consumer` | The consumer's own component CSS                                                     | the consumer       |",
  "| `overrides`           | The consumer's deliberate exceptions to everything above                             | the consumer       |",
  '',
  '`tokens.defaults` has one writer, `@navecss/tokens`, which writes the `--nave-*`',
  'properties. `components.nave` has one writer, `@navecss/base-ui`, whose single',
  'stylesheet carries only rules inside that layer, restates the order statement,',
  'declares no custom property and sets no `z-index`.',
  '',
  '- **Correction (2026-10-14):** the stylesheet sets one `z-index`,',
  '  `z-index: var(--nave-layer-toast)` in `nave-base-ui-toast-placement`, the toast area. No layer',
  '  is renamed, reordered, removed or inserted: the order is as before. The declaration is admitted',
  '  on one criterion, a portalled container that exists before the overlays it must sit above, and',
  '  nothing else in the stylesheet may set a `z-index`.',
  '',
  'The top-level order is `tokens`, `reset`, `atomic`, `components`, `overrides`;',
  'the sublayers order within their parent as listed. Renaming, reordering,',
  'removing or inserting a layer is a breaking change to a published contract.',
  '',
  '**2. The contract holds under one precondition, and the precondition is part of',
  "the contract.** Nave's order statement must be the first `@layer` declaration",
  'the document sees. Every guarantee in this ADR is conditional on it. Nave cannot',
  'enforce it from inside its own stylesheets, because the failure is decided by',
  'bytes Nave does not write, so the obligation is stated to the consumer (below)',
  'and the means to meet it is shipped (decision 5).',
  '',
  "**3. The consumer's obligation: author into a named sublayer, with the standard",
].join('\n')

/**
 * ADR 0010: the end of its decision 6 and the start of `## Consequences`.
 */
export const BASE_ADR_0010 = [
  '**5. Versioning.** The package versions independently (ADR 0009). Base UI is a required peer,',
  'and a Base UI major is a major of this package; the peer floor is the oldest Base UI release',
  'whose declarations type-check against ours. A visual change is a `minor`.',
  '',
  "**6. A registry is a later delivery from the same source, not part of this record's shipped",
  'state.** The plan is a shadcn-format registry generated from the same source, as the way to own',
  'a copy of one component. It does not exist yet, and nothing here depends on it.',
  '',
  '## Consequences',
  '',
  '- `@navecss/bridge` is retired, never having published. Its two stylesheets were placeholders',
].join('\n')

/**
 * `packages/core/src/layers.css`, whole.
 */
export const BASE_CORE_LAYERS = [
  '/*',
  ' * Nave Design System — the @layer order statement, alone.',
  ' *',
  " * Import this first, before any other stylesheet. CSS fixes a layer's",
  ' * position the first time the page declares it, so if a stylesheet of yours',
  " * that declares a layer loads before this statement, that layer's position is",
  " * fixed first and Nave's order inverts with no error. Imported first, this one",
  ' * line keeps the order wherever the rest of Nave and your own stylesheets land',
  " * in the import graph. Importing '@navecss/core' afterwards is correct: its",
  ' * own copy of this statement is identical and changes nothing.',
  ' *',
  ' * Full contract:',
  ' * https://github.com/navecss/navecss/blob/main/docs/04-adr/0003-layer-cascade-contract.md',
  ' */',
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;',
  '',
].join('\n')
