---
supersedes: '-'
superseded-by: '-'
---

# 0009 — Release topology: which packages version together, and why `@navecss/stylelint-config` does not

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Cédric, following the shape argued during `@navecss/stylelint-config`'s design.
- **Tracking:** `@navecss/stylelint-config`'s first release; supersedes nothing.

## Context

`@navecss/tokens` and `@navecss/core` version together (Changesets' `fixed` group): they share
one design-token contract, and a consumer who bumps one without the other can land on an
incompatible pair. `@navecss/bridge` and `@navecss/cli` do not publish yet: each keeps
`"private": true` in its manifest until it has real content to ship, and that field is what
keeps a package off npm, because the publish step skips every private package. Both are also in
Changesets' `ignore` list, which governs versioning and tagging, not publishing.

A third published package, `@navecss/stylelint-config`, now exists. Whether it joins the fixed
pair, or versions on its own, is a release-topology decision worth recording once rather than
re-deriving at every future package's launch.

## Decision

**`@navecss/stylelint-config` versions independently.** It is not added to the `fixed` group, is
not `linked`, and is not `ignore`d: a plain, ordinary Changesets package.

The reasoning is what it depends on. `@navecss/stylelint-config`'s contract is with Stylelint
and the `@nave` grammar it declares, not with the token or component contract `tokens` and
`core` share. A change that tightens its lint rules is a breaking change for a consumer's CI in
the opposite direction from a token or component change: a stricter lint rule can fail a
build that a token bump never would, and a token bump carries no reason to touch a lint rule at
all. Coupling its version to an unrelated pair would force a release of one for a change to the
other, with no shared contract to justify it.

**Revisit trigger:** the day `@navecss/stylelint-config` reads the atom or token vocabulary
directly (for example, checking that a `var(--nave-*)` name is one Nave actually declares), it
takes a peer dependency on that package, with a version range, and it still does not join the
`fixed` group. A range, not fixed versioning, is the right coupling for that relationship: the
two packages should be compatible across a range of versions, not forced to release together.

## Consequences

- `.changeset/config.json` needs no edit for this package to exist: absence from `fixed`,
  `linked` and `ignore` is already independent versioning, Changesets' default.
- A future package that queries "how does release topology work here" should extend this
  record's reasoning (or supersede it) rather than re-deriving the question from scratch.

## Update — the revisit trigger has fired

`@navecss/stylelint-config` now reads the token vocabulary directly: its "declared custom
properties" rule (`@navecss/declared-custom-properties`) parses the stylesheet
`@navecss/tokens` publishes to check that a `var(--nave-*)` reference names something actually
declared there. That is exactly the trigger named above, and this package now takes a peer
dependency on `@navecss/tokens`, at `>=0.1.0 <1.0.0` — a range, never `fixed`, per this record's
own reasoning: the two packages need to stay compatible across a range of versions, not be
forced to release together. `@navecss/stylelint-config` still does not join the `fixed` group,
is not `linked`, and is not `ignore`d — the peer dependency changes what it reads, not how it
versions.

## Update: `@navecss/eslint-plugin` joins, versioning independently

A fourth published package, `@navecss/eslint-plugin`, closes the class-channel side of the same
constraint `@navecss/stylelint-config` closes for CSS: no class text written as a literal outside
`cx.raw()`, a reason required of every `cx.raw()` call that carries one, a count of how many, and
a check on literal values in a JSX `style` object. It **versions independently**, for the same
reasoning as `@navecss/stylelint-config` above: its contract is with ESLint and the JSX it reads,
not with the token or component contract `tokens` and `core` share, so it is not added to the
`fixed` group, is not `linked`, and is not `ignore`d.

Unlike `@navecss/stylelint-config`, this package needs no revisit trigger to take a peer: it
reads `@navecss/core`'s public `./atoms` export from the day it ships, to recognise a Nave atom
name passed to `cx()`, so it takes a required peer dependency on `@navecss/core` at
`>=0.1.0 <1.0.0` (a range, never `fixed`) from its first release, alongside a required peer on
`eslint` at `^9.24.0 || ^10.0.0`. Its build is `tsc` to `dist/`, the same shape as
`@navecss/stylelint-config`'s own plain-JavaScript package, no bundler either.
