---
supersedes: '-'
superseded-by: '-'
---

# 0001 — `@nave` emits native CSS nesting; browser floor rises to Baseline 2024

- **Status:** accepted
- **Date:** 2026-08-10
- **Deciders:** Cédric (ruling), following an architecture proposal and a separate scoping pass.
- **Tracking:** the pre-0.1.0 correctness batch; supersedes nothing.

## Context

The PostCSS `@nave` plugin originally emitted an atom's pseudo-class rules,
`@media` blocks and `@container` blocks as **siblings** of the rule the
directive appeared in, reconstructing the parent's selector by string
concatenation and then re-inserting the nodes in reverse to recover authored
order.

That mechanism produced two correctness bugs that are not fixable within it,
only worked around:

- **C3, blocker-orange.** `${selector}${pseudo}` appends the pseudo to the
  whole selector _string_. For a selector list, `.a, .b { @nave focusRing; }`
  emitted `.a, .b:focus-visible`. `.a` kept `outline: none` from the atom's base
  declarations and never got a replacement indicator. The failure mode is a
  keyboard user losing the focus ring; this ADR records the mechanism change,
  not any conformance conclusion.
- **C8, minor-yellow.** Each directive anchored its own `insertAfter` on the
  rule, so two `@nave` directives in one rule emitted their hoisted blocks in
  reverse relative order, breaking the plugin's own documented
  authored-order invariant.

A `:is()` wrap fixes C3 alone. It does not fix C8, and it leaves the reversal
machinery, the sibling-ordering fragility, and the selector-string handling in
place. Native CSS nesting removes the entire problem class instead: `&` resolves
against the parent's full selector list by definition, and nested nodes are
ordered by document position inside the rule, not by insertion anchors.

## Decision

1. `@nave` emits **native CSS nesting** inside the parent rule. Declarations are
   inserted at the directive's authored position; pseudo, `@media` and
   `@container` blocks are appended to the end of the rule in authored order.
   The hoisting and reversal machinery is deleted.
2. `scripts/build-css.ts` emits the **same nested shape** into
   `dist/atomic.css`. One atom source, two renderers, one output shape.
3. Declarations inside a nested at-rule are wrapped in `& { … }`. They are never
   written bare, and a nested rule is never followed by further declarations.
4. **The documented browser floor rises to Baseline 2024.** Spec K's support
   statement inherits this; it is not restated anywhere else.

## Consequences

**Accepted.**

- The floor rises. CSS Nesting reached Baseline (newly available) in December
  2023 and is Baseline 2024 for the purposes of the support statement. Consumers
  on older engines need a nesting-aware post-processor, which any build already
  running PostCSS has.
- Rule 3 is a deliberate self-restriction. Bare declarations inside a nested
  at-rule, and declarations placed after a nested rule, both depend on
  `CSSNestedDeclarations`, which shipped across engines through late 2024 and
  2025 — past this floor. Staying inside the original nesting semantics keeps
  the output valid at exactly the level we document.
- Consumer nested rules authored _before_ a `@nave` directive are overridden by
  that atom's nested rules, which are appended after them. Same-specificity
  source order; documented, not accidental.
- **Correction (2026-08-11):** the point above records the
  cascade effect of a consumer nested rule preceding a directive, but not the
  validity effect, which is more serious. The directive's declarations insert
  at its _authored_ position; when that position follows a consumer-authored
  nested rule, the naive insertion produced exactly the bare-declaration-
  after-a-nested-rule shape rule 3 forbids — silently invalid below this
  floor. The plugin now detects that case and wraps the directive's
  declarations in `& { … }` instead, same as an at-rule inner block. See
  `packages/core/src/postcss.ts` (`followsNestedNode`) and the regression tests in
  `packages/core/test/postcss-plugin.test.ts`.
- **Correction (2026-08-22):** rule 1 says pseudo blocks
  are appended to the parent rule under `&`, but a `pseudos` key can itself be
  a comma-separated selector list (`':disabled, [aria-disabled="true"]'`),
  and `&` has to anchor _every branch_, not the key as a whole: `` `&${key}` ``
  only lands on the first branch, leaving later branches as implicit
  descendant selectors rather than same-element compound matches. Both
  emitters (`packages/core/scripts/build-css.ts`'s `renderNested`/
  `renderAtBlock`, `packages/core/src/postcss.ts`'s `buildPseudoRules`) now
  split a `pseudos` key on top-level commas and anchor each branch on its own,
  via the shared `anchorSelectorList` (`packages/core/src/selector-utils.ts`).
  A branch already containing `&` (an author-embedded anchor, or an
  author-written relative branch like `.foo &`) is left as authored, since it
  is already relative to the parent by construction.
- **Correction (2026-09-21):** the decision assumed `@nave`'s immediate
  parent is always the rule its nesting resolves against, and the plugin
  warned-and-removed anything else unconditionally. Two shapes parse without
  error but silently drop the directive under that assumption: a directive
  nested inside `@media`/`@container` with no intervening rule
  (`.card { @media (...) { @nave flex; } }`, a natural authoring shape once
  nesting is native), and a directive inside `@keyframes` — a keyframe step
  parses as a rule, so the old check passed it through, but `&` has no
  meaning inside `@keyframes` and a browser drops the emitted nesting with no
  other symptom. Both are now rejected through the same `onUnknown` option an
  unknown atom name already uses, so the default is a build failure rather
  than a build that silently ships without the block. The nested-inside-a-
  conditional shape is still reachable by nesting a rule under the
  conditional first (`.card { @media (...) { & { @nave flex; } } }`); see
  `packages/core/README.md` ("Where `@nave` is valid"), the placement
  checks in `packages/core/src/postcss.ts` (`isInsideKeyframes` lives in
  `packages/core/src/postcss-node-utils.ts`), and the regression tests in
  `packages/core/test/postcss-plugin.test.ts`.
- **Correction (2026-09-23):** decision 4's label, Baseline 2024, stands, but
  nesting is not what sets it. Nesting was Baseline in December 2023; the
  latest feature the default rendering depends on is relative colour syntax,
  Baseline in September 2024. [ADR 0005](0005-browser-floor.md) states the
  floor as engine versions and amends decision 4's attribution.

**Gained.**

- Selector lists work (C3), multi-directive order holds (C8), and the plugin is
  roughly half its previous size.
- The global-class path and the directive path can no longer drift in shape,
  because a test asserts both.

## Alternatives considered

- **`:is(${selector})${pseudo}` wrap.** Smaller diff, fixes C3 only, keeps C8
  and all the hoisting machinery. Rejected: it pays the cost of a change without
  removing the problem class.
- **Reject multiple `@nave` directives per rule.** Fixes C8 by forbidding it.
  Rejected: it narrows the API to work around an implementation defect.
- **Defer the rewrite to the P2 window.** Rejected by Cédric: Spec G
  freezes fixture snapshots, and writing those fixtures twice — once against
  hoisting, once against nesting — is the expensive path.
