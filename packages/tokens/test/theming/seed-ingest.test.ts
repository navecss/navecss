/**
 * The CLI (R21, R22, R23): seed-string ingest REFUSAL classification, over all seven of
 * R5's accepted forms. The CONVERSION of lab()/lch()/color() against
 * published CSS Color 4 test vectors is R19's and lives in `css-color-4-vectors.test.ts`; this
 * file asserts the refusal classes, their wording and their ordering, plus the four direct-path
 * forms' conversions as supporting infrastructure.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { srgbToOklch } from '../../src/theming/color-math.ts'
import { CSS_NAMED_COLOURS } from '../../src/theming/css-named-colours.ts'
import { splitChannelArgs } from '../../src/theming/seed-channel-split.ts'
import { ingestSeed, SeedIngestRefusal } from '../../src/theming/seed-ingest.ts'
import { codeOnly } from './code-only.ts'

function refusalFor(input: string): SeedIngestRefusal {
  try {
    ingestSeed(input)
  } catch (error) {
    if (error instanceof SeedIngestRefusal) return error
    throw error
  }
  throw new Error(`expected ingestSeed(${JSON.stringify(input)}) to refuse, it did not`)
}

const byName = (a: string, b: string): number => a.localeCompare(b)

/**
 * R23's purity predicate, named once so the guard below and the row that proves the guard's
 * comment stripper does not swallow real code bind to the same two subjects rather than to two
 * spellings of them (row R3-01 of the quality review).
 */
