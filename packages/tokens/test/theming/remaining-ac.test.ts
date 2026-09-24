import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { type Adjacency, ADJACENCY } from '../../src/theming/adjacency.ts'
import { findConformanceFraming, RETHEMING_NOTICE } from '../../src/theming/copy-lint.ts'
import { buildManifest, scanCoreContract } from '../../src/theming/core-contract.ts'
import { SLOT_DESCRIPTIONS } from '../../src/theming/descriptions.ts'
import { emitCss } from '../../src/theming/emit.ts'
import { checkFeedbackSignal } from '../../src/theming/feedback-signal.ts'
import {
  assertOnStarShape,
  deriveOnStarAnchors,
  ON_STAR_ANCHORS,
  type OnStarSource,
} from '../../src/theming/on-star.ts'
import { runPipeline } from '../../src/theming/pipeline.ts'
import {
  ACHROMATIC_BRANCH_SLOTS,
  ACHROMATIC_MAPPING,
  CHROMATIC_MAPPING,
} from '../../src/theming/semantics.ts'
import { TRANSCRIPTION_VARIANT } from './cleared-copy.ts'
import { headingOffsetsOutsideFences } from './markdown-headings.ts'

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }
function seeds(primary = TEAL): {
  danger: typeof DANGER
  declaredTintHue: number
  primary: typeof TEAL
} {
  return { primary, danger: DANGER, declaredTintHue: 186.17 }
}

const DIST = (file: string): string =>
  readFileSync(path.resolve(import.meta.dirname, '../../dist', file), 'utf8')

/**
 * The custom-property names DECLARED in a built stylesheet.
 *
 * Comments are stripped first and the match is anchored to line-start-plus-indent,
 * because `formats.ts` and `theming/emit.ts` both write prose comments into
 * `dist/tokens.css` (R20's feedback notice, R34's re-theming notice). An unanchored
 * `(--[\w-]+)\s*:` matches inside those comments and inside string values, so a single
 * migration note mentioning an old name in passing would turn the prefix guard below red
 * on a correct build.
 */
function declaredCustomProperties(css: string): string[] {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/^[ \t]*(--[\w-]+)\s*:/gm)
    .map((m) => m[1]!)
    .toArray()
}

/**
 * The custom-property keys of a generated object literal (`tokens.js`, `tokens.d.ts`).
 */
function typedKeys(source: string): string[] {
  return source
    .matchAll(/^[ \t]*'(--[\w-]+)'\s*:/gm)
    .map((m) => m[1]!)
    .toArray()
}

/**
 * The typed keys of `source` that name no custom property `dist/tokens.css` declares.
 *
 * SUBSET, never equality: the 34 `--nave-color-*` names come from theming/emit.ts and
 * deliberately carry no typed key at 0.1.0. AC-theming-31's round-18 scoping is explicit
 * that this is not a failure of the criterion ("a build that emits a --nave-color-*
 * custom property with no corresponding tokens.d.ts key passes this scenario"), so an
 * equality check would go red on the correct artifact.
 */
function typedKeysNotDeclaredInCss(source: string): string[] {
  const declared = new Set(declaredCustomProperties(DIST('tokens.css')))
  return typedKeys(source).filter((key) => !declared.has(key))
}

// Whitespace-collapsed comparison text (used by the wrapping-insensitive assertion below):
// hoisted to module scope per unicorn/consistent-function-scoping, since it closes over
// nothing local to any one test.
function collapse(text: string): string {
  return text.replaceAll(/\s+/g, ' ')
}

