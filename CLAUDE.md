# NaveCSS — Claude Code Context

Standards-first, zero-runtime CSS design-system library. pnpm + Turborepo monorepo publishing `@navecss/*` packages: `tokens` (DTCG 2025.10 token source + first-party build pipeline), `core` (`@layer` architecture, reset, atomic utilities, PostCSS `@nave` plugin), `bridge` (Base UI / Radix token bridges), `cli` (component-registry CLI). Node >=22.18, ESM-only, Changesets versioning. Package manager: **pnpm**.

## Principles

- KISS · YAGNI · DRY · Colocation
- Avoid: rigidity, fragility, immobility, needless complexity, opacity
- Small focused functions; descriptive names; no flag arguments; named exports
- **Web standards are the substrate, and this outranks the line above when they collide.** Where a standard specifies what we need — CSS first, HTML and JS on the same footing — build on it instead of inventing a parallel mechanism: a spec is maintained, implemented and kept compatible by people outside this project, and outlives any bespoke solution. Anything the platform lawfully expresses is in scope, so the open question is _when_ we support it, never _whether_. Two riders keep this honest. **Standards, not tools:** the thing not to reinvent is the _standard_; a third-party implementation of one is not a standard, and a first-party reader for a published spec is not reinvention. **A refusal is a stated decision:** where an invariant below forbids something CSS-lawful, say so and say why — an input surface that never decided has not thereby decided "no".
- **Adopt at Baseline, and state the floor:** a platform feature is adoptable once it is Baseline (shipped in all three engines). If that raises the supported browser floor, the ADR adopting it says so explicitly. Drafts and single-engine features are not adoptable.
- **Zero-runtime is an invariant** (and it outranks the standards rule above — that is what the "stated decision" rider is for)**:** `@nave` directives inline at build time and `cx()` maps to static atoms. Nothing may reintroduce runtime style computation. What the invariant covers and excludes: `docs/04-adr/0004-zero-runtime-scope.md`.
- **The `@layer` cascade order is a public contract** (`tokens -> reset -> atomic -> components.nave -> components.consumer -> overrides`): consumer overrides always win, no specificity conflicts, **provided Nave's order statement is the first `@layer` declaration the document sees** (a consumer layer registered earlier inverts the order). A change to layer ordering or naming is a breaking change. The seven names, the precondition and the consumer's obligation: `docs/04-adr/0003-layer-cascade-contract.md`.
- **Tokens flow one way:** DTCG source in `@navecss/tokens` builds to CSS custom properties and JS. `core` and `bridge` depend on `tokens`, never the reverse; the CLI stays a thin registry client; no package leaks another's internals across its export map.

## Before You Code

State your assumptions before implementing. If multiple interpretations exist, name them, do not pick silently. If something is unclear, ask; do not guess and revise.

Touch only what the task requires. Do not improve adjacent code. When your changes make something unused (imports, variables, functions), remove it, but do not remove pre-existing dead code unless asked.

For multi-step tasks, state a brief plan with a verify step per item before executing.

## Commands

| Purpose         | Command                                                             |
| --------------- | ------------------------------------------------------------------- |
| Dev (watch)     | `pnpm run dev`                                                      |
| Build all       | `pnpm run build`                                                    |
| Lint            | `pnpm run lint` (ESLint + Stylelint + Prettier check)               |
| Auto-fix        | `pnpm run lint:fix`                                                 |
| Typecheck       | `pnpm run typecheck`                                                |
| Full CI check   | `pnpm run ci:check`                                                 |
| Version/release | `pnpm run changeset` / `pnpm run release` (deliberate, human-gated) |

## Architecture

```
packages/tokens/   → DTCG token source (tokens.json) + first-party DTCG reader (build.ts); emits CSS custom properties + JS/TS
packages/core/     → reset.css, @layer stack (index.css), generated atomic utilities, cx()/atoms, PostCSS @nave plugin
packages/bridge/   → base-ui.css / radix.css token bridges (CSS-only; depends on tokens)
packages/cli/      → navecss CLI (component registry: `navecss add ...`); thin registry client
packages/stylelint-config/ → published stylelint rules for a consumer's project (`@nave` known, `var()`-or-keyword values on listed properties, the outline guard); depends on neither tokens nor core
```

Dependency direction: `core`, `bridge` -> `tokens`. `cli` orchestrates, owns no styles. Public-API and token-contract changes are deliberate, versioned events (Changesets), not incidental.

## Before You Start

These docs are authoritative. Read the relevant one before making decisions, not after.

| If you're about to...                      | Read first                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Get oriented in the monorepo               | `docs/01-getting-started/index.md`                                                                              |
| Change workflow, conventions, or checks    | `docs/02-contribute/index.md`                                                                                   |
| Understand a subsystem in depth            | `docs/03-tech-docs/index.md`                                                                                    |
| Make or revisit an architecture call       | `docs/04-adr/` (scan existing ADRs first)                                                                       |
| Touch the token pipeline or layer contract | `docs/03-tech-docs/index.md` (still a scaffold), plus `packages/tokens/README.md` and `packages/core/README.md` |

The docs tree is a scaffold being filled in; when a page you need does not exist yet, follow existing patterns in the immediate directory and flag the gap.

## Git Workflow

1. Branch: `<type>/<short-description>` off `main`, where `<type>` is one of the Conventional Commit types in step 2 — the same list commitlint enforces on subjects, so the repo keeps one convention rather than two. The description describes the change (`fix/calc-paren-depth`); it is not an issue number.
2. Conventional Commits (commitlint-enforced): `feat` (minor), `fix`/`perf`/`revert` (patch); `refactor`, `test`, `chore`, `ci`, `style`, `build`, `docs` (patch, hidden). Breaking change: `!` or `BREAKING CHANGE:` footer.
3. Open a **draft PR on first push**; `pnpm run ci:check` must pass before marking ready for review
4. User-facing changes ship with a Changeset (`pnpm run changeset`); publishing (`pnpm run release`) is human-gated

## When in Doubt

Follow existing patterns in the immediate directory over rules in this file. When the codebase contradicts CLAUDE.md, flag it in your response, do not silently enforce the doc. Read the relevant doc before making an architecture decision, not after.
