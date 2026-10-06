---
supersedes: '-'
superseded-by: '-'
---

# 0010 — Styled headless components ship as one wrapper package per library, built from Nave's tokens

- **Status:** accepted
- **Date:** 2026-10-06
- **Deciders:** Cédric (ruling, by accepting this record).
- **Tracking:** the first release of `@navecss/base-ui`. Supersedes nothing: it replaces a plan
  that never shipped, for a package that was never published (see Context).

## Context

Nave is a token and cascade system, and the first thing teams build on it is components. Most
teams that want accessible behaviour take it from a headless library and want the styling from
Nave. Base UI is the first such library Nave supports.

The obvious shape was a "bridge": a stylesheet mapping Nave's tokens onto the library's own CSS
variables, shipped as `@navecss/bridge`. Measuring Base UI against that shape showed it has
nothing to hold:

- **Base UI reads no custom property a consumer sets.** Every variable it documents
  (`--anchor-width`, `--available-height`, `--transform-origin`, `--accordion-panel-height` and
  the rest) is one it writes, for the consumer's CSS to read. A map from Nave tokens onto those
  names would write into nothing.
- **Base UI renders nothing that identifies a part**, only state (`data-open`,
  `data-highlighted`, `data-starting-style` and the like). A stylesheet cannot say "this is the
  Popover popup" without a class that something put there, so state selectors alone are not a
  delivery either.

What a team adopting Nave tokens still has to do is decide, for about eighty parts, which token
answers surface, border, radius, spacing, type, state paint and motion, and wire it to the
library's hooks. That is the same work in every project, and done by hand it drifts. The value
Nave can add is making those decisions once.

## Decision

**1. One wrapper package per headless library, starting with `@navecss/base-ui`.** It exports
each Base UI component at the same subpath Base UI uses (`@navecss/base-ui/dialog` for
`@base-ui/react/dialog`), so adopting it is changing an import path. Every part keeps Base UI's
props, types, refs and behaviour; the wrapper adds only an internal class, and on the Button
family two typed props, `variant` and `size`, rendered as `data-nave-*` attributes. Behaviour
and accessibility semantics stay Base UI's. Further libraries get their own packages, sharing
the same tokens and design decisions, each after its own part-identification surface has been
measured.

**2. The styling is one stylesheet in `components.nave`, built when the package is built.**
`@navecss/base-ui/styles.css` is made by expanding Nave's own atoms through the `@nave`
directive at build time, so the consumer needs no PostCSS plugin and no directive. It carries
only rules inside `@layer components.nave`, restates the layer order statement, declares no
custom property, and sets no `z-index` or `isolation`. The consumer imports Nave's tokens, then
this file. ADR 0003's table now names this package as `components.nave`'s writer.

**3. The override ladder is the cascade contract, not a configuration surface.** Tokens restyle
every part; a `className` on any part is the consumer's, in `components.consumer`, and beats
Nave's rules by layer order in every state; the raw Base UI part is always available. The
`nave-base-ui-*` classes and `data-nave-*` attributes are internal: they are not documented as
API and renaming them is not a breaking change.

**4. The wrapper is a pass-through, and that is what keeps it thin.** No composed parts, no
behavioural default, no added ARIA, no changed element. The wrapper's own cost is one small
helper, so a part a consumer does not import is dropped by their bundler.

**5. Versioning.** The package versions independently (ADR 0009). Base UI is a required peer,
and a Base UI major is a major of this package; the peer floor is the oldest Base UI release
whose declarations type-check against ours. A visual change is a `minor`.

**6. A registry is a later delivery from the same source, not part of this record's shipped
state.** The plan is a shadcn-format registry generated from the same source, as the way to own
a copy of one component. It does not exist yet, and nothing here depends on it.

## Consequences

- `@navecss/bridge` is retired, never having published. Its two stylesheets were placeholders
  with no mappings in them: the Base UI one would have mapped names Base UI does not read, and
  the Radix one was never populated. Radix has no Nave package yet.
- Nave now ships components, so the sentences that said it did not (the README's positioning
  and its list of what it does not promise) are rewritten. Nave builds none of its own
  components: it styles the ones Base UI ships.
- ADR 0004 carries the test that keeps this inside the zero-runtime invariant: Nave's
  contribution to a part is chosen from a static table by props the consumer passed.
- The package's accessibility and licensing positions are not made here: they are carried by
  the package's own checks and its README's cleared sentences.

## Alternatives considered

- **A variable map (`--base-ui-*: var(--nave-*)`).** Rejected: there is nothing to map onto
  (Context).
- **Selectors keyed on Base UI's state attributes, shipped as a global stylesheet.** Rejected:
  no attribute identifies a part, so it would need classes the consumer must add anyway, and a
  global stylesheet is the pattern the cascade contract exists to avoid.
- **Role atoms the consumer applies to each part through `@nave`.** Not shipped as the
  delivery: it leaves the per-part wiring, which is the work to be removed, with every team.
  The atoms survive underneath the stylesheet.
- **Copying component source into the consumer's project as the only delivery.** Kept as a
  later, second delivery (decision 6): it gives ownership, but not updates.