const PURITY_RE =
  /\bfrom\s+['"](node:)?fs['"]|writeFileSync|readFileSync|appendFileSync|process\.exit|process\.stdout|process\.stderr|console\./

// One representative input per refusal class, reused across AC-21/22/23's scenarios so the
// four-class enumeration and the per-class wording checks are testing the same instances.
const NON_OPAQUE_ALPHA_INPUT = '#aabbccfe'
const CONTEXT_DEPENDENT_INPUT = 'currentColor'
const RELATIVE_COLOUR_SYNTAX_INPUT = 'oklch(from var(--x) l c h)'
const NAMED_COLOUR_INPUT = 'tomato'
const UNRECOGNISED_FORM_INPUT = 'hwb(120 50% 50%)'

describe('AC-token-build-21 covers: R21', () => {
  it('a CSS colour FUNCTION form not on R5\'s accepted list (hwb()) refuses with a fourth, distinct "unrecognised form" class', () => {
    const refusal = refusalFor(UNRECOGNISED_FORM_INPUT)
    expect(refusal.refusalClass).toBe('unrecognised-form')
  })

  it("the four refusal classes are pairwise distinct — none is reused as another's label", () => {
    const classes = [
      refusalFor(NON_OPAQUE_ALPHA_INPUT).refusalClass,
      refusalFor(CONTEXT_DEPENDENT_INPUT).refusalClass,
      refusalFor(NAMED_COLOUR_INPUT).refusalClass,
      refusalFor(UNRECOGNISED_FORM_INPUT).refusalClass,
    ]
    expect(new Set(classes)).toEqual(
      new Set(['context-dependent-form', 'named-colour', 'non-opaque-alpha', 'unrecognised-form']),
    )
    expect(classes).toHaveLength(4)
  })

  it.each([
    ['non-opaque alpha', NON_OPAQUE_ALPHA_INPUT, 'channel-value'],
    ['context-dependent form', CONTEXT_DEPENDENT_INPUT, 'form-acceptance'],
    ['named colour', NAMED_COLOUR_INPUT, 'form-acceptance'],
    ['unrecognised form', UNRECOGNISED_FORM_INPUT, 'form-acceptance'],
  ] as const)(
    "a %s refusal carries: (a) the input verbatim, (b) which act refused it, (c) a fix stated as an act, (d) a pointer to R5's accepted-form list",
    (_label, input, expectedAct) => {
      const refusal = refusalFor(input)
      // (a) input as given, verbatim, never a normalised echo
      expect(refusal.input).toBe(input)
      expect(refusal.message).toContain(input)
      // (b) which of the two acts refused it
      expect(refusal.act).toBe(expectedAct)
      // (c) the fix stated as an act on the consumer's own file — an imperative verb, not
      // only a restatement of the rule ("X is not accepted").
      expect(refusal.message.toLowerCase()).toMatch(/\b(write|remove|drop|replace|set)\b/)
      // (d) a pointer to R5's accepted-form list
      expect(refusal.message.toLowerCase()).toMatch(/accepted seed forms?/)
      expect(refusal.message).toMatch(/hex/i)
      expect(refusal.message).toMatch(/rgb\(\)/i)
      expect(refusal.message).toMatch(/hsl\(\)/i)
      expect(refusal.message).toMatch(/oklch\(\)/i)
    },
  )

  // An empty or whitespace-only input is a member of the same fourth
  // class, but the generic "`${input}` is not an accepted seed form" sentence composes to
  // two empty backtick pairs for it and never says the seed was blank. Driven through the
  // real dispatcher (ingestSeed), not unrecognisedForm directly, per the rider that a
  // message in this family can be false only in the composition with both halves innocent.
  it.each([
    ['empty', ''],
    ['whitespace-only', ' '.repeat(3)],
  ] as const)(
    'a %s seed still refuses as unrecognised-form, and NAMES the input as blank rather than printing two empty backticks',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.refusalClass).toBe('unrecognised-form')
      // Never the two-empty-backtick shape the generic sentence produced before this fix.
      expect(refusal.message).not.toMatch(/`` is not an accepted seed form/)
      expect(refusal.message.toLowerCase()).toMatch(/\b(empty|whitespace)\b/)
    },
  )

  it('relative colour syntax (oklch(from ...)) also refuses as context-dependent-form, not as a fifth class', () => {
    const refusal = refusalFor(RELATIVE_COLOUR_SYNTAX_INPUT)
    expect(refusal.refusalClass).toBe('context-dependent-form')
    expect(refusal.act).toBe('form-acceptance')
  })

  it('a bare custom-property reference used as the whole seed refuses as context-dependent-form', () => {
    const refusal = refusalFor('var(--brand)')
    expect(refusal.refusalClass).toBe('context-dependent-form')
  })

  it('color-mix() over a custom property refuses as context-dependent-form', () => {
    const refusal = refusalFor('color-mix(in oklch, var(--brand), white)')
    expect(refusal.refusalClass).toBe('context-dependent-form')
  })

  it('every refusal a broad input corpus produces carries one of exactly the FOUR classes R21 names', () => {
    const corpus = [
      '#aabbccfe',
      '#12345',
      '#gg0000',
      'currentColor',
      'var(--brand)',
      'color-mix(in oklch, var(--a), white)',
      'oklch(from var(--x) l c h)',
      'tomato',
      'red',
      'white',
      'rebeccapurple',
      'cornflowerblue',
      'hwb(120 50% 50%)',
      'inherit',
      'rgb(1 2)',
      'rgb(foo bar baz)',
      'oklch(0.5 0.1 notahue)',
      'rgb(var(--r) 0 0)',
      'rgb(0 0 0 / abc)',
      'light-dark(#fff, #000)',
      'env(safe-area-inset-top)',
      'color(rec2020 0 1 0)',
      'color(xyz-d50 0.2 0.3 0.4)',
      'color(srgb 0.1 0.2)',
      'lab(50 foo 20)',
      'lch(50 40 200 / 0.5)',
    ]
    const seen = new Set(corpus.map((input) => refusalFor(input).refusalClass))
    expect([...seen].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'context-dependent-form',
      'named-colour',
      'non-opaque-alpha',
      'unrecognised-form',
    ])
  })

  it('the named-colour class is driven by the shipped keyword SET, checked by full membership (not just size and a few samples, which a swap at the same size would still pass)', () => {
    // Hand-authored, independent of the shipped Set: the complete CSS Color 4 extended
    // keyword table plus `transparent`. Catches a real keyword being swapped for a bogus one
    // at the same size, which `size === 149` plus a five-name sample would not.
    const EXPECTED_NAMED_COLOURS = [
      'aliceblue',
      'antiquewhite',
      'aqua',
      'aquamarine',
      'azure',
      'beige',
      'bisque',
      'black',
      'blanchedalmond',
      'blue',
      'blueviolet',
      'brown',
      'burlywood',
      'cadetblue',
      'chartreuse',
      'chocolate',
      'coral',
      'cornflowerblue',
      'cornsilk',
      'crimson',
      'cyan',
      'darkblue',
      'darkcyan',
      'darkgoldenrod',
      'darkgray',
      'darkgreen',
      'darkgrey',
      'darkkhaki',
      'darkmagenta',
      'darkolivegreen',
      'darkorange',
      'darkorchid',
      'darkred',
      'darksalmon',
      'darkseagreen',
      'darkslateblue',
      'darkslategray',
      'darkslategrey',
      'darkturquoise',
      'darkviolet',
      'deeppink',
      'deepskyblue',
      'dimgray',
      'dimgrey',
      'dodgerblue',
      'firebrick',
      'floralwhite',
      'forestgreen',
      'fuchsia',
      'gainsboro',
      'ghostwhite',
      'gold',
      'goldenrod',
      'gray',
      'green',
      'greenyellow',
      'grey',
      'honeydew',
      'hotpink',
      'indianred',
      'indigo',
      'ivory',
      'khaki',
      'lavender',
      'lavenderblush',
      'lawngreen',
      'lemonchiffon',
      'lightblue',
      'lightcoral',
      'lightcyan',
      'lightgoldenrodyellow',
      'lightgray',
      'lightgreen',
      'lightgrey',
      'lightpink',
      'lightsalmon',
      'lightseagreen',
      'lightskyblue',
      'lightslategray',
      'lightslategrey',
      'lightsteelblue',
      'lightyellow',
      'lime',
      'limegreen',
      'linen',
      'magenta',
      'maroon',
      'mediumaquamarine',
      'mediumblue',
      'mediumorchid',
      'mediumpurple',
      'mediumseagreen',
      'mediumslateblue',
      'mediumspringgreen',
      'mediumturquoise',
      'mediumvioletred',
      'midnightblue',
      'mintcream',
      'mistyrose',
      'moccasin',
      'navajowhite',
      'navy',
      'oldlace',
      'olive',
      'olivedrab',
      'orange',
      'orangered',
      'orchid',
      'palegoldenrod',
      'palegreen',
      'paleturquoise',
      'palevioletred',
      'papayawhip',
      'peachpuff',
      'peru',
      'pink',
      'plum',
      'powderblue',
      'purple',
      'rebeccapurple',
      'red',
      'rosybrown',
      'royalblue',
      'saddlebrown',
      'salmon',
      'sandybrown',
      'seagreen',
      'seashell',
      'sienna',
      'silver',
      'skyblue',
      'slateblue',
      'slategray',
      'slategrey',
      'snow',
      'springgreen',
      'steelblue',
      'tan',
      'teal',
      'thistle',
      'tomato',
      'transparent',
      'turquoise',
      'violet',
      'wheat',
      'white',
      'whitesmoke',
      'yellow',
      'yellowgreen',
    ]
    expect(EXPECTED_NAMED_COLOURS).toHaveLength(149)
    expect([...CSS_NAMED_COLOURS].toSorted(byName)).toEqual(EXPECTED_NAMED_COLOURS.toSorted(byName))
    for (const name of EXPECTED_NAMED_COLOURS) {
      expect(refusalFor(name).refusalClass).toBe('named-colour')
    }
  })

  it('a hex seed with the wrong digit count is refused as a channel-value act, stating hex IS an accepted form — never form-acceptance, which the round-2 act fix reached for the function forms but not this hex branch', () => {
    const refusal = refusalFor('#12345')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).toMatch(/`hex` is an accepted seed form/)
    expect(refusal.message).toMatch(/3, 4, 6 or 8 digits/)
  })

  it('a hex seed whose digits are not hexadecimal is also refused as a channel-value act, not as an unrecognised form', () => {
    const refusal = refusalFor('#gg0000')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).toMatch(/`hex` is an accepted seed form/)
  })

  it('light-dark() and env() refuse as context-dependent-form, not as an unrecognised form — both names resolve, just not at build time', () => {
    expect(refusalFor('light-dark(#fff, #000)').refusalClass).toBe('context-dependent-form')
    expect(refusalFor('env(safe-area-inset-top)').refusalClass).toBe('context-dependent-form')
  })

  // Quality-review findings F1/F1b (extended to F5/F6 in the same
  // round): R21's fifth class reached at the channel-value act (`badChannelValue`'s "one or
  // more of its channel values could not be read as a number"). `Number('')` is `0`, not
  // `NaN`, so a bare `%` (no digits
  // before the sign) silently read as channel value 0 instead of refusing, in every channel
  // position of lab(), lch(), color(srgb …), color(display-p3 …), rgb(), hsl() and oklch()'s
  // lightness/chroma, plus the alpha slot shared by every form. hex is unaffected: its digits
  // are never percentages.
  it.each([
    ['lab(), L channel', 'lab(% 20 30)'],
    ['lab(), a channel', 'lab(50 % 30)'],
    ['lab(), b channel', 'lab(50 20 %)'],
    ['lch(), L channel', 'lch(% 30 40)'],
    ['lch(), C channel', 'lch(50 % 40)'],
    ['color(srgb …), r channel', 'color(srgb % .5 .5)'],
    ['color(srgb …), g channel', 'color(srgb .5 % .5)'],
    ['color(srgb …), b channel', 'color(srgb .5 .5 %)'],
    ['color(display-p3 …), r channel', 'color(display-p3 % 1 0)'],
    ['color(display-p3 …), g channel', 'color(display-p3 1 % 0)'],
    ['color(display-p3 …), b channel', 'color(display-p3 1 0 %)'],
    ['rgb(), r channel', 'rgb(% 0 0)'],
    ['rgb(), g channel', 'rgb(0 % 0)'],
    ['rgb(), b channel', 'rgb(0 0 %)'],
    ['hsl(), s channel', 'hsl(120 % 50%)'],
    ['hsl(), l channel', 'hsl(120 50% %)'],
    ['oklch(), lightness channel', 'oklch(% 0.1 250)'],
    ['oklch(), chroma channel', 'oklch(0.5 % 250)'],
  ] as const)(
    'a bare `%%` channel token (%s) refuses at the channel-value act as an unreadable channel, never converts to a colour: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).toMatch(/could not be read as a number/)
    },
  )

  it.each([['rgb(0 0 0 / %)'], ['lab(50 20 30 / %)']] as const)(
    'a bare `%%` alpha token refuses as an unreadable channel value, never as non-opaque-alpha: %s',
    (input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.refusalClass).not.toBe('non-opaque-alpha')
      expect(refusal.message).toMatch(/alpha channel could not be read as a number/)
    },
  )

  // A quality-review finding, F6: `parseHueDeg` strips a trailing `deg` and read the remainder
  // the same unguarded way, so a bare `deg` token (no digits before the unit) hit the identical
  // `Number('')` gap. Reaches
  // the hue channel of oklch(), lch() and hsl().
  it.each([
    ['oklch(), hue channel', 'oklch(0.5 0.1 deg)'],
    ['lch(), hue channel', 'lch(50 40 deg)'],
    ['hsl(), hue channel', 'hsl(deg 100% 50%)'],
  ] as const)(
    'a bare `deg` hue token (%s) refuses at the channel-value act as an unreadable channel, never converts to a colour: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).toMatch(/could not be read as a number/)
    },
  )

  it('a genuinely valid percentage or `deg` unit in every one of those same positions still converts exactly as before the quality-review F1/F1b/F5/F6 fixes', () => {
    expect(ingestSeed('lab(50% 40 59.5)')).toEqual(ingestSeed('lab(50 40 59.5)'))
    expect(ingestSeed('lch(50% 100% 0)')).toEqual(ingestSeed('lch(50 150 0)'))
    expect(ingestSeed('color(srgb 100% 0 0)')).toEqual(ingestSeed('color(srgb 1 0 0)'))
    expect(ingestSeed('rgb(50% 0 0)')).toEqual(ingestSeed('rgb(127.5 0 0)'))
    expect(ingestSeed('hsl(120 100% 50%)')).toEqual(ingestSeed('rgb(0 255 0)'))
    expect(ingestSeed('rgb(0 0 0 / 100%)')).toEqual(ingestSeed('rgb(0 0 0)'))
    expect(ingestSeed('oklch(50% 0.1 250deg)')).toEqual(ingestSeed('oklch(0.5 0.1 250)'))
    expect(ingestSeed('lch(50 40 200deg)')).toEqual(ingestSeed('lch(50 40 200)'))
    expect(ingestSeed('hsl(120deg 100% 50%)')).toEqual(ingestSeed('hsl(120 100% 50%)'))
  })

  // Quality-review finding B, elected for fix by Cédric at GATE 2. The
  // tokeniser split and trimmed on JavaScript's `\s`, which is WIDER than CSS's own
  // `<whitespace-token>` set: it also matches U+00A0 and the other Unicode space separators. So an
  // invisible non-CSS space acted as a channel separator, and `lab(50<NBSP>20 30)` was silently
  // accepted as the colour `lab(50 20 30)` rather than refused. The realistic source is a value
  // pasted out of a word processor or a PDF brand sheet. Escapes are written explicitly below
  // rather than as literal characters, so the cases stay greppable and cannot be lost to an
  // editor's cleanup.
  it.each([
    ['NBSP acting as a separator between two whole channels', 'lab(50\u{A0}20 30)'],
    ['NBSP splitting one channel in two', 'lab(5\u{A0}0 20 30)'],
    ['NBSP padding the first channel', 'lab(\u{A0}50 20 30)'],
    ['NBSP inside an rgb() channel', 'rgb(0\u{A0}0 0)'],
    ['NBSP inside an oklch() channel', 'oklch(0.5\u{A0}0.1 250)'],
    ['thin space (U+2009) as a separator', 'lab(50\u{2009}20 30)'],
    ['ideographic space (U+3000) as a separator', 'lab(50\u{3000}20 30)'],
    ['NBSP in a comma-separated legacy channel', 'rgb(1,\u{A0}2, 3)'],
  ] as const)(
    'a space character CSS does not tokenise on (%s) is refused, never silently read as a separator or trimmed away',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
    },
  )

  it('a non-CSS space in the alpha slot refuses as an unreadable alpha, never as non-opaque-alpha', () => {
    const refusal = refusalFor('rgb(0 0 0 /\u{A0}1)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.refusalClass).not.toBe('non-opaque-alpha')
    expect(refusal.message).toMatch(/alpha channel could not be read as a number/)
  })

  it('every space character CSS DOES tokenise on still separates channels, so the narrowing did not over-tighten', () => {
    const reference = ingestSeed('lab(50 20 30)')
    expect(ingestSeed('lab(50\t20\t30)')).toEqual(reference)
    expect(ingestSeed('lab(50\n20\n30)')).toEqual(reference)
    expect(ingestSeed('lab(50\r20\r30)')).toEqual(reference)
    expect(ingestSeed('lab(50\f20\f30)')).toEqual(reference)
    expect(ingestSeed('lab(  50   20   30  )')).toEqual(reference)
    expect(ingestSeed('rgb(1, 2, 3)')).toEqual(ingestSeed('rgb(1 2 3)'))
    expect(ingestSeed('rgb(0 0 0 / 1)')).toEqual(ingestSeed('rgb(0 0 0)'))
  })

  // Carve-out from that review, found during final quality-review
  // verification: `readNumericToken` converted with JavaScript's `Number()`, whose numeral grammar
  // is a superset of CSS's <number>. A hex-integer literal is not a valid CSS <number> outside the
  // hex COLOUR forms (which never reach this function), so `lab(0x10 20 30)` silently read as L=16
  // instead of refusing. Covers every channel and hue position across all seven accepted forms,
  // plus the shared alpha slot.
  it.each([
    ['lab(), L channel', 'lab(0x10 20 30)'],
    ['lab(), a channel', 'lab(50 0x10 30)'],
    ['lab(), b channel', 'lab(50 20 0x10)'],
    ['lch(), L channel', 'lch(0x10 30 40)'],
    ['lch(), C channel', 'lch(50 0x10 40)'],
    ['color(srgb …), r channel', 'color(srgb 0x10 0 0)'],
    ['color(srgb …), g channel', 'color(srgb 0 0x10 0)'],
    ['color(srgb …), b channel', 'color(srgb 0 0 0x10)'],
    ['color(display-p3 …), r channel', 'color(display-p3 0x10 0 0)'],
    ['color(display-p3 …), g channel', 'color(display-p3 0 0x10 0)'],
    ['color(display-p3 …), b channel', 'color(display-p3 0 0 0x10)'],
    ['rgb(), r channel', 'rgb(0x10 0 0)'],
    ['rgb(), g channel', 'rgb(0 0x10 0)'],
    ['rgb(), b channel', 'rgb(0 0 0x10)'],
    ['hsl(), s channel', 'hsl(120 0x10% 50%)'],
    ['hsl(), l channel', 'hsl(120 50% 0x10%)'],
    ['oklch(), lightness channel', 'oklch(0x10 0.1 250)'],
    ['oklch(), chroma channel', 'oklch(0.5 0x10 250)'],
    ['uppercase hex prefix (0X1F)', 'lab(0X1F 20 30)'],
  ] as const)(
    'a JS hex-integer literal channel token (%s) refuses at the channel-value act as an unreadable channel, never converts to a colour: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).toMatch(/could not be read as a number/)
    },
  )

  it.each([
    ['hue channel (lch)', 'lch(50 40 0x5)'],
    ['hue channel (oklch)', 'oklch(0.5 0.1 0x5)'],
    ['hue channel (hsl)', 'hsl(0x10 100% 50%)'],
  ] as const)(
    'a JS hex-integer literal hue token (%s) refuses at the channel-value act: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).toMatch(/could not be read as a number/)
    },
  )

  it('a JS hex-integer literal alpha token refuses as an unreadable channel value, never as a cleared opacity', () => {
    const refusal = refusalFor('lab(50 20 30 / 0x1)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.refusalClass).not.toBe('non-opaque-alpha')
    expect(refusal.message).toMatch(/alpha channel could not be read as a number/)
  })

  // A later review round's adversarial pass found that the corpus above is entirely
  // `0x`/`0X`, so it pins "a hex literal refuses" and not the CSS `<number>` grammar the fix
  // actually installs. Measured: replacing the `CSS_NUMBER` test with a hex-only blacklist
  // (`/^[+-]?0[xX]/`) leaves every `0x`/`0X` assertion above green while re-opening every shape
  // below. ECMA-262's `StrNumericLiteral` admits exactly five shapes CSS's `<number>` does
  // not; hex is one and these are the other four. `Infinity` is the one that never reached
  // `Number.isFinite`: `clamp01` launders it to 1 (or 0) BEFORE the finiteness check, so all four
  // clamping callers (`parseRgbChannel`, `parsePercent01`, `parseAlphaToken`, and `ingestOklch`'s
  // own percentage-lightness branch) read `rgb(Infinity 0 0)` as pure red.
  it.each([
    ['binary integer literal, lab() L', 'lab(0b101 20 30)'],
    ['uppercase binary prefix, rgb() r', 'rgb(0B11111111 0 0)'],
    ['octal integer literal, lch() C', 'lch(50 0o17 40)'],
    ['uppercase octal prefix, color(srgb …) r', 'color(srgb 0O1 0 0)'],
    ['trailing-dot literal, rgb() r', 'rgb(1. 2 3)'],
    ['trailing-dot exponent literal, lab() L', 'lab(1.e2 20 30)'],
    ['trailing dot inside a percentage, hsl() s', 'hsl(120 50.% 50%)'],
    ['Infinity, rgb() r (clamp01 laundered it past Number.isFinite)', 'rgb(Infinity 0 0)'],
    ['Infinity inside a percentage, hsl() s', 'hsl(120 Infinity% 50%)'],
    ['Infinity in an rgb() percentage channel', 'rgb(Infinity% 0 0)'],
    ['Infinity in oklch() percentage lightness', 'oklch(Infinity% 0.1 250)'],
  ] as const)(
    'a JS numeral CSS <number> does not admit (%s) refuses at the channel-value act, never converts to a colour: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).toMatch(/could not be read as a number/)
    },
  )

  it.each([
    ['Infinity', 'rgb(0 0 0 / Infinity)'],
    ['signed Infinity (pre-fix: refused, but as non-opaque-alpha)', 'lab(50 20 30 / -Infinity)'],
    ['binary integer literal', 'lab(50 20 30 / 0b1)'],
    ['trailing-dot literal', 'lab(50 20 30 / 1.)'],
    ['Infinity as a percentage alpha', 'rgb(0 0 0 / Infinity%)'],
  ] as const)(
    'a non-CSS numeral alpha token (%s) refuses as an unreadable channel value, never as a cleared opacity: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.refusalClass).not.toBe('non-opaque-alpha')
      expect(refusal.message).toMatch(/alpha channel could not be read as a number/)
    },
  )

  it('a valid CSS exponent form is unaffected by the hex-literal refusal and still converts', () => {
    expect(ingestSeed('lab(1e1 20 30)')).toEqual(ingestSeed('lab(10 20 30)'))
    expect(() => ingestSeed('lab(1e5 20 30)')).not.toThrow()
  })

  // `splitChannelArgs`'s whitespace tokeniser did not track parenthesis
  // depth, so a function call inside a channel slot (calc() is refused as a channel value below,
  // but nothing stops another nested function reaching the same splitter) read as multiple
  // tokens — `calc(60 + 60)` split into `calc(60`, `+`, `60)`, three extra tokens, so a
  // three-channel seed was refused with a FALSE "needs three channels and this has 5" instead of
  // naming the actual problem (the calc() itself cannot be read as a number). A paren-depth-aware
  // split keeps the nested call as one token, so the channel count is correct and the refusal
  // reaches the true cause via the channel-value act.
  it.each([
    ['hsl(), two-token calc() with a space', 'hsl(calc(60 + 60) 50% 50%)'],
    ['rgb(), two-token calc() with a space', 'rgb(calc(10 * 2) 0 0)'],
    ['oklch(), calc() in the lightness channel', 'oklch(calc(0.2 + 0.3) 0.1 250)'],
    ['color(srgb …), calc() in a channel', 'color(srgb calc(0.5 + 0.5) 0 0)'],
    ['lab(), calc() in the L channel', 'lab(calc(25 + 25) 20 30)'],
  ] as const)(
    'a calc() channel token (%s) refuses at the channel-value act, naming the unreadable channel, never a wrong channel COUNT: %s',
    (_label, input) => {
      const refusal = refusalFor(input)
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).not.toMatch(/needs three channels/)
      expect(refusal.message).toMatch(/could not be read as a number/)
    },
  )

  it('a calc() spanning the alpha slash still refuses as an unreadable channel, not a spuriously reparsed alpha', () => {
    const refusal = refusalFor('hsl(calc(60 / 2) 50% 50%)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).not.toMatch(/needs three channels/)
    expect(refusal.message).toMatch(/could not be read as a number/)
  })

  it('a comma-separated legacy channel list with a nested calc() still splits into exactly three channels', () => {
    const refusal = refusalFor('rgb(calc(10 + 10), 0, 0)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).not.toMatch(/needs three channels/)
  })

  // Row A (a fix-review): `lastTopLevelSlashIndex` iterated `[...text].entries()`,
  // which yields CODE-POINT indices, while `splitChannelArgs` then slices the same string with
  // UTF-16 `String.prototype.slice`. A non-BMP character (here an emoji) before the alpha slash
  // shifted the slice boundary by one UTF-16 unit, so the alpha slot was sliced wrong and read as
  // NaN instead of the real value. Nothing else in this file exercises a non-BMP character
  // anywhere near the alpha slash, so this property was otherwise unpinned.
  it('a non-BMP character before the alpha slash does not shift the alpha split (code-point vs UTF-16 index)', () => {
    const { alpha } = splitChannelArgs('60 50%\u{1F600} 50% / 1')
    expect(alpha).toBe(1)
  })

  it('end to end, the same non-BMP input refuses naming the unreadable CHANNEL, never the alpha channel', () => {
    const refusal = refusalFor('hsl(60 50%\u{1F600} 50% / 1)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).not.toMatch(/alpha channel/)
    expect(refusal.message).toMatch(/could not be read as a number/)
  })

  // Row B: the comma branch's own paren-depth awareness. `splitTopLevel` is called twice — once
  // for the alpha slash, once for the comma/whitespace split — and only the calc()-in-whitespace
  // shape above is pinned elsewhere in this file. A mutant that strips depth tracking from the
  // comma-mode call alone still passes every calc() test above (none of them is comma-separated
  // with more than one nested function argument) but mis-splits this one.
  it('a comma-separated channel list with a nested function call carrying its own commas still splits into exactly three parts', () => {
    const { parts } = splitChannelArgs('color-mix(in srgb, red, blue), 3, 4')
    expect(parts).toHaveLength(3)
  })

  it('end to end, that same nested-comma input refuses at the channel-value act naming the unreadable channel, never a wrong channel count', () => {
    const refusal = refusalFor('rgb(color-mix(in srgb, red, blue), 3, 4)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).not.toMatch(/needs three channels/)
    expect(refusal.message).toMatch(/could not be read as a number/)
  })

  // Row C: the `Math.max(0, depth - 1)` clamp in `splitTopLevel`. Without the floor, a stray
  // leading `)` (already below depth 0) would subtract one from a LATER, well-formed function's
  // depth tracking and silently un-nest it. Every other paren-depth test in this file opens with
  // a balanced or over-open string; this is the only one that opens already unbalanced closed.
  it('a stray leading close-paren does not un-nest a later well-formed function call (the depth floor)', () => {
    const { parts } = splitChannelArgs(') calc(1 2) 3')
    expect(parts).toEqual([')', 'calc(1 2)', '3'])
  })

  // The OTHER `Math.max(0, depth - 1)` clamp, in `lastTopLevelSlashIndex` (a separate depth
  // counter from `splitTopLevel`'s own). Row C's probe string carries no `/` at all, so it never
  // exercises this second copy: without this floor, a stray leading `)` would go negative and
  // blind the slash finder to a later top-level `/`, silently dropping the alpha value instead of
  // reading it.
  it('a stray leading close-paren does not blind the slash finder to a later top-level slash (the OTHER depth floor, in lastTopLevelSlashIndex)', () => {
    const { alpha, parts } = splitChannelArgs(') 1 2 / 3')
    expect(alpha).toBe(1)
    expect(parts).toEqual([')', '1', '2'])
  })

  // Row D: the alpha-slash edges. All three are correct at HEAD already; none is pinned
  // elsewhere in this file.
  it('a trailing alpha slash with nothing after it refuses naming the alpha channel as unreadable', () => {
    const refusal = refusalFor('rgb(1 2 3 /)')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).toMatch(/alpha channel could not be read as a number/)
  })

  it('a calc() alpha value containing its own top-level-looking slash still refuses naming the alpha channel, the nested slash is not treated as a second separator', () => {
    const refusal = refusalFor('rgb(1 2 3 / calc(1/2))')
    expect(refusal.act).toBe('channel-value')
    expect(refusal.message).toMatch(/alpha channel could not be read as a number/)
  })

  it('with two top-level slashes, the LAST one is treated as the alpha boundary', () => {
    const refusal = refusalFor('hsl(60 50% 50% / 1 / 2)')
    expect(refusal.act).toBe('channel-value')
  })

  // Row E: unbalanced parens never reach an accept.
  it('a channel list with an unbalanced trailing close-paren keeps the stray paren attached to the last token, rather than throwing or silently dropping it', () => {
    const { parts } = splitChannelArgs('1, 2, 3)')
    expect(parts).toEqual(['1', '2', '3)'])
  })

  it('a channel list missing a closing paren for a nested calc() refuses, never reads as valid', () => {
    expect(() => ingestSeed('rgb(calc(10 * 2 0 0)')).toThrow(SeedIngestRefusal)
  })

  it('an all-comma, no-content channel list refuses, never reads as valid', () => {
    expect(() => ingestSeed('rgb(,,)')).toThrow(SeedIngestRefusal)
  })
})

describe('AC-token-build-22 covers: R22', () => {
  it('non-opaque alpha: names the alpha CHANNEL and its resolved numeric value, never the hex WIDTH, and never offers compositing as a fix', () => {
    const refusal = refusalFor(NON_OPAQUE_ALPHA_INPUT)
    expect(refusal.refusalClass).toBe('non-opaque-alpha')
    expect(refusal.message.toLowerCase()).toMatch(/alpha channel/)
    // 0xfe / 255 = 0.99607..., the resolved numeric value must be named
    expect(refusal.message).toMatch(/0\.99\d/)
    // Must not read as an "8-digit hex is not accepted" style refusal: R5's own accepted
    // list names 8-digit hex as a form, and an exactly-opaque instance passes (below).
    expect(refusal.message.toLowerCase()).not.toMatch(/8-digit hex/)
    expect(refusal.message.toLowerCase()).not.toMatch(/hex width|width of the hex/)
    // Must not offer compositing the alpha away as a fix.
    expect(refusal.message.toLowerCase()).not.toMatch(/composit/)
  })

  it('a 4-digit hex with exactly opaque alpha (f, doubled to ff) is ACCEPTED, never refused', () => {
    expect(() => ingestSeed('#abcf')).not.toThrow()
  })

  it('an 8-digit hex with exactly opaque alpha (ff) is ACCEPTED, never refused', () => {
    expect(() => ingestSeed('#aabbccff')).not.toThrow()
  })

  it('a non-opaque rgb()/hsl() alpha (the "/ a" suffix) is refused the same way as hex, naming the channel and its value', () => {
    const fromRgb = refusalFor('rgb(170 187 204 / 0.5)')
    expect(fromRgb.refusalClass).toBe('non-opaque-alpha')
    expect(fromRgb.message).toMatch(/0\.5/)
  })

  it('context-dependent form: may name the browser-time mechanism but never an artifact, and never says Nave does not support relative colour syntax', () => {
    const refusal = refusalFor(CONTEXT_DEPENDENT_INPUT)
    expect(refusal.refusalClass).toBe('context-dependent-form')
    expect(refusal.message.toLowerCase()).not.toMatch(/does not support relative colour syntax/)
    expect(refusal.message.toLowerCase()).not.toMatch(/nave does not support/)
    // No artifact (a filename/path) named.
    expect(refusal.message).not.toMatch(/tokens\.css|tokens\.presets|dist\/|\.json/i)
  })

  it('relative colour syntax refusal specifically never says Nave lacks support for it — G1 R10 centres it in the emitted artifact', () => {
    const refusal = refusalFor(RELATIVE_COLOUR_SYNTAX_INPUT)
    expect(refusal.message.toLowerCase()).not.toMatch(/does not support relative colour syntax/)
    expect(refusal.message).not.toMatch(/tokens\.css|tokens\.presets|dist\//i)
  })

  it('named colour: does not imply the input is malformed, and does not name a substitute value', () => {
    const refusal = refusalFor(NAMED_COLOUR_INPUT)
    expect(refusal.refusalClass).toBe('named-colour')
    expect(refusal.message.toLowerCase()).not.toMatch(/invalid|malformed|not valid css|not valid/)
    // No substitute value (a hex or oklch() literal standing in for "tomato") is offered.
    expect(refusal.message).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(refusal.message).not.toMatch(/oklch\(\s*[\d.]/i)
  })

  it('every refusal message states the correct fix and pointer VERBATIM — a hand-authored copy of the expected wording, so a copy edit to the shipped constant is caught, not merely its wiring into the message', () => {
    // Hand-typed, not imported: comparing against the source's OWN constant would only prove
    // the constructor concatenates `params.fix` into the message, never that the wording is
    // still what it should be. Includes CHANNEL_VALUE_FIX (rgb(1 2)), which the wiring-only
    // version never exercised because none of its four representative inputs reaches
    // `badChannelValue`.
    const acceptedFormPointer =
      'Accepted seed forms: hex (3, 4, 6 or 8 digit), rgb(), hsl(), oklch(), lab(), lch(), color() (srgb, display-p3).'
    for (const [input, expectedFix] of [
      [
        NON_OPAQUE_ALPHA_INPUT,
        "write the seed's alpha channel as fully opaque: drop the alpha channel entirely, or set it to 1 / 100% / an opaque hex pair (f / ff).",
      ],
      [
        CONTEXT_DEPENDENT_INPUT,
        'replace this seed with a literal colour value the build can resolve on its own, with no reference to a custom property, the current colour, or another declaration.',
      ],
      [
        NAMED_COLOUR_INPUT,
        'write the seed in one of the accepted forms below, never a CSS named colour.',
      ],
      [UNRECOGNISED_FORM_INPUT, 'write the seed in one of the accepted forms below.'],
      [
        'rgb(1 2)',
        'write every channel of this seed as a literal number or percentage, with no missing channel.',
      ],
    ] as const) {
      const refusal = refusalFor(input)
      expect(refusal.message).toContain(expectedFix)
      expect(refusal.message.endsWith(acceptedFormPointer)).toBe(true)
    }
  })

  it('an unreadable alpha is not filed as non-opaque-alpha, whose message contract requires a resolved numeric value', () => {
    const unreadable = refusalFor('rgb(0 0 0 / abc)')
    expect(unreadable.act).toBe('channel-value')
    expect(unreadable.refusalClass).not.toBe('non-opaque-alpha')
    expect(refusalFor(NON_OPAQUE_ALPHA_INPUT).message).toMatch(/0\.99\d/)
  })
})

describe('AC-token-build-23 covers: R23', () => {
  it('a refusal in any of the four classes is a THROWN error, never a silent ok:false result a caller could ignore', () => {
    for (const input of [
      NON_OPAQUE_ALPHA_INPUT,
      CONTEXT_DEPENDENT_INPUT,
      NAMED_COLOUR_INPUT,
      UNRECOGNISED_FORM_INPUT,
    ]) {
      expect(() => ingestSeed(input)).toThrow(SeedIngestRefusal)
    }
  })

  it('the ingest modules perform no filesystem, process or console I/O of any kind (a refusal can therefore never itself write an artifact or print to a channel)', () => {
    const dir = path.resolve(import.meta.dirname, '../../src/theming')
    // Walks seed-ingest.ts's OWN import graph instead of guessing by filename, so a rename or
    // a split into a differently-named sibling is still picked up (a `seed-` prefix filter
    // over `readdirSync` would miss it). Stops at `consumer-build.ts`: that is the
    // deliberately separate downstream build step a refusal never reaches (verified by the
    // spy test below), not part of the ingest surface's own no-I/O claim, and it pulls in
    // modules (e.g. `core-contract.ts`) that do real file I/O for unrelated build steps.
    const sources = new Map<string, string>()
    const queue = ['seed-ingest.ts']
    while (queue.length > 0) {
      const file = queue.pop()!
      if (file === 'consumer-build.ts' || sources.has(file)) continue
      const source = readFileSync(path.join(dir, file), 'utf8')
      sources.set(file, source)
      for (const match of source.matchAll(/from\s+['"]\.\/([\w-]+)\.ts['"]/g)) {
        queue.push(`${match[1]}.ts`)
      }
    }
    expect(sources.size).toBeGreaterThanOrEqual(4)
    for (const name of [
      'seed-ingest.ts',
      'seed-form-parsers.ts',
      'seed-refusal.ts',
      'css-named-colours.ts',
    ]) {
      expect(sources.has(name)).toBe(true)
    }
    for (const source of sources.values()) {
      expect(codeOnly(source)).not.toMatch(PURITY_RE)
    }
  })

  /**
   * ROW `R3-01` (Phase 3 verifier-gated tail). This guard carried its
   * OWN copy of the block-comment stripper that an earlier review diagnosed and round 2 fixed
   * six lines over, in `consumer-build.test.ts`; both copies have since been hoisted into the
   * shared `code-only.ts`, which is still-open row 1 and Cédric's GATE-2 decision. Unanchored, the
   * block-comment pattern treats a `/*` opened inside a STRING LITERAL as a comment opener and
   * deletes everything up to the next closer, code included — so a guard can be blind to the very
   * constructs it exists to forbid.
   *
   * The fixture is `comment-open-tracker.ts`, a real package source that opens `/*` inside a
   * string literal (`line.startsWith('/*', cursor)`), which is the construct rather than a
   * synthetic stand-in. It is deliberately NOT asserted to be in this guard's own reachable
   * set, because it is not: the walk above stops at `consumer-build.ts` by design, and that
   * stop is the only path to it. The blindness here is therefore LATENT, which is why this
   * is 🟡 and why the row exercises the STRIPPER — the subject of that diagnosis — rather than
   * claiming a live hole this guard does not have.
   */
  it('row R3-01: the purity guard strips COMMENTS, never code following a /* opened inside a string literal', () => {
    const tracker = readFileSync(
      path.resolve(import.meta.dirname, '../../src/theming/comment-open-tracker.ts'),
      'utf8',
    )
    // The fixture is what it claims: without this, the assertion below could pass on a file
    // that simply never exercises the construct.
    expect(tracker).toContain("line.startsWith('/*', cursor)")
    expect(tracker).toContain('isInsideAnOpenComment = true')

    expect(codeOnly(tracker)).toContain('isInsideAnOpenComment = true')
  })

  it('a refusal on the primary seed never invokes composeConsumerBuild', async () => {
    const invoked: string[] = []
    vi.resetModules()
    vi.doMock('../../src/theming/consumer-build.ts', async () => {
      const actual: Record<string, unknown> = await vi.importActual(
        '../../src/theming/consumer-build.ts',
      )
      return {
        ...actual,
        composeConsumerBuild: (...args: [unknown]) => {
          invoked.push('composeConsumerBuild')
          return (actual.composeConsumerBuild as (...a: [unknown]) => unknown)(...args)
        },
      }
    })
    const seedIngest = await import('../../src/theming/seed-ingest.ts')
    expect(() =>
      seedIngest.composeConsumerBuildFromRawSeeds({
        seeds: { primary: UNRECOGNISED_FORM_INPUT, danger: '#ed4161', declaredTintHue: 15 },
      }),
    ).toThrow(seedIngest.SeedIngestRefusal)
    expect(invoked).toEqual([])
    vi.resetModules()
    vi.doUnmock('../../src/theming/consumer-build.ts')
  })

  it('a valid raw seed pair DOES reach composeConsumerBuild and produces the same output as the already-ingested form (the wrapper is not a no-op)', async () => {
    const { composeConsumerBuildFromRawSeeds } = await import('../../src/theming/seed-ingest.ts')
    const { composeConsumerBuild } = await import('../../src/theming/consumer-build.ts')
    const viaRaw = composeConsumerBuildFromRawSeeds({
      seeds: { primary: '#27d4c6', danger: '#ed4161', declaredTintHue: 186.17 },
    })
    const viaOklch = composeConsumerBuild({
      seeds: {
        primary: srgbToOklch({ r: 0x27 / 255, g: 0xd4 / 255, b: 0xc6 / 255 }),
        danger: srgbToOklch({ r: 0xed / 255, g: 0x41 / 255, b: 0x61 / 255 }),
        declaredTintHue: 186.17,
      },
    })
    expect(viaRaw.css).toBe(viaOklch.css)
  })

  it('a channel-level reference or an unreadable channel inside an ACCEPTED form is refused, never converted to NaN', () => {
    expect(refusalFor('rgb(var(--r) 0 0)').refusalClass).toBe('context-dependent-form')
    expect(refusalFor('oklch(0.7 0.12 var(--brand-hue))').refusalClass).toBe(
      'context-dependent-form',
    )
    expect(refusalFor('rgb(foo bar baz)').act).toBe('channel-value')
    expect(refusalFor('rgb(0 0 0 / abc)').act).toBe('channel-value')
    expect(refusalFor('rgb(1 2)').act).toBe('channel-value')
    expect(refusalFor('rgb(1 2)').message).not.toMatch(/rgb\(\) is not one of/i)
  })

  it('a surplus channel token is refused, never silently discarded', () => {
    expect(refusalFor('rgb(255 0 0 0.5)').act).toBe('channel-value')
    expect(() => ingestSeed('rgb(39 212 198)')).not.toThrow()
    expect(() => ingestSeed('rgb(39, 212, 198)')).not.toThrow()
    expect(() => ingestSeed('oklch(78.59% 0.1316 186.17)')).not.toThrow()
  })
})

describe('ingestSeed: accepted forms convert correctly (hex, rgb(), hsl(), oklch()) — supporting infrastructure for AC-21/22/23, not an R19/R20 claim', () => {
  it('6-digit hex converts via the already-verified srgbToOklch (color-math.test.ts)', () => {
    const expected = srgbToOklch({ r: 0x27 / 255, g: 0xd4 / 255, b: 0xc6 / 255 })
    const actual = ingestSeed('#27d4c6')
    expect(actual.l).toBeCloseTo(expected.l, 10)
    expect(actual.c).toBeCloseTo(expected.c, 10)
    expect(actual.h).toBeCloseTo(expected.h, 10)
  })

  it('3-digit hex shorthand doubles each digit before conversion', () => {
    const expected = srgbToOklch({ r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 })
    const actual = ingestSeed('#123')
    expect(actual.l).toBeCloseTo(expected.l, 10)
    expect(actual.c).toBeCloseTo(expected.c, 10)
  })

  it('rgb() with space syntax converts identically to the equivalent hex', () => {
    const fromRgb = ingestSeed('rgb(39 212 198)')
    const fromHex = ingestSeed('#27d4c6')
    expect(fromRgb.l).toBeCloseTo(fromHex.l, 6)
    expect(fromRgb.c).toBeCloseTo(fromHex.c, 6)
    expect(fromRgb.h).toBeCloseTo(fromHex.h, 6)
  })

  it('rgb() with legacy comma syntax converts identically to space syntax', () => {
    const a = ingestSeed('rgb(39, 212, 198)')
    const b = ingestSeed('rgb(39 212 198)')
    expect(a).toEqual(b)
  })

  it('oklch() round-trips as the identity (already the internal form)', () => {
    const seed = ingestSeed('oklch(78.59% 0.1316 186.17)')
    expect(seed.l).toBeCloseTo(0.7859, 4)
    expect(seed.c).toBeCloseTo(0.1316, 4)
    expect(seed.h).toBeCloseTo(186.17, 2)
  })

  it('hsl() red (0, 100%, 50%) converts to the same OKLCH as rgb(255 0 0)', () => {
    const fromHsl = ingestSeed('hsl(0 100% 50%)')
    const fromRgb = ingestSeed('rgb(255 0 0)')
    expect(fromHsl.l).toBeCloseTo(fromRgb.l, 6)
    expect(fromHsl.c).toBeCloseTo(fromRgb.c, 6)
    expect(fromHsl.h).toBeCloseTo(fromRgb.h, 6)
  })

  it('hsl() green (120, 100%, 50%) converts to the same OKLCH as rgb(0 255 0)', () => {
    const fromHsl = ingestSeed('hsl(120 100% 50%)')
    const fromRgb = ingestSeed('rgb(0 255 0)')
    expect(fromHsl.l).toBeCloseTo(fromRgb.l, 6)
    expect(fromHsl.c).toBeCloseTo(fromRgb.c, 6)
    expect(fromHsl.h).toBeCloseTo(fromRgb.h, 6)
  })

  it('a grey given as hex or rgb() converts to EXACTLY zero chroma, the same as an oklch() seed that says so directly — no residual, no phantom hue', () => {
    for (const input of ['#808080', 'rgb(128 128 128)', 'hsl(0 0% 50%)']) {
      const seed = ingestSeed(input)
      expect(seed.c).toBe(0)
      expect(seed.h).toBe(0)
    }
  })
})

describe("lab(), lch() and color() are ingested, and a color() in a colour space this build does not convert is refused by NAME within R21's four classes (the conversions themselves are R19's, css-color-4-vectors.test.ts)", () => {
  it.each([
    'lab(29% 39 20)',
    'lch(52% 74 26)',
    'color(srgb 0.5 0.5 0.5)',
    'color(display-p3 0.5 0.5 0.5)',
  ])('%s converts to a finite OKLCH triple rather than throwing', (input) => {
    const seed = ingestSeed(input)
    expect(Number.isFinite(seed.l) && Number.isFinite(seed.c) && Number.isFinite(seed.h)).toBe(true)
  })

  it('color(srgb …) takes the same path as rgb(): color(srgb 1 0 0) and rgb(255 0 0) are one colour', () => {
    const fromColor = ingestSeed('color(srgb 1 0 0)')
    const fromRgb = ingestSeed('rgb(255 0 0)')
    expect(fromColor.l).toBeCloseTo(fromRgb.l, 10)
    expect(fromColor.c).toBeCloseTo(fromRgb.c, 10)
    expect(fromColor.h).toBeCloseTo(fromRgb.h, 10)
  })

  it.each(['rec2020', 'a98-rgb', 'prophoto-rgb', 'srgb-linear', 'xyz', 'xyz-d50', 'xyz-d65'])(
    'color(%s …) is refused at the channel-value act, naming the space and the two this build converts, never misread as srgb and never filed as an unrecognised FORM',
    (space) => {
      const refusal = refusalFor(`color(${space} 0.2 0.4 0.6)`)
      expect(refusal.refusalClass).toBe('unrecognised-form')
      expect(refusal.act).toBe('channel-value')
      expect(refusal.message).toContain(`\`${space}\``)
      expect(refusal.message).toMatch(/`srgb` and `display-p3`/)
      expect(refusal.message).toMatch(/`color\(\)` is an accepted seed form/)
    },
  )

  it('a color() with a missing or surplus channel, or an unreadable one, is refused as a channel value like every other accepted form', () => {
    expect(refusalFor('color(srgb 0.1 0.2)').act).toBe('channel-value')
    expect(refusalFor('color(srgb 0.1 0.2 0.3 0.4)').act).toBe('channel-value')
    expect(refusalFor('color(srgb 0.1 foo 0.3)').act).toBe('channel-value')
    expect(refusalFor('color()').act).toBe('channel-value')
  })

  it('a non-opaque alpha on lab(), lch() or color() is refused as non-opaque-alpha, exactly as on the direct-path forms', () => {
    for (const input of [
      'lab(50 20 30 / 0.5)',
      'lch(50 40 200 / 50%)',
      'color(display-p3 0 1 0 / 0.9)',
    ]) {
      expect(refusalFor(input).refusalClass).toBe('non-opaque-alpha')
    }
  })
})

describe('oklch()/lab()/lch() lightness and chroma channels outside their range are CLAMPED AT PARSE, exactly as CSS Color 4 does, never refused', () => {
  // CSS Color 4 §9.4 (oklch()), verbatim: lightness "values less than 0% or 0.0 must be
  // clamped to 0% at parsed-value time; values greater than 100% or 1.0 are clamped to 100%
  // at parsed-value time", and chroma "if the provided value is negative, it is clamped to 0
  // at parsed-value time". §9.3 states the same two rules for lab()/lch() lightness on their
  // own [0, 100] / [0%, 100%] scale, and for lch() chroma.
  it('a lightness above 1 (number form) is clamped to 1, not refused', () => {
    expect(ingestSeed('oklch(1.5 0.1 200)')).toEqual({ c: 0.1, h: 200, l: 1 })
  })

  it('a lightness above 100% (percentage form) is ALSO clamped to 1', () => {
    expect(ingestSeed('oklch(150% 0.1 200)').l).toBe(1)
  })

  it('a lightness below 0 (number form) is clamped to 0', () => {
    expect(ingestSeed('oklch(-0.5 0.1 200)').l).toBe(0)
  })

  it('a negative chroma (number form) is clamped to 0', () => {
    expect(ingestSeed('oklch(0.5 -0.1 200)').c).toBe(0)
  })

  it('a negative chroma (percentage form) is ALSO clamped to 0', () => {
    expect(ingestSeed('oklch(0.5 -10% 200)').c).toBe(0)
  })

  it('lab() lightness above 100 is clamped to 100, matching a seed authored at the boundary', () => {
    expect(ingestSeed('lab(150 0 0)')).toEqual(ingestSeed('lab(100 0 0)'))
  })

  it('lab() lightness below 0 is clamped to 0, matching a seed authored at the boundary', () => {
    expect(ingestSeed('lab(-10 0 0)')).toEqual(ingestSeed('lab(0 0 0)'))
  })

  it('lch() chroma below 0 is clamped to 0 (at HEAD before this fix it produced c: 0.0293, a teal)', () => {
    expect(ingestSeed('lch(50 -10 0)').c).toBe(0)
  })

  it('an in-range oklch() at the exact boundaries (L = 0, L = 1, C = 0) is accepted, not refused', () => {
    expect(() => ingestSeed('oklch(0 0 200)')).not.toThrow()
    expect(() => ingestSeed('oklch(1 0 200)')).not.toThrow()
  })
})

describe("a colour on its own space's neutral axis converts to EXACTLY zero chroma in every accepted form", () => {
  // Mirrors `color-math.test.ts`'s "an sRGB grey given DIRECTLY... also converts to EXACTLY
  // zero chroma" for the three forms that do not take the direct sRGB path: lab(), lch() and
  // color(display-p3 ...). At HEAD before this fix, each left a residual chroma around 1e-16
  // and an arbitrary hue (lch(): c ~3e-16, h 180; lab(): h 189.46; display-p3: h 189.46)
  // instead of hitting the achromatic branch predicate (`AC-theming-52`).
  it.each([
    ['lch(50 0 0)', 0],
    ['lab(50 0 0)', 0],
    ['color(display-p3 0.5 0.5 0.5)', 0],
    ['lch(50 -10 0)', 0],
  ])('ingestSeed(%s) resolves to exactly zero chroma and hue', (input, expectedHue) => {
    const seed = ingestSeed(input)
    expect(seed.c).toBe(0)
    expect(seed.h).toBe(expectedHue)
  })
})

describe("a hue channel accepts CSS's other three <angle> units and `none`, converted to degrees", () => {
  it.each([
    ['0.5turn', 180],
    ['3.141592653589793rad', 180],
    ['200grad', 180],
    ['180deg', 180],
    ['180', 180],
    ['none', 0],
  ])('oklch(0.5 0.1 %s) resolves to hue %d degrees', (hueToken, expectedHue) => {
    const seed = ingestSeed(`oklch(0.5 0.1 ${hueToken})`)
    expect(seed.h).toBeCloseTo(expectedHue, 6)
  })

  it('hsl() also accepts an angle-unit hue (the tokenising is shared)', () => {
    const fromTurn = ingestSeed('hsl(0.5turn 100% 50%)')
    const fromDeg = ingestSeed('hsl(180 100% 50%)')
    expect(fromTurn).toEqual(fromDeg)
  })

  it("`none` is accepted for the lightness or chroma channel too, resolving to 0 (CSS Color 4's direct-use value for a missing component)", () => {
    expect(ingestSeed('oklch(0.5 none 200)')).toEqual({ c: 0, h: 200, l: 0.5 })
    const lNone = ingestSeed('oklch(none 0.1 200)')
    expect(lNone.l).toBe(0)
  })

  it("`none` is accepted for rgb()'s and hsl()'s own channels too, in modern space-separated syntax", () => {
    expect(ingestSeed('rgb(none 0 0)')).toEqual({ c: 0, h: 0, l: 0 })
    expect(ingestSeed('hsl(none 0% 50%)')).toEqual(ingestSeed('hsl(0 0% 50%)'))
  })

  it('case-insensitivity pins: an uppercase angle unit and an uppercase `none` both resolve exactly as their lowercase spelling', () => {
    expect(ingestSeed('oklch(0.5 0.1 0.5TURN)').h).toBeCloseTo(180, 6)
    expect(ingestSeed('oklch(0.5 NONE 200)').c).toBe(0)
  })
})

describe('`none` is accepted ONLY as a whole channel token, and ONLY in modern (space-separated) syntax', () => {
  // CSS Color 4 §4.1.2: legacy comma syntax does not allow `none`; a `%` or unit suffix
  // glued onto `none` (`none%`, `nonedeg`, `noneturn`) is not the `none` keyword at all, it is
  // an unreadable token — no CSS grammar production matches it. At HEAD before this fix,
  // `readNumericToken` mapped `none` to 0 AFTER a `%` or unit had already been stripped from
  // the token, so every row below built silently instead of refusing.
  it.each([
    'oklch(none% 0.1 200)',
    'oklch(0.5 0.1 nonedeg)',
    'oklch(0.5 0.1 noneturn)',
    'rgb(none, 0, 0)',
    'hsl(none, 0%, 50%)',
  ])('%s is refused with the existing malformed-channel-value refusal', (input) => {
    const refusal = refusalFor(input)
    expect(refusal.act).toBe('channel-value')
  })

  it.each([
    'rgb(none 0 0)',
    'oklch(0.5 none 200)',
    'oklch(none 0.1 200)',
    'hsl(none 0% 50%)',
    'oklch(0.5 0.1 none)',
  ])('%s stays accepted: `none` written as a whole channel token, in modern syntax', (input) => {
    expect(() => ingestSeed(input)).not.toThrow()
  })
})
