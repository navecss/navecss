---
supersedes: '-'
superseded-by: '-'
---

# 0003 — The `@layer` cascade contract: seven names, one precondition, and where consumer CSS goes

- **Status:** accepted
- **Date:** 2026-09-23
- **Deciders:** Cédric (ruling, by accepting this record), following a
  pre-launch architecture review that measured the contract in a real browser
  engine.
- **Tracking:** the 0.1.0 launch batch; supersedes nothing.

## Context

Nave replaces specificity management with cascade layers. Every stylesheet Nave
ships sits in a named layer, a consumer's stylesheets are meant to sit in named
layers too, and layer order settles a conflict before specificity is consulted.
The order is one statement:

```css
@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;
```

It is the first rule of `@navecss/core`'s entry, and every CSS artifact Nave
ships restates it before its own layer block (`reset.css`, `atomic.css`,
`no-tokens.css`, the tokens package's `tokens.css`). Restating is harmless,
because a layer's position is fixed the first time its name is seen and a later
identical statement changes nothing. It is also what makes Nave's own artifacts
independent of the order a consumer imports them in: import `atomic` before
`reset` before the tokens and the canonical order still holds.

Until now the contract was stated in one sentence, unconditionally, in several
places: consumer overrides always win, no specificity conflicts, ever. Three
things about it were never written down, and a review measured all three in
Chromium against the shipped bytes.

1. **It has a precondition.** CSS fixes a layer's position at its first
   declaration anywhere in the document. Self-layering solves order _within_
   Nave's artifacts; it cannot solve order _between_ Nave and the consumer. A
   consumer stylesheet containing `@layer overrides { … }` that reaches the
   document before Nave's statement registers `overrides` first, which makes it
   the weakest layer. Measured: `@layer overrides { #probe { display: block } }`
   placed before `atomic.css` loses to `.nave-hidden`, and `display` computes to
   `none`. The consumer's rule had the higher specificity and still lost, which
   is exactly the promise failing. A bundler entry that imports the consumer's
   own stylesheet before `@navecss/core` produces this byte order, and nothing
   errors.
2. **It asks something of the consumer, and nothing said what.** Following the
   quick start, a CSS Module compiles to unlayered CSS. Unlayered author styles
   beat every layer, so the consumer's component CSS silently outranks
   `overrides`, the one layer the contract says always wins.
3. **The statement has seven names and the documentation named six.**
   `tokens.defaults` and `tokens.presets` are separate layers with a defined
   order between them, and a consumer could not learn that.

## Decision

**1. The contract is the seven names, in this order, and each has one owner.**

| Layer                 | Holds                                                                                | Written by                           |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| `tokens.defaults`     | Nave's shipped token values (CSS custom properties)                                  | `@navecss/tokens`, `@navecss/bridge` |
| `tokens.presets`      | Token values generated for a project (`navecss-tokens build`), and any future preset | the token build                      |
| `reset`               | Cross-browser normalisation                                                          | `@navecss/core`                      |
| `atomic`              | The global atom classes (`.nave-flex`, …) that `cx()` names                          | `@navecss/core`                      |
| `components.nave`     | Components Nave publishes                                                            | Nave's component source              |
| `components.consumer` | The consumer's own component CSS                                                     | the consumer                         |
| `overrides`           | The consumer's deliberate exceptions to everything above                             | the consumer                         |

`tokens.defaults` is the one layer written by two packages, both Nave's, over
names that never overlap. `@navecss/tokens` writes the `--nave-*` properties.
`@navecss/bridge` maps third-party variable names (Base UI's, Radix's) onto
them, each mapping reading its value through `var(--nave-*)`, and never writes
a `--nave-*` name itself. The mappings are Nave's shipped defaults for those
names, so they sit with the other shipped defaults: a project's generated
tokens and every consumer layer outrank them by layer order, whatever order
the files are imported in, and a preset that changes a Nave token reaches the
mapped name through the reference. Because the two writers never set the same
property, the order between them inside the layer decides nothing.

The top-level order is `tokens`, `reset`, `atomic`, `components`, `overrides`;
the sublayers order within their parent as listed. Renaming, reordering,
removing or inserting a layer is a breaking change to a published contract.

**2. The contract holds under one precondition, and the precondition is part of
the contract.** Nave's order statement must be the first `@layer` declaration
the document sees. Every guarantee in this ADR is conditional on it. Nave cannot
enforce it from inside its own stylesheets, because the failure is decided by
bytes Nave does not write, so the obligation is stated to the consumer (below)
and the means to meet it is shipped (decision 5).

**3. The consumer's obligation: author into a named sublayer, with the standard
`@layer` block.**

```css
/* button.module.css */
@layer components.consumer {
  .root {
    @nave interactive focusRing;
    background: var(--nave-color-action-primary);
  }
}
```

- Component CSS goes in `components.consumer`; deliberate exceptions go in
  `overrides`. Both are ordinary CSS and need no Nave tooling. CSS Modules
  hashes class names inside a layer block as it does outside one, and `@nave`
  resolves inside one as it does outside one (both measured).
- **Author into a sublayer, never into its parent.** Styles declared directly in
  a layer outrank that layer's sublayers. A rule in a bare `@layer components`
  beats both `components.nave` and `components.consumer`, and a rule in a bare
  `@layer tokens` beats `tokens.presets` (both measured). The same rule binds
  every artifact Nave ships: each names a sublayer, never a parent.
- **Do not add top-level layers expecting a fixed position.** A new top-level
  name lands wherever it is first declared: before Nave's statement, it sits
  below every Nave layer (measured); after it, above `overrides`. Either may be
  what a consumer wants, but neither is covered by this contract.
- **Unlayered CSS is lawful and outside the contract.** It beats every layer,
  `overrides` included. That is the platform's rule, not a defect, and it is
  the one way to outrank the contract on purpose.
- **All of the above is about normal declarations.** For `!important` ones the
  platform reverses layer order: an important declaration in an earlier layer
  beats an important one in a later layer, and unlayered important
  declarations rank below every layered one. Nave's reset uses this on
  purpose, for `[hidden]` and for its `prefers-reduced-motion` rule (the
  reasons are in `reset.css`), so a consumer's own `!important` in `overrides`
  or in unlayered CSS does not beat those declarations.

**4. The two ways of using an atom sit at two different cascade positions, by
design.**

- A `cx()` class is a global atom class and lives in `atomic`, below component
  CSS. A component rule wins over it (measured: `.nave-hidden` loses to a
  `components.consumer` rule setting `display`). An atom class on an element is
  a default for that element, not an override of its component's styles. A
  consumer who wants the Tailwind habit of "the utility wins" is asking for the
  opposite of this ordering.
- `@nave` inlines the atom's declarations into the rule that contains the
  directive, so they sit in whatever layer that rule sits in, `components.consumer`
  when the consumer follows decision 3.

**5. The order statement is published on its own, as a statement-only entry
the consumer imports first:** `@navecss/core/layers`, a stylesheet containing
the statement and nothing else. It gives the consumer one line that satisfies
the precondition wherever the rest of Nave is imported, and one canonical copy
of the statement, so a consumer never types the seven names and never holds a
copy that drifts. Importing it first and `@navecss/core` later is correct,
because the second statement is identical and changes nothing. With it, the
contract gets a browser test written from the failing side: a fixture that
registers a consumer layer before the statement and asserts the documented
inversion, so the precondition cannot silently stop being true.

This decision was taken before the entry was built. Until it ships, the same
effect is reached by importing `@navecss/core` before any stylesheet of the
consumer's that declares a layer.

- **Correction (2026-09-23):** the entry shipped: `@navecss/core/layers`, a
  copy of `packages/core/src/layers.css` containing only the order statement
  above, built to `dist/layers.css` and listed in
  `packages/core/README.md`'s exports table. The failing-side browser test
  described above is `packages/core/test/browser/layer-order.browser.test.ts`
  (a consumer `overrides` block declared before Nave inverts the order; the
  same bytes with `@navecss/core/layers` mounted first do not). Decision 3's
  "author into a sublayer, never a parent" rule also applied to
  `packages/bridge`'s `base-ui.css` and `radix.css`, which declared a bare
  `@layer tokens`; both now declare `@layer tokens.defaults` and restate the
  order statement, guarded by `packages/bridge/test/layer-naming.test.ts`.
  Decision 1's table named `@navecss/tokens` as the only writer of
  `tokens.defaults` and did not mention the bridge; it now names the bridge as
  that layer's second writer, with the reason beneath the table.

## Consequences

- The headline sentence changes from an unconditional promise to a conditional
  one that is true. Every surface that states the contract states the
  precondition with it or links here.
- The consumer writes one wrapper per stylesheet. That is the price of an
  explicit contract in plain CSS, and it is paid in the standard's own syntax,
  which every CSS tool already understands.
- `tokens.presets` beating `tokens.defaults` is now a documented guarantee: a
  generated palette wins over Nave's shipped values regardless of import order,
  and a consumer's `overrides` wins over both.
- Nothing in the browser checks the precondition. A runtime check would violate
  the zero-runtime invariant, and no build tool sees the final document order
  of every bundler's output. The failing-side browser test is the guard for the
  mechanism; the consumer's own order is guarded by documentation only.

## Alternatives considered

- **A plugin option that wraps each processed stylesheet in
  `@layer components.consumer`.** Rejected, though it was the first remedy
  proposed. Three grounds. (a) It is a hidden rewrite of cascade semantics: a
  stylesheet that already declares a layer would be re-nested under the wrapper,
  so a consumer's `@layer overrides` block would silently become
  `components.consumer.overrides`, and the stylesheet that imports Nave would
  push Nave's own layers under the consumer's. Avoiding that needs a filter
  deciding which files are "component CSS", which is a guess. (b) It would exist
  in exactly one build host, while the directive is moving to a host-independent
  core with several adapters, each of which would have to reproduce it. (c) The
  platform already expresses the intent in one standard line that works with
  CSS Modules and with `@nave` today. A mechanism that duplicates a standard
  one, less transparently, is the thing this project does not build.
- **Tell the consumer to type the order statement themselves.** Rejected as the
  primary path: seven names to copy, and any future change to the contract
  becomes a silent mismatch in every consumer's copy. It remains a lawful thing
  to do, and it is what the statement-only entry replaces.
- **Put the bridge's mappings in `tokens.presets`, or in a new sublayer of
  their own.** Rejected. `tokens.presets` belongs to the project: it is the
  layer defined as outranking Nave's shipped values, and a Nave package writing
  into it would put shipped defaults in the one slot meant to beat them. On any
  name the bridge and a preset both set, the two would share a layer, so the
  file imported later would win, which is import order deciding what this
  contract decides by layer. A new sublayer is an inserted layer, a breaking
  change, and the bridge's names never overlap Nave's own, so they need no
  layer to themselves.
- **Let unlayered consumer CSS be the default and drop `components.consumer`.**
  Rejected. It would make `overrides` meaningless for the consumer's own
  components and give up the ordering that is the point of the architecture.
