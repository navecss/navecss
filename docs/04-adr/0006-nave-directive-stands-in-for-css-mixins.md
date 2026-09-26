---
supersedes: '-'
superseded-by: '-'
---

# 0006 — `@nave` is a build-time stand-in for native CSS mixins, with a mapping, an adoption path and a sunset

- **Status:** accepted
- **Date:** 2026-09-23
- **Deciders:** Cédric (two rulings of 2026-09-21: the stand-in position and
  its adoption plan, then the host-independent core and the additive path that
  amended it), following the pre-launch architecture review that proposed
  them.
- **Tracking:** the 0.1.0 launch batch; supersedes nothing.

## Context

Nave's tenet is standards over frameworks, and its most visible authoring
feature is an at-rule the platform does not define. A stylesheet containing
`@nave focusRing;` is not CSS any browser understands; it needs a build step,
editor and linter configuration, and it is the first thing a reader who takes
the tenet seriously will point at.

The platform is moving toward exactly this feature. The CSS Working Group's
_CSS Custom Functions and Mixins Module Level 1_ defines `@mixin` (a named
block of declarations, nested style rules and conditional group rules, with
optional typed parameters) and `@apply` (which expands a mixin into the rule
that contains it). Its state, checked 2026-09-23:

- The Editor's Draft is dated 8 September 2026 and marks `@mixin` as
  "experimental and under active development, and is much less stable than
  `@function`". Over the preceding year the mixin model was rewritten, a macro
  form was added and then removed, and parentheses on a mixin name became
  optional.
- `@function`, from the same module, ships in Chrome and Edge 139 and in no
  other engine. `@mixin` and `@apply` ship in no engine; Chromium has an intent
  to prototype and no release milestone.
- Under the project's adoption rule, a feature is adoptable at Baseline (all
  three engines). Native mixins are years from it.

An atom is already the shape the draft describes. It is data (declarations, plus
nested pseudo-class, media and container blocks), and the directive expands it
into the containing rule at build time, which is what `@apply` specifies the
browser will do.

## Decision

**1. `@nave` is declared a build-time stand-in for `@mixin` and `@apply`.** It is
not a parallel mechanism to the standard; it is the standard's shape, run at
build time, on a browser floor the standard will not reach for years.

**2. The mapping, stated so it can be checked.**

| Nave today                                             | The draft's form                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| An atom definition (`focusRing` in `atoms.ts`)         | `@mixin --focus-ring { … }`                                                    |
| The atom's `declarations`                              | declarations in the mixin body                                                 |
| The atom's `pseudos`, `media`, `container` blocks      | nested rules (`&:focus-visible { … }`) and conditional group rules in the body |
| `@nave focusRing;` inside a rule                       | `@apply --focus-ring;` inside that rule                                        |
| `@nave interactive focusRing;`                         | one `@apply` per name, in the same order                                       |
| A consumer atom passed to the plugin's `extend` option | a mixin the consumer defines                                                   |

Concretely, the built-in `focusRing` atom corresponds to:

```css
@mixin --focus-ring {
  outline: none;
  &:focus-visible {
    outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus);
    outline-offset: 2px;
  }
}
```

(in the draft's syntax as of the date above; the draft may change it, and the
mapping will follow).

**3. What Nave keeps on top of the standard, permanently.** The standard gives
none of these, and they are why the directive is more than syntax:

- a **closed vocabulary with a build-time refusal**: an unknown atom name fails
  the build, where the draft specifies that an `@apply` naming no mixin "does
  nothing";
- the valid names listed in that refusal, with a nearest-match suggestion to
  come;
- the multi-name form of the directive;
- `cx()`, the JavaScript map from atom names to global classes, which has no
  standard counterpart.

What the standard adds that atoms lack (typed parameters with defaults,
`@contents`, `@private` locals) is adopted in the standard's own shape if and
when atoms gain parameters.

