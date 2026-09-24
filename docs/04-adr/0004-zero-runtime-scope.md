---
supersedes: '-'
superseded-by: '-'
---

# 0004 — Zero runtime: nothing Nave ships computes or applies a style in the browser

- **Status:** accepted
- **Date:** 2026-09-23
- **Deciders:** Cédric (ruling, by accepting this record), following a
  pre-launch architecture review.
- **Tracking:** the 0.1.0 launch batch; supersedes nothing.

## Context

"Zero runtime" is on the front page and is the invariant the rest of the
architecture defers to: where it collides with the project's standards-first
rule, it wins. It has only ever been stated in one line, "`@nave` directives
inline at build time and `cx()` maps to static atoms", and that line is read two
different ways.

Read loosely, it means "no JavaScript". That is false, and a reader who checks
finds it false within a minute: `cx()` is a JavaScript function a consumer
bundles, and `@navecss/tokens` publishes JavaScript modules of token values and
breakpoint queries. Read strictly, it means something narrower and true, and
nothing written down said which reading was meant or what the strict reading
excludes. An invariant nobody can check a change against is not one, and a
headline claim a stranger can falsify with the wrong reading is a liability at
launch.

## Decision

**1. The invariant: nothing Nave ships computes, generates, injects or mutates a
style in the browser.** Every declaration Nave contributes to a page exists as
CSS text before the page loads. Concretely, no shipped JavaScript reads or
writes the DOM or the CSS Object Model for styling (`element.style`,
`document.styleSheets`, a `<style>` or `<link>` it inserts, `getComputedStyle`),
and none derives a class name or a declaration from a value at run time.

**2. Build time is where the work happens, and it is all of it.** The `@nave`
directive is expanded by a build tool into ordinary declarations inside the
consumer's own stylesheet. The token build and the theming generator run in
Node during the build and emit CSS files and static data. None of that code
reaches the browser.

**3. JavaScript Nave ships is allowed when it is static data or a pure mapping
over it.**

- `cx()` maps an atom name to the fixed class name of a rule that already exists
  in `atomic.css`, and joins strings. Its output is the string a developer could
  have written into the class attribute by hand. `cx.raw()` passes strings
  through. Neither decides any style.
- `@navecss/tokens` exports token values and breakpoint queries as constants,
  for scripts that need the same numbers the CSS uses. Reading a constant
  computes no style.

**4. Bytes are a separate question from runtime, and are judged separately.**
What a JavaScript entry costs a consumer is measured by bundling that entry the
way a consumer would and reading the output. A JavaScript entry that is heavier
than it needs to be is a size defect, fixed on its own terms; it is not a breach
of this invariant. A JavaScript entry that computes a style is a breach however
small it is. Keeping the two apart stops a size complaint from being answered
with "it is still zero runtime", and stops a runtime regression from being
waved through because it is only a few bytes.

**5. The browser's own style engine is the platform, not a runtime.** Custom
properties, `calc()`, relative colour syntax, `light-dark()`, media and container
queries all resolve at render time, inside the CSS engine, and Nave uses them
deliberately. Live re-tinting by changing `--nave-color-tint` is CSS doing what
CSS does. A consumer who sets that property from their own script owns that
script; Nave ships none.

**6. Where the invariant forbids something the platform allows, the refusal is
stated.** The theming build must compute and check a palette at build time, so
it refuses seed inputs that only resolve where an element renders (such as
`currentColor` or a bare custom-property reference), and its error says why.
That is the pattern for every future case: a refusal on runtime grounds names
the ground, rather than a surface quietly not supporting a lawful CSS form.

## Consequences

- "Zero runtime" can be checked: take a change, ask whether any shipped
  JavaScript now touches styling in the browser. The answer is a fact, not a
  reading.
- The public wording should never shorten the claim to "no JavaScript". "No
  runtime style computation" is the accurate short form.
- Future features are constrained in a predictable way. Anything that needs
  information only available at render time is either expressed in CSS the
  engine resolves (preferred, and usually possible), or refused at build time
  with its reason. A client-side helper that injects styles is ruled out, not
  deferred.
- The directive's move to native CSS mixins (ADR 0006) does not touch this
  invariant: the browser would expand native mixins in its CSS engine, which is
  decision 5, not decision 1.

## Alternatives considered

- **Leave the one-line statement as it is.** Rejected. It is the product's
  headline claim, and in its short form it is falsifiable by the first reader
  who opens `cx.js`.
- **Define zero runtime as "no JavaScript at all", and remove `cx()` and the
  JavaScript token exports.** Rejected. `cx()` is how atoms reach markup
  without a build step, and the token constants are how scripts share the CSS's
  numbers. Neither computes a style; removing them buys a slogan at the cost of
  two real uses.
- **Fold byte size into the invariant ("zero runtime cost").** Rejected, for
  the reason in decision 4: it makes one word carry two measurements, and each
  then excuses the other.