describe('AC-theming-31 covers: R26 (shipped artifact)', () => {
  // The two pre-existing AC-theming-31 tests (emit.test.ts, pipeline.test.ts) can only ever
  // see the theming layer's own `--nave-color-*` output by construction — one iterates
  // emitCss(...).customProperties, the other only checks the pipeline runs. Neither can
  // catch an unprefixed DTCG-path property (the 78 measured on main).
  // This reads the real SHIPPED artifacts instead, per R26's actual claim ("every custom
  // property Nave emits"), which is a fact about dist/, not about one emitter's map.
  it('every custom property declared in the built dist/tokens.css begins with --nave-', () => {
    const declared = declaredCustomProperties(DIST('tokens.css'))
    expect(declared.length).toBeGreaterThan(0)
    const offenders = declared.filter((name) => !name.startsWith('--nave-'))
    expect(offenders).toEqual([])
  })

  it('every @property registration in the built dist/tokens.css begins with --nave-', () => {
    const registered = DIST('tokens.css')
      .matchAll(/@property\s+(--[\w-]+)\s*\{/g)
      .map((m) => m[1]!)
      .toArray()
    expect(registered.length).toBeGreaterThan(0)
    for (const name of registered) expect(name.startsWith('--nave-')).toBe(true)
  })

  it('every key in the built dist/tokens.d.ts begins with --nave-', () => {
    const keys = typedKeys(DIST('tokens.d.ts'))
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key.startsWith('--nave-')).toBe(true)
  })

  it('every key in the built dist/tokens.js begins with --nave-', () => {
    // package.json exports BOTH `.` and `./js` at ./dist/tokens.js, and it is generated by
    // formatJsTokens — a different function from formatTsDeclarations, which produces the
    // .d.ts above. Nothing read this file at all before this review.
    const keys = typedKeys(DIST('tokens.js'))
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key.startsWith('--nave-')).toBe(true)
  })

  // The prefix assertions above are the criterion's first clause. Its typed-key clause is a
  // different claim, and a prefix check cannot implement it: "a build whose tokens.d.ts key
  // for an existing DTCG token DRIFTS from its emitted --nave- name does not pass". A key
  // renamed to `--nave-font-size-md-DRIFTED` still starts with `--nave-`, so the whole
  // typed surface can disagree with the emitted CSS while every prefix assertion stays
  // green. Only containment sees it, which is what typedKeysNotDeclaredInCss does (and see
  // its docblock for why the check is a subset rather than an equality).
  it('every dist/tokens.d.ts key names a custom property dist/tokens.css actually declares', () => {
    expect(typedKeys(DIST('tokens.d.ts')).length).toBeGreaterThan(0)
    expect(typedKeysNotDeclaredInCss(DIST('tokens.d.ts'))).toEqual([])
  })

  it('every dist/tokens.js key names a custom property dist/tokens.css actually declares', () => {
    expect(typedKeys(DIST('tokens.js')).length).toBeGreaterThan(0)
    expect(typedKeysNotDeclaredInCss(DIST('tokens.js'))).toEqual([])
  })
})

describe('AC-theming-15 covers: R13', () => {
  it('no semantic slot is a registered custom property, so a broken override fails visibly at the use site', () => {
    const emitted = emitCss(runPipeline(seeds()))
    for (const name of emitted.customProperties.keys()) {
      expect(emitted.css).not.toMatch(
        new RegExp(`@property ${name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`),
      )
    }
  })
})

// PARTIAL COVERAGE. This feeds checkFeedbackSignal three synthetic
// descriptors, so it proves the FUNCTION is correct; it does not scan R20's binding
// surface, which nothing scans. The accessibility steward ruled that the 0.1.0
// per-artifact subject set is EMPTY (nothing Nave ships at 0.1.0 renders a feedback
// state), so the check is deliberately NOT wired: wiring it to an empty array would be a
// green run over nothing. R20 obligation 1 (the emitted tokens.css notice) is now
// IMPLEMENTED — covered by test/theming/emit-r20-notice.test.ts and the R20 block in
// copy-lint.test.ts. The remaining non-per-artifact obligation is the README
// non-promise, still owed. Marked so the grep gate does not read R20 as covered by this
// alone.
describe('AC-theming-22 covers: R20', () => {
  it('an artifact conveying a feedback state by colour alone fails, naming the file', () => {
    const violations = checkFeedbackSignal([
      {
        file: 'recipes/alert.tsx',
        usesFeedbackToken: true,
        hasStateLabel: false,
        nonColourForm: undefined,
      },
    ])
    expect(violations).toEqual([
      { file: 'recipes/alert.tsx', reason: 'conveys a feedback state by colour alone' },
    ])
  })

  it('an icon with no state-naming label fails the same way', () => {
    const violations = checkFeedbackSignal([
      {
        file: 'recipes/toast.tsx',
        usesFeedbackToken: true,
        hasStateLabel: false,
        nonColourForm: 'icon:warning-triangle',
      },
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]!.reason).toMatch(/no text label/)
  })

  it('a text label plus a distinct non-colour form passes', () => {
    const violations = checkFeedbackSignal([
      {
        file: 'recipes/alert.tsx',
        usesFeedbackToken: true,
        hasStateLabel: true,
        nonColourForm: 'icon:error-octagon',
      },
    ])
    expect(violations).toEqual([])
  })
})

