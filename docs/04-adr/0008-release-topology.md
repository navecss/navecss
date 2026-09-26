---
supersedes: '-'
superseded-by: '-'
---

# 0008 — Release topology: which packages version together, and why `@navecss/stylelint-config` does not

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
