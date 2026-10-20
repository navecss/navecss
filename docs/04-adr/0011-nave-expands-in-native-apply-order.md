---
supersedes: '-'
superseded-by: '-'
---

# 0011 — `@nave` expands each atom in place, in native `@apply` order, and reports where that order lets later content win

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** Cédric (ruling, by accepting this record).
- **Tracking:** `@navecss/core` 0.5.0. This record supersedes decision 1 of
  [ADR 0001](0001-native-css-nesting.md), which stays accepted for its other decisions (see
  Supersession below).

## Context

[ADR 0006](0006-nave-directive-stands-in-for-css-mixins.md) declares `@nave` a build-time stand-in
for the CSS Working Group's `@mixin` and `@apply`, and maps `@nave interactive focusRing;` to one
`@apply` per name, in order. The mapping did not hold. [ADR 0001](0001-native-css-nesting.md)
decision 1 put a directive's declarations at the directive and appended every atom's pseudo-class,
`@media` and `@container` blocks to the end of the rule. Two consequences followed, both visible to
a reader of a stylesheet:

- Naming order did not decide anything between atoms. `@nave hideDesktopUp flex;` hid the element
  from 75em up, and `@nave flex hideDesktopUp;` did too, because both atoms' blocks came after both
  atoms' declarations. A native `@apply --hide-desktop-up; @apply --flex;` shows the element as flex
  there, because the later mixin's declaration comes later.
- A rule's own content after the directive lost to every atom's block of equal specificity.
  `.panel { @nave hideDesktopUp; display: grid; }` hid the panel from 75em up. Written as
  `@apply` in a rule, the later `display: grid` wins.

The difference matters beyond style. A project that writes `@nave` today is rehearsing for native
mixins, and the day Nave emits `@apply` instead of expanding (ADR 0006, decision 6), every place
where the two orders disagree would flip silently. It also reaches focus: after `@nave focusRing;`,
a later `&:focus-visible { outline-color: ... }` in the same rule was ignored, and a later
`&:focus { outline: none }` there left the ring in place, so a rule that read as removing the focus
indicator did not, and one that read as recolouring it did not either.

Measured over the 48 built-in atoms, 22 of the 2,256 ordered pairs change outcome under native
order. All are `@media` pairs: `hidePhoneOnly`, `hideTabletPortraitUp`, `hideTabletLandscapeUp` and
`hideDesktopUp`, each before `flex`, `inlineFlex`, `grid`, `block` or `inlineBlock` (20), and
`wFullPhoneOnly` before `srOnly` or `srOnlyFocusable` (2). Six further `@media` pairs set the same
value, and ten pairs are keyed on pseudo-classes and never flip. Consumer atoms passed as `extend`
behave the same way.

## Decision

**1. Placement.** `@nave a b c;` expands, at the directive's position, to `a`'s body, then `b`'s,
then `c`'s. An atom's body is the data `resolve()` returns for it, in its order: declarations, then
pseudo-class blocks, then `@media` blocks, then `@container` blocks. That is the order
`dist/atomic.css` renders the atom's class rule, so the directive and the class cannot disagree
about what an atom contains. Whatever the rule holds after the directive keeps its authored order
after all of it, and several directives in one rule each expand at their own position. Nothing is
appended to the end of the rule, by the PostCSS plugin or by the text expander that serves the Vite
plugin, the Lightning CSS adapter and `navecss-core expand`: both produce the same structure in the
same order. `dist/atomic.css`, every atom's own body and `cx()` do not change.

This supersedes decision 1 of ADR 0001, whose text said blocks are appended to the end of the
rule. The rest of ADR 0001 stands.