// AC-theming-30's OTHER half (the core reset no longer declares
// color-scheme) relocated to packages/core/test/reset-color-scheme.test.ts — that half
// reads packages/core/src/reset.css, which sat outside this package's turbo cache key.
describe('AC-theming-30 covers: R25', () => {
  it('the tokens package emits color-scheme: light dark in its own layer', () => {
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.css).toMatch(/color-scheme:\s*light dark/)
  })
})

describe('AC-theming-46 covers: R18b', () => {
  it('content.tertiary is documented placeholder/hint only, with no "disabled" synonym', () => {
    const desc = SLOT_DESCRIPTIONS.get('content.tertiary')!
    expect(desc.toLowerCase()).toMatch(/placeholder|hint/)
    expect(desc.toLowerCase()).not.toMatch(/disabled/)
  })

  it('content.disabled remains the token carrying the disabled use', () => {
    const desc = SLOT_DESCRIPTIONS.get('content.disabled')!
    expect(desc.toLowerCase()).toMatch(/disabled/)
  })

  it('no single description spans both a placeholder use and a disabled use', () => {
    for (const [, desc] of SLOT_DESCRIPTIONS) {
      const hasPlaceholder = /placeholder|hint/i.test(desc)
      const hasDisabled = /disabled/i.test(desc)
      expect(hasPlaceholder && hasDisabled).toBe(false)
    }
  })
})

describe('AC-theming-19 covers: R18a (descriptions)', () => {
  it('border.control identifies a control boundary, naming inputs, form boundaries, and (round 9) the secondary action control, with no decorative use listed', () => {
    const desc = SLOT_DESCRIPTIONS.get('border.control')!
    expect(desc.toLowerCase()).toMatch(/input/)
    expect(desc.toLowerCase()).toMatch(/form boundar/)
    expect(desc.toLowerCase()).toMatch(/secondary action control/)
    expect(desc.toLowerCase()).not.toMatch(/divider|card edge|decorativ/)
  })

  it('border.default is decorative only (dividers, card edges), with no control use listed', () => {
    const desc = SLOT_DESCRIPTIONS.get('border.default')!
    expect(desc.toLowerCase()).toMatch(/divider|card edge/)
    expect(desc.toLowerCase()).not.toMatch(/input|form boundar|control/)
  })

  it('neither description spans both a control obligation and a decorative one', () => {
    const control = SLOT_DESCRIPTIONS.get('border.control')!.toLowerCase()
    const dflt = SLOT_DESCRIPTIONS.get('border.default')!.toLowerCase()
    expect(/divider|card edge/.test(control)).toBe(false)
    expect(/input|form boundar/.test(dflt)).toBe(false)
  })
})

