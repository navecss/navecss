---
supersedes: '-'
superseded-by: '-'
---

# 0002 — The token pipeline targets DTCG 2025.10, reads one shape, and refuses the pre-stable draft by name

- **Status:** accepted
- **Date:** 2026-09-21
- **Deciders:** Cédric (ruling), following a pre-launch architecture review and a
  product scoping pass.
- **Tracking:** the 0.1.0 launch batch; supersedes nothing.

## Context

`@navecss/tokens` reads a token file and emits CSS custom properties, a JS
constant map and its type declarations. The file's format is the **Design Tokens
Format Module**, published by the Design Tokens Community Group.

Two facts about that format decide this ADR, and they must not be run together:

1. **It reached a first stable version, 2025.10, on 28 October 2025.** Before
   that it was a working draft that changed shape repeatedly.
2. **2025.10 is a Final Community Group Report, not a W3C Standard.** A
   Community Group publishes on its own authority. The document is stable and
   implementable, and it is not on a standards track, has no Recommendation
   status, and carries no conformance or certification programme. This ADR says
   so in those words because the distinction is the whole reason the wording
   rules below exist.

Until this change, the reader and `tokens.json` implemented the **pre-stable
draft**: a dimension was the string `"16px"`, a duration `"200ms"`, a font
weight `"400"`, and a shadow layer's offsets were CSS strings. Measured against
2025.10, 74 of the file's 93 tokens were non-conformant, and a 2025.10 shadow
object handed to the reader rendered `[object Object]` at exit 0. Meanwhile the
package description and both READMEs said "W3C DTCG", with no date.

That is a shipped claim that is wrong in two directions at once: it names a
standards body whose imprimatur the document does not carry, and it names a
format revision the code does not implement. For a project whose second tenet is
"standards over frameworks", that is a principle violation rather than a gap,
and it is cheapest to fix before anything is published.

## Decision

**1. The source migrates to 2025.10, and the reader reads that one revision.**
`tokens.json` is rewritten to the object shapes: `{value, unit}` for a dimension
and a duration, `{colorSpace, components, alpha?}` for a colour, a typed object
per shadow layer with `spread` always present, arrays for font-family stacks,
and JSON numbers where the draft wrote quoted numerals.

**2. The pre-stable draft shape is REFUSED BY NAME, per `$type`, at exit 1.**
There is no second accepted shape and no compatibility path. The refusal says
what the file is (an earlier revision of this same format, not a broken file),
names every offending node in ONE run, gives each node's own conversion
instruction for its own `$type`, and ends on the dated specification.

**3. Vendor extensions stay under `$extensions`.** The format has no notion of a
derived token, so Nave's seed binding, step table and adjacency declarations
live under `dev.navecss.theming`, which is where the format puts vendor data and
requires tools to preserve it. The adjacency keys stay dotted: they sit inside
`$extensions` and are therefore not names in the format's own sense.

**4. The resolved artifact is renamed, not rebuilt.** `dist/tokens.resolved.json`
becomes `dist/palette-record.json` and says in its own bytes that it is a record
of what the build produced and is not meant to be read as a token document. Two
grounds: its values are relative-colour-syntax strings that no colour object in
the format can express, and expressing light and dark "the format's way" would
mean adopting the Resolver Module, which has no stable release. Building a real
2025.10 resolved document is a separate feature, not this one's tail.

**5. One stated deviation.** `letterSpacing.tight`, `.normal` and `.wide` carry
the unit `em`, which 2025.10's `dimension` unit set (`px`, `rem`) does not
include. `em` is lawful CSS and is the correct unit for tracking, because it
resolves against the element's own font size. Converting them to `rem` would
change what renders, which a format migration is not a licence to do. So the
three keep the 2025.10 object shape with an out-of-set unit, and the file says
so: **90 of 93 tokens conform**. A strict third-party reader will reject those
three, and that cost is stated rather than absorbed.

**6. `$ref` is supported, narrowed to whole-token pointers.** It is the second
of the format's two reference forms. A pointer into a sub-value, and a node
carrying both reference forms, are refused by name.

**7. Wording.** Every consumer-reachable occurrence of "DTCG" carries the
specification date. The word "W3C" appears on none of those surfaces, and the
community-group status is stated once per surface, in body prose.

## Consequences

- **The input contract is a breaking change** for anyone holding a draft-shaped
  file. Nothing is published yet, so the only draft-shaped file this project is
  responsible for is its own; the refusal exists for everyone else, and it is
  written to be actionable in one build cycle rather than one node at a time.
- **`tokens.js` values now carry their JSON type.** Eighteen rows became numbers,
  and `tokens.d.ts` types those keys `number`, so `TokenValue` is
  `string | number`. Typing them all `string` would be a shipped declaration
  that is false about the artifact beside it.
- **Emitted CSS moves by exactly three declarations.** The three multi-layer
  shadows gain an explicit zero `spread` and render their zero offsets as `0px`,
  because 2025.10 requires the `spread` sub-field and cannot express a unitless
  zero. Every other emitted byte is unchanged, breakpoints included.
- **A stated deviation is an export hazard.** The day this project emits a token
  document for another tool to read, the three `em` tokens cannot be emitted
  lawfully. Such an export must warn and offer an alternative rather than
  silently converting them (a rendering change nobody asked for) or silently
  dropping them (an incomplete palette with no signal). Nothing emits one today.
- **No third-party product is named in any shipped byte**, in a refusal, a
  README sentence, a compiled docblock or a `$description`. A refusal that told
  a reader to re-export from a particular tool would ship a frozen claim about
  another project's shape support, and would state a remedy this project has not
  cleared itself to recommend. The conversion is always stated as an edit to the
  reader's own file.
- **Attribution.** The two specifications are credited by name and version in
  `packages/tokens/LICENSE`, appended to the existing third-party block, because
  the licence those documents are published under makes attribution a condition
  of the copyright grant rather than a courtesy.

## Alternatives considered

- **Accept both shapes.** Rejected. It is a permanent second code path carrying a
  real ambiguity (a dimension string against a string that merely resembles one)
  for a compatibility obligation that does not exist, since nothing is
  published. A converter, if demand for reading older tool exports appears, is a
  small separate feature decided on its own evidence.
- **Keep the draft and just date the claim.** Rejected. It states the problem
  accurately and leaves it in place, eleven months after the stable release, in
  the one subsystem the project's own positioning rests on.
- **Rebuild the resolved artifact as a real 2025.10 document.** Deferred, with
  its reason: it needs the Resolver Module for light and dark, which is not a
  stable release, and this project does not build on unstable specifications.
- **Convert the three `em` tokens to `rem`.** Rejected. It changes a rendered
  value as a side effect of a format migration, and letter-spacing that tracks
  the element's own font size is the behaviour the value was chosen for. If that
  should change, it should change deliberately and on its own merits.
