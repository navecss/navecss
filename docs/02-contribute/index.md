# How to contribute

> **Status: scaffold.** The workflow below is the settled part; convention pages get added here as they are decided (each new convention becomes its own page, referenced from this index).

## Workflow

1. Branch off `main`: `type/short-description`.
2. Commit with Conventional Commits (commitlint-enforced): `feat` (minor), `fix`/`perf`/`revert` (patch); `refactor`, `test`, `chore`, `ci`, `style`, `build`, `docs` (patch, hidden in changelog). Breaking change: `!` or a `BREAKING CHANGE:` footer.
3. Open a **draft PR on first push**; run `pnpm run ci:check` and get it green before marking ready for review.
4. User-facing changes ship with a Changeset (`pnpm run changeset`). Publishing (`pnpm run release`) is deliberate and human-gated.
   - **How a release goes out:** run `pnpm changeset version` and merge the result to `main`, then run the `release` workflow from `main` (`.github/workflows/release.yml`, started by hand). It runs `pnpm run release`, which ends by _staging_ each new version on npm rather than publishing it: CI authenticates by OIDC through each package's trusted publisher, which allows staging only, and no npm token is stored anywhere. Nothing is installable until a maintainer approves each staged version with two-factor authentication (`npm stage approve <id>`, or the Staged Packages tab on npmjs.com), in the order the workflow prints, `@navecss/tokens` before `@navecss/core`. npm attaches provenance to versions released this way. The full procedure, including the GitHub Releases and what to do when something goes wrong, is in [Releasing](./releasing.md).
   - **Bump arithmetic before 1.0:** Changesets applies no `0.x` special-casing — it calls `semver.inc` directly, so at `0.1.0` a `major` changeset computes `1.0.0` and a `minor` computes `0.2.0`. Packages in a `fixed` group (`.changeset/config.json`) all take the highest release type in the batch, so one `major` carries every member of the group to `1.0.0` with it. Publishing `1.0.0` is a stability commitment and a maintainer decision, never a side effect of picking a bump level: before 1.0, ship a breaking change as `minor` and state the break in the changeset prose.

## The check set

`pnpm run ci:check` runs an 11-step chain (typecheck, lint, test, build, packaging and dependency checks, and the repo-root gates in `scripts/`, in that order); `.github/CONTRIBUTING.md` carries the canonical, gated, ordered list. `pnpm run ci:check:fix` auto-fixes what it can first. Never invoke the underlying linters with ad-hoc flags; the package scripts are the interface.

## Invariants every change respects

- **Zero runtime:** `@nave` directives inline at build time; `cx()` maps to static atoms. No runtime style computation, ever.
- **`@layer` order is a public contract:** changing layer ordering or naming is a breaking change.
- **Dependency direction:** `core` and `bridge` depend on `tokens`, never the reverse; the CLI stays a thin registry client.
- **Deliberate versioning:** public-API and token-contract changes are versioned events (Changesets), not incidental edits.

## Specs and tracking

Feature work for a persona- or phase-framed session follows a phase flow driven from project context outside this repo. The phase entry points are user-installed skills (`/nave:implement`, `/nave:review`, `/nave:orch-auto`, `/nave:orch-board`); this repo ships none of them, and each is self-sufficient — it tells the session what to read and where.
