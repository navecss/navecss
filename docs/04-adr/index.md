# Architecture Decision Records

ADRs record significant architectural choices: the context, the options considered, and the trade-offs accepted. Read the relevant ADR before making a decision that touches its domain; scan this index before writing a new one.

## Conventions

- Files are numbered `NNNN-short-slug.md`, immutable once accepted; a change of mind is a NEW ADR that amends or supersedes the old one (state which, in both). `NNNN` is the ADR's id: unique, derived from the filename, never restated in frontmatter.
- Detailed ADRs live HERE and version with the code. One canonical home per fact: an ADR carries its decision's full reasoning, and any other page that mentions the decision links to the ADR rather than restating it.
- An ADR is the technical record of a decision, not its approval. A decision that affects accessibility conformance or licensing also needs the maintainer's approval of that side of it: if you are proposing one, [open an issue](https://github.com/navecss/navecss/issues) for it.
- An ADR's status lives in its own `- **Status:**` bullet below (accepted / superseded / deprecated) and nowhere else — it is not duplicated into frontmatter; only facts with no other home are structured there.
- **ADR-to-ADR supersession is structured, not prose.** An ADR that replaces an earlier one carries `supersedes: "<old-id>-<slug>"` in its own frontmatter (or a list, for more than one); the ADR it replaces carries the reciprocal `superseded-by:` and its `- **Status:**` bullet reads `superseded`. Both ends must name each other or the lint flags a one-way link: a reader who opens only the superseded ADR and never thinks to check what replaced it is left holding stale guidance with no forwarding address, and that failure is invisible to every other check until it is named on both ends. `scripts/check-adr-structure.mjs` (wired into `scripts:check`) enforces this, plus ADR-id uniqueness and the `## Deprecation` section a `status: deprecated` ADR requires.

## Records

| ADR                                                     | Title                                                                                                        | Status   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| [0001](0001-native-css-nesting.md)                      | `@nave` emits native CSS nesting; browser floor rises to Baseline 2024                                       | accepted |
| [0002](0002-dtcg-2025-10-token-format.md)               | The token pipeline targets DTCG 2025.10, reads one shape, and refuses the pre-stable draft by name           | accepted |
| [0003](0003-layer-cascade-contract.md)                  | The `@layer` cascade contract: seven names, one precondition, and where consumer CSS goes                    | accepted |
| [0004](0004-zero-runtime-scope.md)                      | Zero runtime: nothing Nave ships computes or applies a style in the browser                                  | accepted |
| [0005](0005-browser-floor.md)                           | The browser floor is Chrome and Edge 125, Firefox 128, Safari 18, and relative colour syntax is what sets it | accepted |
| [0006](0006-nave-directive-stands-in-for-css-mixins.md) | `@nave` is a build-time stand-in for native CSS mixins, with a mapping, an adoption path and a sunset        | accepted |
| [0007](0007-release-topology.md)                        | Release topology: which packages version together, and why `@navecss/stylelint-config` does not              | accepted |

_Still to back-fill: the first-party token build pipeline (its mechanism; the format it targets is 0002), pnpm + Turborepo + Changesets as the release topology, and the headless-bridge approach (Base UI / Radix)._