**2. Wrapping, and where it differs from native order.** Each run of consecutive declarations that
follows a nested node is written inside one `& { }`, which is decision 3 of ADR 0001 applied to the
composed result instead of to the directive's own declarations. Runs are delimited by source: a
rule's own consecutive declarations form a run, ending at any rule, at-rule or `@nave` directive,
and the declarations one directive emits with no nested node between them form a run of their own;
the two never share a wrapper. The reason is the browser floor. Chrome and Edge 125, Firefox 128
and Safari 18 predate nested declarations, so a bare declaration after a nested rule is not read as
the author meant. (This is from the engines' release notes and ADR 0001's own account of when nested
declarations shipped, not from a probe of the floor's engines.) A native `@apply` produces one nested-declarations rule per
contiguous run, so one wrapper per run is the same shape.

Two divergences from native order follow from writing for engines without nested declarations, and
both are stated decisions, not defects:

- **The mixed-specificity list.** In a rule whose selector list holds selectors of different
  specificity, such as `.s1, #x .s2`, declarations inside `& { }` match with the specificity of the
  list's most specific selector, because `&` stands for the whole list. Native nested declarations
  match per selector. A wrapped declaration can therefore win over a rule elsewhere that a bare one
  would lose to. The build reports every wrapped run under such a list, permanently, and prints the
  two ways out: write the rule once for each specificity, or write the list as `:is(...)`.
- **The pseudo-element rule.** `&` cannot stand for a pseudo-element, so an atom's pseudo-class,
  `@media` and `@container` blocks, all written on `&`, can never apply to one. In a rule where
  every selector ends in a pseudo-element, the directive therefore emits none of its atoms' blocks
  and wraps nothing, and one warning per directive names the blocks it left out. A native mixin's
  `@media` and `@container` rules would still apply to the pseudo-element there. In a list that
  mixes pseudo-element selectors with others, expansion proceeds as usual, and each wrapped run
  carries a permanent warning that its declarations do not reach the pseudo-element selectors.

**3. The order warning.** Where the new order lets later content override an atom's conditional
block, the build says so. A warning is reported for each pair of an atom's block and a later
declaration in one rule when all of these hold: it is the same element (the rule's own
declarations, directly or inside conditional group rules, or a nested rule whose subject is `&`);
order decides (same layer, neither side `!important`, equal specificity, with a strictly more
specific later block not warning, because it wins wherever it is written and reordering cannot
change that); the two conditions are not provably disjoint; the properties relate (the same
property, a shorthand and a longhand it sets, shared longhands, `all`, or a logical and a physical
member of one group); and the values differ. "Later" covers a later atom in the same directive, a
later directive in the rule, and the rule's own declarations and nested blocks after the directive.
A directive written inside a nested rule is checked as content of that rule, and its atoms' blocks
are also compared with what each enclosing rule holds after the block that contains the directive,
where the way down to the directive passes only through nested rules whose subject is `&` and
conditional group rules; such a pair warns under the same tests. Where that warning offers a move,
it moves the later content above the block, not above the directive, which would put the content
inside the block and under its selector.
An atom's own blocks are not compared with each other. The relation between properties comes from a
first-party table generated from `mdn-data` by a development script, so the check adds no runtime
dependency.

Each warning is positioned at the overrider and names the atom, the condition, the property with
both values, a move only where the check, run again on the moved order, no longer finds that pair,
and always the directive with a marker inserted. Where the later value, as written,
hides `focusRing`'s outline (a style of `none`; a width written as `0` or as a zero length; the
keyword `transparent`; an `outline` with no style keyword; or `initial` or `unset` on `outline`,
`outline-style` or `all`), or puts back over `srOnlyFocusable`'s reveal what hid the element
(`clip-path: inset(50%)`, or all of `width: 1px`, `height: 1px` and `overflow: hidden` in one
later block), it says so: that it hides the keyboard focus indicator `focusRing` draws, or hides
again what `srOnlyFocusable` reveals. It reads only what is written outside a function and computes
nothing, so a zero inside `calc()` or `rgb()` is not a zero width, and a colour made transparent by
its alpha (`rgb(0 0 0 / 0)`, `#0000`) is not read as `transparent`. A value it cannot read
(`var()`, `env()`, `attr()`), or one another rule decides (`inherit`, `revert`, `revert-layer`),
gets no such sentence. No warning from a later block that sets the outline style to `auto`
(`outline-style: auto`, or `auto` in an `outline`) gets the sentence about `focusRing`, whatever
else that block writes: `auto` asks for the browser's own ring, which the check does not judge.