describe('C2 (content.link non-colour-distinction constraint)', () => {
  it('content.link is documented not to be distinguished by colour alone', () => {
    const desc = SLOT_DESCRIPTIONS.get('content.link')!
    expect(desc.toLowerCase()).toMatch(/colour alone/)
  })

  it('the wording makes no claim about consumer stylesheets (R34 is a separate obligation)', () => {
    const desc = SLOT_DESCRIPTIONS.get('content.link')!
    expect(desc.toLowerCase()).not.toMatch(/consumer|stylesheet|override/)
  })

  it("the wording names no specific non-colour cue (which one suffices is the accessibility steward's call)", () => {
    const desc = SLOT_DESCRIPTIONS.get('content.link')!
    expect(desc.toLowerCase()).not.toMatch(/underline|icon|bold|font-weight/)
  })

  it('holds under the achromatic branch too, where content.link aliases content.primary (R3(a))', () => {
    const desc = SLOT_DESCRIPTIONS.get('content.link')!
    // The instruction is about not relying on colour alone, independent of which colour the
    // token resolves to — it must not read as claiming this token always carries a distinct
    // hue, which would be false once it aliases content.primary.
    expect(desc.toLowerCase()).not.toMatch(/this token'?s colour|its own colour|a distinct colour/)
  })

  it('passes the R35 conformance-framing lint (no ratio, no WCAG/SC id, no forbidden word)', () => {
    expect(findConformanceFraming(SLOT_DESCRIPTIONS.get('content.link')!)).toBeUndefined()
  })
})

describe('AC-theming-39 covers: R34', () => {
  // A marker-only assertion (a bare /R34/ regex) passes on any text sitting on that line,
  // including a paraphrase that drops the transfer clause R34 exists for (that shape
  // shipped undetected on `eng/14-g1-theming`, product's fact 1); a prior audit of
  // this file could not have caught it either, since it also only checked the marker.
  // Assert the emitted line IS the cleared notice, sourced from the one constant
  // (`RETHEMING_NOTICE`), so a future paraphrase or a reversion to the pre-clearance
  // draft fails here rather than passing silently.
  it('the notice is emitted as a comment immediately above the seed declaration in the generated CSS, carrying the cleared text (not a marker, not a paraphrase)', () => {
    const emitted = emitCss(runPipeline(seeds()))
    const lines = emitted.css.split('\n')
    const seedLineIndex = lines.findIndex((l) => l.includes('--nave-color-tint:'))
    expect(seedLineIndex).toBeGreaterThan(0)
    expect(lines[seedLineIndex - 1]).toBe(`    /* Tint seed: ${RETHEMING_NOTICE} */`)
  })

  it("the notice constant is the accessibility steward's cleared wording verbatim, not the spec's pre-clearance draft", () => {
    expect(RETHEMING_NOTICE).toBe(
      'Changing this changes everything Nave derives from it. The contrast of the resulting palette follows from what you set, and checking it is yours.',
    )
  })

  it('round 12: this package emits the CANONICAL line at its one landing point, never the separately-cleared transcription variant', () => {
    // R34 now carries two cleared copy lines: the canonical one (RETHEMING_NOTICE, used at
    // every landing point this package owns) and a transcription variant cleared for the
    // one instance where a reader transcribes values Nave chose (README rung 2's "Neutral
    // actions" worked example, in the internal companion repository's docs — outside this
    // package entirely). Byte-inequality asserted so the two texts can never silently
    // collapse into "sourced from one constant" again, which round 12 retired.
    expect(RETHEMING_NOTICE).not.toBe(TRANSCRIPTION_VARIANT)

    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.css).not.toContain(TRANSCRIPTION_VARIANT)
  })
})

/**
 * Round 22's rule (the theming spec, together with a companion ruling) states landing point (1)'s
 * coverage as a check over RUNGS COVERED, never notice OCCURRENCES, and corrects the
 * "sourced from one constant" clause to mean no THIRD WORDING, never no third occurrence of an
 * already-cleared line. `packages/tokens/README.md` is the artifact the rule was written
 * against (round 21): it legitimately carries the canonical line TWICE, once per act
 * (rung `1a`'s own `:root` snippet; the shared build-command snippet that discharges `1b`, `3`
 * and `5` together), and carries no instance at all near `validate`, which transfers nothing
 * and is owed nothing (a second fence in that same rule). No test before this one read the
 * README at all.
 *
 * Round 22's OTHER half is not relied on here and is named so its absence is not read as
 * coverage: on a CODE surface carrying an addressable identifier the two cleared texts stay
 * sourced from exactly two constants, never a per-surface literal, unchanged from round 12.
 * This file is a code surface and this package holds no identifier for the variant, so the
 * literal these tests compare against is a hand transcription nothing checks; see its
 * declaration in `./cleared-copy.ts` for what that does and does not hold.
 *
 * The placement assertions below measure that a notice FOLLOWS its snippet, which is what the
 * artifact does. `AC-theming-39`'s round-22 `Then` reads "adjacent to that act, in reading
 * order before the act can be composed". The criterion's owner and that clause's own
 * author ruled in review that the FOLLOWING reading binds and that the
 * round-22 wording is a drafting error; the round-23 correction is drafted and carried on
 * Until it lands, the spec's uncorrected sentence and these assertions
 * point opposite ways, and these assertions are the ruled reading.
 */
