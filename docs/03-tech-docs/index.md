# Technical documentation

> **Status: scaffold.** Deep-dives get added here as subsystems settle; planned pages below. Until a page exists, the package source plus its README is the reference (`packages/core/README.md`, `packages/core/CONSUMER-ATOMS.md`).

## Planned pages

- **The `@layer` model** — the cascade contract (`tokens.defaults -> tokens.presets -> reset -> atomic -> components.nave -> components.consumer -> overrides`), the precondition it holds under (Nave's order statement is the first `@layer` declaration the page sees), where consumer CSS goes, and what counts as a breaking change. The decision itself is [ADR 0003](../04-adr/0003-layer-cascade-contract.md).
- **The DTCG 2025.10 token pipeline** — `tokens.json` (DTCG 2025.10, a Final Community Group Report; a community specification, not a standards-track one) through the first-party reader (`build.ts`) into CSS custom properties and JS/TS; the three-tier token hierarchy; theming and modes.
- **The `@nave` directive** — the host-free directive core (resolution, CSS placement) that inlines atomic utilities at build time, and its adapters (PostCSS today); the zero-runtime guarantee.
- **`cx()` and consumer atoms** — static atom mapping and the consumer-atoms story.
- **The bridges** — how `@navecss/bridge` maps tokens onto Base UI and Radix primitives, and what the bridge does NOT redistribute.
- **The CLI registry** — the component-registry format and the `navecss add` flow.
- **CI/CD and release topology** — the Turborepo graph, Changesets, and the publish flow.

A higher-level architecture map lives outside this repo, in the project's own internal reference; these pages hold the detail and are its canonical reference targets.