The warning is always a warning that never fails the build, never through `onUnknown`, and no
option turns it off for the whole project, for these reasons. `onUnknown` governs a problem in a directive, and every host derives a severity from
it, so routing the check through it would turn `'ignore'` into an off switch for the whole project
and `'error'` into a failing build. A check over a consumer's CSS reports and does not fail it.
And the check exists to show a project the order before native mixins ship, which a switch would
let the project avoid seeing. The core returns the warnings on their own field, `warnings`, beside
`diagnostics`, and each host reports them by its own channel.

**4. The opt-out.** A deliberate override is marked in the directive whose atom it overrides, with a
comment inside the directive's prelude: `@nave /* nave-allow-override: display */ hideDesktopUp;`,
optionally with a reason after `--`. It names properties, and covers the longhands of each (a
shorthand covers its longhands, a custom or vendor-prefixed property itself), so a marker written to
recolour the focus ring does not also silence a later removal of it. The reason is optional: the
property list already records what was allowed, and a required reason trains filler. A marker
naming a property that nothing overrides any more is reported, as is a marker naming no property,
a name that is not a property, and a comment that starts `nave-allow-override` but does not parse.

The prelude is the only position that survives every measured host. Vite under
`css.transformer: 'lightningcss'` removes every other comment, `/*! */` included, before Nave's
transform runs; a marker before the directive or on the overriding declaration would disappear
there and the warning would keep printing. A marker is removed with the directive and never
reaches the output, and a comment in the prelude was already accepted silently, so a project can
add one before it upgrades.

**5. The host limitation.** Where a host moves a rule's content before Nave sees it, the check
cannot see that content.

Under Vite's `css.transformer: 'lightningcss'` at targets below the browser floor, Lightning CSS
lowers nesting before Nave's transform runs and moves whatever a rule says after a directive into
a later rule of its own, so Nave never sees that content and only pairs between atoms are checked
there. That content resolved in native order on that path before this decision and still does: a
later `&:focus { outline: none }` after `focusRing` removed the ring there before and after, and no
warning is printed for it.

The stale-marker report is off for the Vite plugin under that transformer, because it cannot tell
whether Lightning CSS has already moved what follows a directive. The two floor keys in the README
bring the content back into the rule, and the check then runs in full. Next.js under Turbopack is
not affected: it runs PostCSS on the source before Lightning CSS, so the whole rule reaches the
plugin.

**6. The first minor, and its removal.** In `@navecss/core` 0.5.0, the release that ships this
decision, three kinds of warning carry one more sentence naming the previous result: an order
warning whose overrider is not itself an atom's block ("Before @navecss/core 0.5.0 "hideDesktopUp"
won, because an atom's blocks were placed last in the rule."), and the wrap and pseudo-element
warnings for a run that the previous release left outside `& { }`. They are true by construction:
the previous release placed every block last in the rule that held its directive, so every pair of
a block and later content of that same rule was won by the block. A pair with what an enclosing
rule holds after a nested rule (decision 3) gets no such sentence: the nested rule ended before
that content, so the content won then as it does now.
The sentences, and the constant holding the release they name, live in one module,
`src/directive/migration.ts`. The warnings themselves stay. A test fails when this release's
changeset is still pending and the constant is not the next minor after the package's version, and
when the changeset has been consumed and that minor has passed while the module exists, so the
removal falls due on the version commit of the release after this one without anyone having to
remember it.