describe('AC-theming-39 covers: R34 (packages/tokens/README.md, round 22 rule)', () => {
  const README = readFileSync(path.resolve(import.meta.dirname, '../../README.md'), 'utf8')

  it('carries at least the two required instances of the canonical notice, byte-identical to RETHEMING_NOTICE, with no upper bound (round 22: a third BYTE-IDENTICAL occurrence is not a third wording and must not fail)', () => {
    // A documentation surface has no constant to source from, so byte-identity at every
    // instance IS this criterion's anti-drift mechanism (round 22's second half). A near-miss
    // paraphrase is caught by the per-act adjacency checks below (indexOf skips past it to the
    // next real occurrence, and the "nothing between" assertion then fails), not by this count.
    // This is a FLOOR, matching what those two adjacency checks already force independently,
    // never a CEILING: round 22's own text says any number of additional byte-identical copies
    // of the cleared line is legitimate and must not fail this scenario, and a `.toBe(2)`
    // ceiling was demonstrated to go red on exactly that lawful case (a third act carrying a
    // byte-identical notice).
    const occurrences = README.split(RETHEMING_NOTICE).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('rung 1a: the notice sits immediately after the :root re-seed snippet, with nothing between it and the closing fence', () => {
    const snippetEnd = README.indexOf('```', README.indexOf('--nave-color-tint:')) + '```'.length
    const noticeIndex = README.indexOf(RETHEMING_NOTICE, snippetEnd)
    expect(noticeIndex).toBeGreaterThan(snippetEnd)
    // Nothing but blank lines between the snippet's closing fence and the notice: no other
    // act, and no other prose, sits between them.
    expect(README.slice(snippetEnd, noticeIndex).trim()).toBe('')
  })

  it('the shared build-command snippet discharges rungs 1b, 3 and 5 with ONE adjacent notice instance, not one per rung', () => {
    const snippetEnd =
      README.indexOf('```', README.indexOf('navecss-tokens build --seed')) + '```'.length
    const noticeIndex = README.indexOf(RETHEMING_NOTICE, snippetEnd)
    expect(noticeIndex).toBeGreaterThan(snippetEnd)
    expect(README.slice(snippetEnd, noticeIndex).trim()).toBe('')
    // Combined with the exactly-two assertion above: this is the ONLY instance in the file
    // from here on, so the three rungs this snippet performs share it rather than each
    // demanding a separate one.
  })

  it('the validate act carries no notice instance: it transfers nothing and is owed nothing', () => {
    const validateIndex = README.indexOf('navecss-tokens validate')
    expect(validateIndex).toBeGreaterThan(-1)
    // Bounded to the rest of THIS subsection, not to end-of-file: `validate` happening to be
    // the last of the four acts in today's README must not be why this check holds. A future
    // subsection appended after this one, carrying its own act and its own legitimate notice,
    // must not trip this guard merely for coming after `validate` in the file (demonstrated
    // live: the landed assertion false-fails on exactly that lawful
    // addition; this one does not).
    // FENCE-AWARE: a naive `indexOf('\n#', validateIndex)` is fooled by any hash-prefixed
    // line inside an intervening code fence (a bash/shell/python/yaml comment - "# ..." is
    // byte-identical to a markdown heading's own opening), which truncates the search window
    // before a real heading and hides everything past it (demonstrated live,
    // round 2: a two-line bash comment right after validate's own fence
    // let a spurious notice slip through 48/48 green under the round-2 landed guard).
    //
    // ANY heading level closes this window, which is why 6 and not the sibling caller's 2. The
    // bound is "the rest of THIS subsection", so a `### ` sub-heading legitimately ends it;
    // narrowing the scope to `#{1,2}` would WIDEN the window past that sub-heading and could
    // change this assertion's verdict. Shared tracker, per-caller scope.
    const sectionEnd =
      headingOffsetsOutsideFences(README, 6).find((offset) => offset > validateIndex) ??
      README.length
    expect(README.slice(validateIndex, sectionEnd).indexOf(RETHEMING_NOTICE)).toBe(-1)
  })

  it('carries no transcription of the round-12 variant, wrapped or unwrapped (a different document, a different instance class)', () => {
    // Whitespace-collapsed on both sides, because the variant's only prose home today
    // (in the internal companion repository's docs) is hard-wrapped across three lines: a verbatim
    // paste of it into this README would carry newlines, and a single-line `.toContain` would
    // report it absent at exactly the scenario this assertion exists for.
    //
    // What this does NOT check, stated so a green does not read as more: round 22's corrected
    // clause forbids a THIRD WORDING on this surface, and this compares against ONE
    // hand-transcribed string. A wording that is neither cleared line passes here.
    expect(collapse(README)).not.toContain(collapse(TRANSCRIPTION_VARIANT))
  })
})

describe('AC-theming-47 covers: R18c', () => {
  it('all four feedback families split into a foreground role and a solid-background role', () => {
    for (const family of ['danger', 'warning', 'success', 'info']) {
      expect(CHROMATIC_MAPPING[`feedback.${family}`]).toBeDefined()
      expect(CHROMATIC_MAPPING[`feedback.${family}.foreground`]).toBeDefined()
      expect(CHROMATIC_MAPPING[`on-feedback.${family}`]).toBeDefined()
    }
  })

  it('the two split roles are permitted to resolve to the same value (naming, not colour, obligation)', () => {
    const bg = CHROMATIC_MAPPING['feedback.danger']!
    const fg = CHROMATIC_MAPPING['feedback.danger.foreground']!
    expect(bg.light).toEqual(fg.light)
  })
})

// AC-theming-48 relocated to
// packages/core/test/index-css-layer-order.test.ts — it read packages/core/src/index.css,
// which sat outside this package's turbo cache key.

describe('branch data sanity (supports AC-theming-27/28/43)', () => {
  it('ACHROMATIC_MAPPING has exactly the six slots write-back 6 names', () => {
    expect(Object.keys(ACHROMATIC_MAPPING).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'action.primary',
      'action.primary.active',
      'action.primary.hover',
      'border.focus',
      'content.link',
      'on-action.primary',
    ])
  })

  it('ACHROMATIC_BRANCH_SLOTS names the same six slots ACHROMATIC_MAPPING overrides', () => {
    // R3(a)'s six slots are declared twice: as the named constant, and as the mapping
    // `resolveSlotMapping` actually reads. Nothing else asserts the two agree, so a slot
    // added to one and not the other would branch differently from what the spec names.
    expect([...ACHROMATIC_BRANCH_SLOTS].toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(ACHROMATIC_MAPPING).toSorted((a, b) => a.localeCompare(b)),
    )
  })
})

// AC-theming-54's constructed cases: the guard pointed at a mutated anchor record rather
// than at the shipped one, which is the only way its failing directions are reachable.
const shape =
  (anchors: Record<string, string>): (() => void) =>
  (): void =>
    assertOnStarShape({ mapping: CHROMATIC_MAPPING, branchMapping: ACHROMATIC_MAPPING, anchors })

describe('AC-theming-54 covers: R18e', () => {
  const ON_STAR_SLOTS = [
    'on-action.primary',
    'on-feedback.danger',
    'on-feedback.warning',
    'on-feedback.success',
    'on-feedback.info',
  ]

  it('every on-* slot the DTCG source carries is exactly the set this scenario names', () => {
    const emitted = Object.keys(CHROMATIC_MAPPING).filter((name) => name.startsWith('on-'))
    expect(emitted.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...ON_STAR_SLOTS].toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it('does not throw: every on-* slot names exactly one anchor, the resting solid-background role, resolving to an emitted name', () => {
    expect(() => assertOnStarShape()).not.toThrow()
  })

  it('the anchor is the RESTING state, never a hover/active fill or a .foreground role', () => {
    expect(ON_STAR_ANCHORS['on-action.primary']).toBe('action.primary')
    for (const family of ['danger', 'warning', 'success', 'info']) {
      expect(ON_STAR_ANCHORS[`on-feedback.${family}`]).toBe(`feedback.${family}`)
    }
    for (const anchor of Object.values(ON_STAR_ANCHORS)) {
      expect(anchor).not.toMatch(/\.(hover|active|foreground)$/)
    }
  })

  it('a slot naming zero anchors fails the check, naming the slot', () => {
    // Constructed violation (AC-theming-05's shape): ON_STAR_ANCHORS is a Record, so
    // "more than one anchor" cannot be represented at all — the type enforces that half
    // of R18e's condition by construction. This constructs the other half, a missing entry,
    // and PASSES IT THROUGH the guard: the previous version deleted a key and asserted the
    // key was gone, which proves `delete` works and leaves assertOnStarShape unexercised in
    // its failing direction.
    const anchors = { ...ON_STAR_ANCHORS }
    delete anchors['on-action.primary']

    expect(() =>
      assertOnStarShape({
        mapping: CHROMATIC_MAPPING,
        branchMapping: ACHROMATIC_MAPPING,
        anchors,
      }),
    ).toThrow(/on-action\.primary names no anchor/)
  })

  it('an anchor naming a state fill, a .foreground role, or a name the build never emits fails naming the slot and the anchor', () => {
    expect(shape({ ...ON_STAR_ANCHORS, 'on-action.primary': 'action.primary.hover' })).toThrow(
      /state or a foreground role/,
    )
    expect(
      shape({ ...ON_STAR_ANCHORS, 'on-feedback.danger': 'feedback.danger.foreground' }),
    ).toThrow(/state or a foreground role/)
    expect(shape({ ...ON_STAR_ANCHORS, 'on-feedback.info': 'primary-600' })).toThrow(
      /not a name the build emits/,
    )
  })

  it('every on-* slot value is the whole declaration: never composed, never an alias, in either mapping column', () => {
    for (const slot of ON_STAR_SLOTS) {
      const mappings = [CHROMATIC_MAPPING[slot], ACHROMATIC_MAPPING[slot]].filter(
        (m) => m !== undefined,
      )
      for (const mapping of mappings) {
        expect('alias' in mapping.light).toBe(false)
        expect('alias' in mapping.dark).toBe(false)
      }
    }
  })

  it('the content.link-aliases-action.primary shape stays lawful: aliasing an on-* slot is what would fail, not aliasing in general', () => {
    // content.link (NOT an on-* slot) legitimately aliases content.primary in the
    // achromatic branch. This scenario's own text: "a check that forbade aliasing
    // generally would fail a construction R23 ships."
    expect('alias' in ACHROMATIC_MAPPING['content.link']!.light).toBe(true)
    expect(() => assertOnStarShape()).not.toThrow()

    // What WOULD fail: some other slot aliasing an on-* slot directly. Collected outside
    // any conditional expect (vitest/no-conditional-expect) — the offenders list is
    // asserted empty once, naming every violation if there is one.
    const offenders: string[] = []
    for (const [name, mapping] of Object.entries(CHROMATIC_MAPPING)) {
      for (const branch of ['light', 'dark'] as const) {
        const ref = mapping[branch]
        if ('alias' in ref && ref.alias.startsWith('on-')) {
          offenders.push(`${name}.${branch} aliases the on-* slot "${ref.alias}"`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// Part 3's derivation, exercised in BOTH directions. The derivation runs
// at module load, so until it was constrained to the subject's own family it could turn a
// lawful R22 widening into a module-resolution wall: every test file transitively importing
// this module failed to load, and `assertOnStarShape` — the AC-theming-54-tagged guard for
// exactly this condition — could never run, because the module it lives in could not load.
// R18e condition 1's rule is the family one ("the solid-background role of the matching
// `feedback.*`"), which is what the derivation now applies; detection of a violation belongs
// to the guard, not to the derivation.
const onStarSource = (adjacency: readonly Adjacency[]): OnStarSource => ({
  mapping: CHROMATIC_MAPPING,
  branchMapping: ACHROMATIC_MAPPING,
  anchors: deriveOnStarAnchors(adjacency),
  adjacency,
})

describe('AC-theming-54 covers: R18e (the derivation half, part 3)', () => {
  it('derives exactly the five anchors main hand-authored, from the shipped declaration', () => {
    expect(deriveOnStarAnchors(ADJACENCY)).toEqual({
      'on-action.primary': 'action.primary',
      'on-feedback.danger': 'feedback.danger',
      'on-feedback.warning': 'feedback.warning',
      'on-feedback.success': 'feedback.success',
      'on-feedback.info': 'feedback.info',
    })
    expect(ON_STAR_ANCHORS).toEqual(deriveOnStarAnchors(ADJACENCY))
  })

  it('a lawful R22 widening (a second resting partner beyond the family anchor) neither crashes nor changes the anchor', () => {
    // C5/AC-theming-53: adding beyond the minimum is an ordinary spec edit, ungated.
    // `on-feedback.warning` against `feedback.success` is a real checkable pair (R18c/R20
    // make those families share one value), so declaring it must not fail anything.
    const widened: Adjacency[] = [
      { subject: 'on-feedback.warning', against: 'feedback.warning', class: 'text' },
      { subject: 'on-feedback.warning', against: 'feedback.success', class: 'text' },
    ]
    expect(() => deriveOnStarAnchors(widened)).not.toThrow()
    expect(deriveOnStarAnchors(widened)).toEqual({ 'on-feedback.warning': 'feedback.warning' })
  })

  it('two differing resting partners, NEITHER of them the family anchor, fail as a named guard rather than at module load', () => {
    const ambiguous: Adjacency[] = [
      { subject: 'on-feedback.warning', against: 'feedback.success', class: 'text' },
      { subject: 'on-feedback.warning', against: 'feedback.info', class: 'text' },
    ]
    expect(() => deriveOnStarAnchors(ambiguous)).not.toThrow()
    expect(() => assertOnStarShape(onStarSource(ambiguous))).toThrow(
      /"on-feedback\.warning".*"feedback\.success".*"feedback\.info".*"feedback\.warning"/s,
    )
  })

  it('a single CROSS-FAMILY resting partner is not silently accepted as an anchor', () => {
    const crossFamily: Adjacency[] = [
      { subject: 'on-feedback.warning', against: 'feedback.success', class: 'text' },
    ]
    expect(deriveOnStarAnchors(crossFamily)).toEqual({})
    expect(() => assertOnStarShape(onStarSource(crossFamily))).toThrow(
      /"on-feedback\.warning".*"feedback\.success"/s,
    )
  })

  it('zero resting partners (state fills only) leaves the subject with no anchor, and the guard names it', () => {
    const statesOnly: Adjacency[] = [
      { subject: 'on-action.primary', against: 'action.primary.hover', class: 'text' },
      { subject: 'on-action.primary', against: 'action.primary.active', class: 'text' },
    ]
    expect(deriveOnStarAnchors(statesOnly)).toEqual({})
    expect(() => assertOnStarShape(onStarSource(statesOnly))).toThrow(
      /on-action\.primary names no anchor/,
    )
  })
})

describe('AC-theming-55 covers: R18e', () => {
  it('no requirement of this spec conditions an obligation on an on-* slot carrying two branches, as distinct from carrying a dark branch at all', () => {
    // R23's gate (AC-theming-28) already asserts every slot, on-* included, carries a
    // dark branch. This scenario's condition is narrower and negative: nothing may
    // additionally depend on the two branches being independently addressable. The
    // mapping shape itself carries no such hook — SlotMapping is { light, dark }, read
    // as a pair by the pipeline and emitted through light-dark(), with no per-branch
    // override surface for on-* slots specifically (R29's ladder rungs are the general
    // override surface and are R18e's third surface, checked below).
    for (const slot of ['on-action.primary', 'on-feedback.danger']) {
      const mapping = CHROMATIC_MAPPING[slot]!
      expect(Object.keys(mapping).toSorted((a, b) => a.localeCompare(b))).toEqual(['dark', 'light'])
    }
  })

  // This scenario's other check ("core's source never unwraps or
  // re-wraps an on-* slot's light-dark() structure") relocated to
  // packages/core/test/on-star-light-dark-consumption.test.ts — it read
  // packages/core/src/{reset.css,atoms.ts,postcss.ts}, which sat outside this package's
  // turbo cache key.

  it('R27s core-contract scan and R28s manifest carry an on-* name as a plain string, never a light/dark pair', () => {
    // Exercises the real R27/R28 functions against an on-* name
    // directly, rather than restating their shapes in prose: COLOR_VAR_PATTERN captures
    // the custom-property name only, and buildManifest's `tokens` is `readonly string[]`.
    // Neither has a field this on-* slot's light-dark() pair-ness could ever populate.
    const onActionVar = '--nave-color-on-action-primary'
    const scanned = scanCoreContract([`color: var(${onActionVar});`])
    expect(scanned).toEqual([onActionVar])

    const manifest = buildManifest(scanned, { name: '@navecss/core', version: '0.1.0' })
    expect(manifest.tokens).toEqual([onActionVar])
    expect(typeof manifest.tokens[0]).toBe('string')
  })

  // R18e's remaining surface — no documented ladder rung instructs overriding one branch
  // of an on-* slot independently of the other — ranges over documentation (R29's ladder
  // in the theming spec), a surface this repository holds no copy of to read against.
  // This is the same class of gap AC-theming-35 and AC-theming-39's README half are
  // already in (no artifact in this repository exists yet to check text against): recorded here as a
  // known-uncovered slice of this scenario rather than papered over with a vacuous test,
  // per this file's own no-marker-only-assertion discipline (AC-theming-39's finding).
})
