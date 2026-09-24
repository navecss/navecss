---
supersedes: '-'
superseded-by: '-'
---

# 0005 — The browser floor is Chrome and Edge 125, Firefox 128, Safari 18, and relative colour syntax is what sets it

- **Status:** accepted
- **Date:** 2026-09-23
- **Deciders:** Cédric (ruling, by accepting this record), following a
  pre-launch architecture review.
- **Tracking:** the 0.1.0 launch batch. Amends ADR 0001 decision 4 (the
  attribution of the floor, not its label); supersedes nothing.

## Context

The project adopts a platform feature once it is Baseline, shipped in all three
engines, and requires the ADR adopting it to state the floor that results. ADR
0001 did that for CSS nesting: "the documented browser floor rises to Baseline
2024". Nesting, though, became Baseline in December 2023. It is not the feature
that sets the floor, and the ADR record never named the ones that do. A
consumer could not learn which engines Nave needs, or what happens below them,
from anything written.

A review read every feature in the CSS a `@navecss/core` consumer receives by
default (the token layer, the reset, the atom classes and what `@nave`
emits) and dated each against the `web-features` Baseline data (release 3.39.0,
read 2026-09-23). The features the default rendering depends on, latest first:

| Feature                                         | Baseline since | Engines                              |
| ----------------------------------------------- | -------------- | ------------------------------------ |
| Relative colour syntax (`oklch(from var(…) …)`) | September 2024 | Chrome 125, Firefox 128, Safari 18   |
| `light-dark()`                                  | May 2024       | Chrome 123, Firefox 120, Safari 17.5 |
| CSS nesting                                     | December 2023  | Chrome 120, Firefox 117, Safari 17.2 |
| `oklch()`                                       | May 2023       | Chrome 111, Firefox 113, Safari 15.4 |
| Media query range syntax                        | March 2023     | Chrome 104, Firefox 102, Safari 16.4 |
| Container queries (`container-type`)            | February 2023  | Chrome 105, Firefox 110, Safari 16   |
| Dynamic viewport units (`dvh`)                  | December 2022  | Chrome 108, Firefox 101, Safari 15.4 |
| Cascade layers                                  | March 2022     | Chrome 99, Firefox 97, Safari 15.4   |
| `:focus-visible`                                | March 2022     | Chrome 86, Firefox 85, Safari 15.4   |

Edge follows Chrome's version numbers throughout, and iOS Safari follows
desktop Safari's. The token layer also registers some custom properties with
`@property` (Baseline July 2024, inside the same floor) for type checking and
transitions; without it those properties still work, unregistered, so it is not
on the list.

Relative colour syntax is load-bearing, not decorative. Most of the semantic
colours the token layer emits (surfaces, content, borders and their
foregrounds; 26 of 33 when this was written) are derived from the tint seed
with it, inside `light-dark()`. An engine without it cannot use those values,
and every property that reads one falls back to its inherited or initial value:
surfaces and text lose their colours with no error.

A second fact surfaced while measuring, and it is about the consumer's build
rather than the browser. A CSS transformer asked to target engines below the
floor rewrites what it can lower. Nesting is flattened, harmlessly. `light-dark()`
is replaced by an emulation keyed on `prefers-color-scheme` alone, which
ignores `color-scheme`, so a `color-scheme` set on the root or on a subtree no
longer switches Nave's colours. Relative colour syntax cannot be lowered and is
left as it is, so the rewritten output still needs the floor. Measured with
Vite 8.2 on 2026-09-23: its default production build minifies CSS with
Lightning CSS against targets of Chrome 111, Firefox 114 and Safari 16.4, and
rewrites every `light-dark()` in Nave's token layer this way. With the CSS
target set to the floor, every one is kept.

## Decision

**1. The supported floor is Chrome 125, Edge 125, Firefox 128 and Safari 18
(macOS and iOS).** The label stays "Baseline 2024". The floor is stated as
engine versions as well as a label, because a label cannot be put into a build
tool's configuration and versions can.

**2. Relative colour syntax sets the floor.** ADR 0001's attribution of the floor
to nesting is corrected here; its label and every other decision in it stand.

**3. A consumer's CSS build must target the floor or above.** Below it, a
transformer changes Nave's colour-scheme behaviour without an error, and the
result still does not run on the older engines it was targeting. In Vite that is
`build.cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18']`
(measured); in tools that read browserslist, the `baseline 2024` query is a
valid, slightly stricter target. Consumer documentation states this beside the
floor.

**4. A feature past the floor may be used only as progressive enhancement**:
where its absence leaves an acceptable rendering, and with a comment at the
declaration saying so. Current cases: `text-wrap: pretty` and
`hanging-punctuation` in the reset, and the prefixed forms that exist for
engines lacking the standard property. Anything the default rendering depends on
must be inside the floor.

**5. Raising the floor is a decision recorded in a new ADR** that names the
feature, its engines, and the new versions, and amends this one.

## Consequences

- A consumer can answer "does Nave support browser X" and can configure their
  build to match, from one document.
- Below the floor, Nave's colours fail silently rather than degrading. That is
  accepted, for the reasons under the first two alternatives below, and it is
  stated here so that nobody discovers it in production.
- The build-target instruction becomes part of setup. It is one line, and
  leaving it out changes behaviour under a widely used bundler's default
  configuration, so it belongs in the quick start rather than in a footnote.

## Alternatives considered

- **Keep a lower floor by emitting static colour values instead of relative
  colour syntax.** Rejected. Deriving every colour from one seed in CSS is what
  lets a consumer re-tint the whole system by changing one custom property,
  without rebuilding. Emitting static values would trade that for engines that
  are more than two years old, and would move theming work back into the build
  for every tint change.
- **Emit both, with a static fallback before each derived value.** Rejected for
  now. It roughly doubles the token layer for engines outside the stated floor,
  and a fallback that is never tested on an engine that needs it is a promise
  nobody keeps. It is the right shape if a consumer population below the floor
  ever materialises, decided then on evidence.
- **State only "Baseline 2024".** Rejected. It is accurate and not actionable:
  a build tool needs versions, and the label alone let the floor's real cause go
  unrecorded.