**7. What the browser test proves.** A real-browser test over built output asserts the new
outcomes in Chromium, Firefox and WebKit as the test runner ships them: the shapes in the changeset,
a sample of the 22 pairs, the two mixed-list shapes, the pseudo-element shapes, and a rule whose
last declaration has no semicolon. Those engines are current releases, not the floor's, so the test
proves that the CSS Nave emits resolves to these outcomes in current engines. It does not prove
anything about Chrome 125, Firefox 128 or Safari 18. That the emitted form is valid there rests on
the floor decisions in ADR 0001 and [ADR 0005](0005-browser-floor.md).

## Consequences

**Accepted.**

- The outcome of two shapes changes for a page. A responsive atom named before an atom that sets
  the same property now yields to it, and a declaration or nested block of a rule's own after the
  directive now wins over an atom's block of equal specificity. The build reports each, with the
  move that lets the atom win where one does so without a new warning, and the changeset names both.
- The focus atoms are in scope. After `@nave focusRing;`, a later `&:focus { outline: none }` or
  `&:focus-visible { outline: none }` in the same rule now removes the ring where it used to leave
  it, and a later `&:focus-visible { outline-color: ... }` there now applies. The warning says when
  the ring, or the reveal of `srOnlyFocusable`, is lost to a value it can read.
- Consumer nested rules authored before a directive are still overridden by the atom's nested
  rules, now because of position and not because of appending: an atom's block comes at the
  directive, so what the rule says after it wins at equal specificity.
- `@navecss/base-ui`'s built stylesheet: its bytes change and no computed value does. Every rule there is
  `@nave` with a role atom, and `focusRing`'s `outline: none` moves into an `& { }` rule after the
  role's blocks in the rules that take it. The package ships a patch for it.
- Both hosts carry the same rule, and the ordering code is shared. The check is local to the rules
  that hold a directive and reads the tokens the expander already holds, so its cost grows with
  the number of such rules and the content after their directives, not with the stylesheet.
- Under Vite's Lightning CSS transformer below the floor, only pairs between atoms are checked
  (decision 5).
- ADR 0006's mapping rows now hold from 0.5.0, up to the two divergences of decision 2; the
  correction there says so.

**Gained.**

- `@nave a b;` and `@apply --a; @apply --b;` mean the same thing, so moving to native mixins does
  not change what a project shows except at the two stated divergences.
- A reader can predict the result from the stylesheet: the later declaration wins, as elsewhere in
  CSS.
- An override that changed meaning is surfaced at the build, with a move where one clears it, and a
  deliberate one is recorded at the place it is made.

## Alternatives considered

- **Keep ADR 0001's placement and add the warning.** Rejected. The warning would be correct and the
  stand-in would still disagree with the thing it stands in for, so the switch to native emission
  would flip every disagreement silently.
- **Keep each directive's blocks together after its declarations, with later content after them.**
  Rejected. It moves an atom's blocks away from its own declarations, so `@nave hideDesktopUp flex;`
  would still hide the element, and it is not what `@apply` does.
- **A marker on the overriding declaration, or on the line before the directive.** Rejected: a
  comment there does not survive Vite's Lightning CSS transformer, and the failure would be the
  worst for the person who adds the marker, since the warning would keep printing.
- **A marker per atom, with a required reason.** Rejected. A marker written to recolour a ring would
  also silence a later removal of it; covering longhands per property keeps the second warning.
  A required reason invites filler.
- **A global switch, an error severity, or routing the warning through `onUnknown`.** Rejected, for
  the reasons in decision 3.
- **Warn on a later block of strictly higher specificity.** Rejected. It wins wherever it is
  written, so the only remedy would be the marker, which is the shape of warning that trains people
  to paste markers.
- **A runtime dependency, or a published package, for the property relations.** Rejected. A
  generated first-party table, built from CC0 data and from the CSS specifications, with the credit
  in the package's `LICENSE`, adds nothing to install and nothing to load.