**4. The directive gets a core that does not depend on any one build host.**
Two levels: a resolver that turns atom names into the expansion as data, and a
text expander that rewrites a stylesheet on the CSS Syntax Level 3 token stream,
splicing the expansion at the directive and leaving every other byte as
written. Adapters sit over the core, each thin: PostCSS (today's plugin, which
becomes one adapter rather than the host), a bundler plugin for the major
bundlers, a Lightning CSS visitor, and a command line for projects without a
bundler. A survival check ships beside them: a command that fails when a
directive reaches built CSS, which catches both a missing pipeline and a
pipeline that silently skips the plugin. One vocabulary, one error text and one
suggestion for every host. This is what makes decision 6 cheap: every emitter reads
the same atom data, so the emitter is the only thing that changes. None of
this is built yet: it follows the launch (decision 6, step 1), and until then
the PostCSS plugin is the only host.

- **Correction (2026-09-26):** the core landed: `resolve()`, `plan()` and
  `expandText()` in `packages/core/src/directive/`, host-free and tested
  against the CSS Syntax Level 3 token stream. `@navecss/core/postcss` is now
  a thin adapter over it, and `navecss-core check` (the survival check named
  above) ships alongside it. The bundler plugin, Lightning CSS visitor and
  no-bundler command line are still ahead; PostCSS is the only host until
  they land.

**5. `@nave` stays the stable authoring syntax through 0.x.** A consumer's
stylesheet should not track an Editor's Draft that is still changing its model.
The directive is the insulation: Nave's reader absorbs the draft's churn, the
consumer's source does not.

**6. The adoption path, in three steps, each gated on the platform rather than
on a date.**

1. **Now:** this record and the mapping. After the launch, the core and its
   adapters, which change no authoring syntax.
2. **When `@mixin` ships in one engine and the draft's structure settles:** the
   core accepts `@apply --focus-ring;` as an alias of `@nave focusRing;` (the
   mapping above, for every atom), consumer atoms may
   be authored as `@mixin` blocks in CSS and read by the same core, and an
   emitter mode behind a flag writes native `@mixin` and `@apply` so the same
   atoms can be tested natively. All of this is additive; nothing a consumer
   wrote before breaks.
3. **At Baseline:** native emission becomes the default. `@nave` is deprecated
   in a 1.x release, with a one-rule codemod that the expander itself runs, and
   the build step reduces to the vocabulary check plus a fallback expansion for
   consumers who need a floor below native mixins.

**7. Tracking is scheduled, not remembered.** The engines' status entries for
mixins and functions, the Baseline status in `web-features`, and the working
group's open issues on the module are read on a fixed schedule, and a change
that meets a step's gate is raised when it is seen.

## Consequences

- The strongest criticism of the directive, a bespoke at-rule in a
  standards-first project, becomes the project's stated position: the standard's
  shape, available today, with a defined route to the standard itself.
- The directive's public surface is constrained from here on. Anything added to
  atoms (parameters, composition, scoping) is shaped so it maps onto the draft,
  or the ADR adding it says why it cannot.
- The core and its adapters are architecture work that follows the launch. Until
  it lands, PostCSS remains the only host, and the setup requirements that come
  with it (a PostCSS pipeline, and no transformer that replaces it) stay in the
  quick start.
- The zero-runtime invariant (ADR 0004) is unaffected in every step: at build
  time nothing runs in the browser, and native mixins would be expanded by the
  browser's CSS engine.

## Alternatives considered

- **Author the draft's syntax now (`@apply --focus-ring;`), expanded at build
  time.** Rejected. It ties every consumer's stylesheet to an Editor's Draft
  that has changed its model within the last year and flags itself as unstable.
  When the draft changes, consumers' source is wrong; with the directive, only
  Nave's reader is.
- **Keep `@nave` and say nothing about the standard.** Rejected. It leaves the
  criticism unanswered, and it leaves the directive's future undecided, which
  would let emitter and API choices drift away from the shape the platform is
  converging on.
- **Drop the directive and ship only global classes and `cx()`.** Rejected. The
  directive is what keeps styles in CSS files and markup semantic, which is the
  product's reason to exist.
