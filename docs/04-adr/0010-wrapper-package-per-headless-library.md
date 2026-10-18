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

- **Correction (2026-10-13):** a part's own types are declared from the oldest Base UI the
  package supports (1.3.0 when this was written), so that the package's declarations compile
  there. A type member or type parameter Base UI added later is not on the wrapper's part:
  against Base UI 1.8.0 that is `ContextMenu.Root.Actions` and the third type parameter of
  `Combobox.Root.Props`. Each subpath also re-exports Base UI's flat type names, which reach
  them (`ContextMenuRootActions`, `ComboboxRootProps`).
- **Correction (2026-10-14):** `NavigationMenu.Root.Props` with a type argument and
  `NavigationMenu.Root.Value` are two more such names; the subpath reaches them as
  `NavigationMenuRootProps` and `NavigationMenuRoot.Value`.

**2. The styling is one stylesheet in `components.nave`, built when the package is built.**
`@navecss/base-ui/styles.css` is made by expanding Nave's own atoms through the `@nave`
directive at build time, so the consumer needs no PostCSS plugin and no directive. It carries
only rules inside `@layer components.nave`, restates the layer order statement, declares no
custom property, and sets no `z-index` or `isolation`. The consumer imports Nave's tokens, then
this file. ADR 0003's table now names this package as `components.nave`'s writer.

- **Correction (2026-10-14):** the stylesheet sets one `z-index`, `z-index: var(--nave-layer-toast)`
  on the toast area (`nave-base-ui-toast-placement`), admitted on one criterion: a portalled
  container that exists before the overlays it must sit above. No layer moves, and nothing else in
  the stylesheet may set a `z-index`.

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
state.** The plan is a shadcn-format registry generated from the same source, as the way to copy
one component into a project and change it there. It did not exist when this was decided, and
nothing here depends on it.
It now ships: see [Update: the registry now exists](#update-the-registry-now-exists).

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
  the package's own checks and its README's fixed wording.

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

## Update: the registry now exists

Decision 6 named a registry as a later delivery from the same source. `@navecss/base-ui` now
ships it: a team can copy one component's files into its project and change the rules there.

**How it is generated.** `scripts/generate-registry.ts` runs in the package build after the
stylesheet is built, from the inputs the wrappers and the stylesheet are built from: the wrapper
generator's output for each subpath, the role atoms expanded through the PostCSS adapter,
`src/part.ts` and `LICENSE`. Nothing in the registry is written by hand, so each release's items
follow that release's roster and atoms, and the package's tests hold every item to the package:
the same DOM, the same rules and the same computed styles.

**What it is.** One shadcn registry item per styled subpath (35 components today; Form styles no part and
has none). Every item is a universal item: each file is a `registry:file` with a plain
`components/nave/` target, so shadcn's CLI installs it into a project with no Tailwind, no
`components.json` and no `init`. An item has five files: the entry, the parts, the wrap helper, a
CSS Module and `NAVECSS-LICENSE`. It names no dependency version and no other item.

**Where it is served.** Inside the package tarball under `dist/registry/`, reached by path from
the installed package and, at an exact version, from jsDelivr
(`https://cdn.jsdelivr.net/npm/@navecss/base-ui@<version>/dist/registry/<item>.json`). Nothing
else is hosted.

**Decision: a copy's class scoping uses CSS Modules.** A copy's rules sit in
`@layer components.consumer`, under class names that a CSS Module renames per file. A copy that
kept the package's class names would collide with the package's stylesheet, and an edit to one
would reach the other. CSS Modules are a bundler convention, not a standard, because no standard
isolates class names per file. The decision takes the convention knowingly: the alternative is a
naming scheme each team keeps unique by hand. A host without CSS Modules uses the package.
