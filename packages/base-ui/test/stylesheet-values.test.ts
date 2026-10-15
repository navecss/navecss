import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import { COLOR_KEYWORDS } from './support/colors.ts'
import { expectedSheet, NEW_CLASSES_FEEDBACK } from './support/feedback-states.ts'
import { isFocusRingDeclaration, isThumbBarInset, isThumbRingDeclaration } from './support/focus.ts'
import { requiresInvalid, requiresInvalidGroup } from './support/selector.ts'
import {
  flatten,
  flattenRules,
  readStylesheet,
  resolveAgainst,
  splitSelectorList,
} from './support/stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './support/tokens.ts'
import { ADMITTED_FALLBACKS, valueViolations } from './support/value.ts'

const PREFIX = 'nave-base-ui-'
const tokens = new Set(declaredTokens(workspaceTokensCss()).keys())

const CONTROLS = new Set(
  [
    'button',
    'toggle',
    'input',
    'select-trigger',
    'checkbox',
    'radio',
    'switch',
    'number-field-group',
    'slider-track',
    'input-group',
    'combobox-trigger',
    'chip',
  ].map((name) => `${PREFIX}${name}`),
)

const BORDER_TOKENS = [
  'var(--nave-color-border-control)',
  'var(--nave-color-border-disabled)',
  'var(--nave-color-border-default)',
]

const planted = (rule: string): string => `${readStylesheet()}\n@layer components.nave { ${rule} }`

const unacceptedIn = (item: FlatDeclaration): string[] => {
  const isPlaceholder = item.selectors.some((selector) => selector.includes('::placeholder'))
  return valueViolations(item.value, { isPlaceholder, property: item.property, tokens }).map(
    (part) => `${item.owner} ${item.property}: ${part}`,
  )
}

/**
 * Every declaration whose value is none of the admitted forms.
 */
const unacceptedValues = (css: string): string[] =>
  flatten(css).flatMap((item) => unacceptedIn(item))

const fallbacksIn = (item: FlatDeclaration): string[] =>
  item.value
    .matchAll(/var\([^(),]*,[^()]*\)/g)
    .map((match) => match[0])
    .toArray()

/**
 * Whether a declaration sits in the active option's band: the `::before` of a highlighted option.
 */
const isActiveOptionBand = (item: FlatDeclaration): boolean =>
  item.owner === `${PREFIX}active-option` &&
  item.selectors.length === 2 &&
  item.selectors[1] === '&[data-highlighted]::before'

/**
 * Whether a declaration sits in a rule that owns the focus fallbacks: the ring on a Table T2 class,
 * the Slider thumb's focus rule, the two insets of the thumb's focus bar, and the active option's band. Admitted by the rule,
 * not by the class that holds it, so the same fallback elsewhere on those classes still reds.
 */
const isFallbackHome = (item: FlatDeclaration): boolean =>
  isFocusRingDeclaration(item) ||
  isThumbRingDeclaration(item) ||
  isThumbBarInset(item) ||
  isActiveOptionBand(item)

/**
 * The `var()` fallbacks outside the admitted two, and the admitted two outside their parts.
 */
const fallbackViolations = (css: string): string[] =>
  flatten(css).flatMap((item) =>
    fallbacksIn(item).flatMap((text) => {
      if (!ADMITTED_FALLBACKS.includes(text)) return [`${item.owner} ${text}`]
      return isFallbackHome(item) ? [] : [`${item.owner} ${text} outside its parts`]
    }),
  )

/**
 * Whether the declaration's whole nesting chain, resolved into full selectors, keys on the invalid
 * state in every alternative (on the input group, `[data-invalid]` with `:not([data-disabled])` is that
 * state): one alternative without it, a key only inside `:not()`, or a key on
 * an outer rule whose inner rule styles another element would let the paint reach a valid control.
 */
const isInvalidKey = (item: FlatDeclaration): boolean => {
  const [outermost = '', ...inner] = item.selectors
  let resolved = splitSelectorList(outermost)
  for (const list of inner) resolved = resolveAgainst(resolved, list)
  const isGroup = item.owner === `${PREFIX}input-group`
  return (
    resolved.length > 0 &&
    resolved.every(
      (selector) => requiresInvalid(selector) || (isGroup && requiresInvalidGroup(selector)),
    )
  )
}

/**
 * The colours a border value names: token reads, named and system colours, and hex or functional
 * forms. `transparent` and `currentColor` are returned too, for the caller to admit by name.
 */
const coloursIn = (value: string): string[] => {
  const tokenReads = value.match(/var\(--nave-color-[\w-]+\)/g) ?? []
  const rest = value.replaceAll(/var\([^()]*\)/g, ' ')
  const others = rest.match(/#[\da-f]{3,8}\b|[a-z][\w-]*(?=\()|[a-z][\w-]*/gi) ?? []
  return [...tokenReads, ...others.filter((word) => word.startsWith('#') || isColourWord(word))]
}

const isBorderOf = (item: FlatDeclaration): boolean =>
  CONTROLS.has(item.owner) && item.property.startsWith('border')

const isColourWord = (word: string): boolean =>
  COLOR_KEYWORDS.has(word.toLowerCase()) ||
  ['currentcolor', 'transparent'].includes(word.toLowerCase()) ||
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)$/i.test(word)

const isColourAllowed = (
  colour: string,
  item: FlatDeclaration,
  allowed: readonly string[],
): boolean =>
  ['currentcolor', 'transparent'].includes(colour.toLowerCase()) ||
  (colour === 'var(--nave-color-feedback-danger)' ? isInvalidKey(item) : allowed.includes(colour))

/**
 * The colour a control's `border*` takes, allowed only as AC-24 and AC-32 list them.
 */
const borderColourViolations = (css: string, allowed: readonly string[]): string[] =>
  flatten(css)
    .filter((item) => isBorderOf(item))
    .flatMap((item) =>
      coloursIn(item.value)
        .filter((colour) => !isColourAllowed(colour, item, allowed))
        .map((colour) => `${item.owner} ${item.property}: ${colour}`),
    )

const DANGER = 'var(--nave-color-feedback-danger)'

/**
 * `feedback.danger` anywhere but a control's `border*`: the colour marks an invalid control's
 * boundary and nothing else.
 */
const dangerElsewhere = (css: string): string[] =>
  flatten(css)
    .filter((item) => item.value.includes(DANGER) && !isBorderOf(item))
    .map((item) => `${item.owner} ${item.property} names feedback.danger outside a control border`)

/**
 * The literal `2px` outside a `var()` fallback, where it is not one of the places that own it: the
 * outline offset of `focusRing` and of the Slider rule, the Slider bar's two insets, and the active
 * option's `inset` and `border-radius` calculations.
 */
const literalTwoPixelViolations = (css: string): string[] =>
  flatten(css)
    .filter((item) => /(?<![\w.-])2px\b/.test(item.value.replaceAll(/var\([^(),]*,[^()]*\)/g, ' ')))
    .filter((item) => {
      const isOffset =
        item.property === 'outline-offset' &&
        (isFocusRingDeclaration(item) || isThumbRingDeclaration(item))
      const isBandCalc =
        isActiveOptionBand(item) &&
        ['border-radius', 'inset'].includes(item.property) &&
        item.value.startsWith('calc(')
      return !isOffset && !isThumbBarInset(item) && !isBandCalc
    })
    .map((item) => `${item.owner} ${item.property}: ${item.value}`)

const PLANTED_VALUES = [
  '#fff',
  'red',
  '12px',
  'var(--nave-color-content-primary, red)',
  'calc(100% - 13px)',
]

describe('AC-base-ui-feedback-navigation-40, AC-base-ui-overlay-completion-30 and AC-base-ui-bridge-24: every declared value is one of the admitted forms, with the overlay completion admissions', () => {
  it('classifies every value of the stylesheet', () => {
    expect(unacceptedValues(readStylesheet())).toEqual([])
  })

  it('carries a var() fallback only as the two admitted forms, in the parts that own them', () => {
    expect(fallbackViolations(readStylesheet())).toEqual([])
  })

  it('sets feedback.danger on a control border only under an invalid key', () => {
    expect(borderColourViolations(readStylesheet(), BORDER_TOKENS)).toEqual([])
  })

  it.each(PLANTED_VALUES)('reds on a planted %s (control)', (value) => {
    expect(unacceptedValues(planted(`.${PREFIX}title { color: ${value} }`))).not.toEqual([])
  })

  it('reds on a named-colour border (control)', () => {
    const css = planted(`.${PREFIX}input { border-color: red }`)

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([`${PREFIX}input border-color: red`])
  })

  it('reds on a danger border whose selector list has a branch outside the invalid key (control)', () => {
    const css = planted(
      `.${PREFIX}input { &[aria-invalid="true"], &:hover { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}input border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reds on a danger border outside an invalid key (control)', () => {
    const css = planted(`.${PREFIX}input { border-color: var(--nave-color-feedback-danger) }`)

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}input border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reds on a danger border under :not() of the invalid key, which paints every valid control (control)', () => {
    const css = planted(
      `.${PREFIX}input { &:not([aria-invalid="true"]) { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}input border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reads the invalid key by its attribute and value, however the value is quoted', () => {
    const css = planted(
      `.${PREFIX}input { &[aria-invalid=true] { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([])
  })

  it('reds on a danger border under a :has() argument that is not bounded to a direct child (control)', () => {
    const css = planted(
      `.${PREFIX}number-field-group { &:has(> [aria-invalid="true"], [aria-invalid="true"]) { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}number-field-group border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reds on a danger border of a valid control whose parent is invalid (control)', () => {
    const css = planted(
      `.${PREFIX}input { [aria-invalid="true"] > & { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}input border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reds on a danger border of a different element nested inside an invalid rule (control)', () => {
    const css = planted(
      `.${PREFIX}number-field-group { &:has(> [aria-invalid="true"]) { & > [aria-disabled="true"] { border-color: var(--nave-color-feedback-danger) } } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}number-field-group border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('admits a danger border nested inside an invalid rule on the same element', () => {
    const css = planted(
      `.${PREFIX}number-field-group { &:has(> [aria-invalid="true"]) { &:hover { border-color: var(--nave-color-feedback-danger) } } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([])
  })

  it('reds on a focus-ring fallback outside the rules that own it (control)', () => {
    const css = planted(`.${PREFIX}button { border-width: var(--nave-border-width-focus, 2px) }`)

    expect(fallbackViolations(css)).toEqual([
      `${PREFIX}button var(--nave-border-width-focus, 2px) outside its parts`,
    ])
  })

  it('reds on a planted system colour, which a token must stand in for (control)', () => {
    const css = planted(`.${PREFIX}title { color: windowtext }`)

    expect(unacceptedValues(css)).toEqual([`${PREFIX}title color: windowtext`])
  })

  it('carries the literal 2px outside a fallback only where the criterion admits it', () => {
    expect(literalTwoPixelViolations(readStylesheet())).toEqual([])
  })

  it('carries var() fallbacks in the active option band, and its 2px offsets, as the shipped bytes', () => {
    const band = flatten(readStylesheet()).filter((item) => isActiveOptionBand(item))

    expect(band.map((item) => item.property)).toEqual([
      'content',
      'position',
      'inset',
      'border-style',
      'border-width',
      'border-color',
      'border-radius',
      'pointer-events',
    ])
    expect(band.flatMap((item) => fallbacksIn(item))).toEqual([
      'var(--nave-border-width-focus, 2px)',
      'var(--nave-border-width-focus, 2px)',
      'var(--nave-color-border-focus, currentColor)',
      'var(--nave-border-width-focus, 2px)',
    ])
  })

  it('sets feedback.danger on the border of the input group, the combobox trigger and nowhere else but an invalid control border', () => {
    const owners = flatten(readStylesheet())
      .filter((item) => item.value.includes(DANGER))
      .map((item) => item.owner.replace(PREFIX, ''))

    expect(new Set(owners)).toEqual(
      new Set([
        'checkbox',
        'combobox-trigger',
        'input',
        'input-group',
        'number-field-group',
        'radio',
        'select-trigger',
        'switch',
      ]),
    )
    expect(dangerElsewhere(readStylesheet())).toEqual([])
    expect(borderColourViolations(readStylesheet(), BORDER_TOKENS)).toEqual([])
  })

  it('reds on a planted var(--nave-color-border-focus, red) in the active option (control)', () => {
    const css = planted(
      `.${PREFIX}active-option { &[data-highlighted]::before { border-color: var(--nave-color-border-focus, red) } }`,
    )

    expect(fallbackViolations(css)).toEqual([
      `${PREFIX}active-option var(--nave-color-border-focus, red)`,
    ])
  })

  it('reds on the admitted focus fallbacks planted in the active option outside its band (control)', () => {
    const css = planted(
      `.${PREFIX}active-option { border-width: var(--nave-border-width-focus, 2px) }`,
    )

    expect(fallbackViolations(css)).toEqual([
      `${PREFIX}active-option var(--nave-border-width-focus, 2px) outside its parts`,
    ])
  })

  it('reds on a literal 2px planted outside the places that own it (control)', () => {
    const css = planted(`.${PREFIX}active-option { top: 2px }`)

    expect(literalTwoPixelViolations(css)).toEqual([`${PREFIX}active-option top: 2px`])
  })

  it('reds on a danger border under [data-invalid] in the chip (control)', () => {
    const css = planted(
      `.${PREFIX}chip { &[data-invalid] { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}chip border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reds on a danger border under a bare [data-invalid] in the input group, without its :not([data-disabled]) (control)', () => {
    const css = planted(
      `.${PREFIX}input-group { &[data-invalid] { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(css, BORDER_TOKENS)).toEqual([
      `${PREFIX}input-group border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('admits a danger border under [data-invalid]:not([data-disabled]) in the input group only', () => {
    const group = planted(
      `.${PREFIX}input-group { &[data-invalid]:not([data-disabled]) { border-color: var(--nave-color-feedback-danger) } }`,
    )
    const chip = planted(
      `.${PREFIX}chip { &[data-invalid]:not([data-disabled]) { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(borderColourViolations(group, BORDER_TOKENS)).toEqual([])
    expect(borderColourViolations(chip, BORDER_TOKENS)).toEqual([
      `${PREFIX}chip border-color: var(--nave-color-feedback-danger)`,
    ])
  })

  it('reds on feedback.danger set as a text colour (control)', () => {
    const css = planted(`.${PREFIX}title { color: var(--nave-color-feedback-danger) }`)

    expect(dangerElsewhere(css)).toEqual([
      `${PREFIX}title color names feedback.danger outside a control border`,
    ])
  })
})

/**
 * The outermost `calc( ... )` expressions of a value, each as the text between its parentheses.
 */
const calcsIn = (value: string): string[] => {
  const found: string[] = []
  let at = value.indexOf('calc(')
  while (at !== -1) {
    let depth = 0
    let end = at + 'calc'.length
    do {
      if (value[end] === '(') depth += 1
      else if (value[end] === ')') depth -= 1
      end += 1
    } while (depth > 0 && end < value.length)
    found.push(value.slice(at, end))
    at = value.indexOf('calc(', end)
  }
  return found
}

/**
 * A calc() with each `var(--nave-*)` read as V, so that its shape is compared and not its tokens.
 */
const shapeOf = (expression: string): string => expression.replaceAll(/var\(--nave-[\w-]+\)/g, 'V')

// The shapes AC-40's sentence lists: `calc(100% - 2 * var(--nave-*))`, `calc(var(--nave-*) + N *
// var(--nave-*))` and `calc(var(--nave-*) / 2)`, with the guard's `calc(0 * var(--nave-motion-duration-fast))`
// admitted inside its `@media` only.
const LISTED_SHAPES: readonly RegExp[] = [
  /^calc\(100% - 2 \* V\)$/,
  /^calc\(V \+ \d+ \* V\)$/,
  /^calc\(V \/ 2\)$/,
]
const GUARD_SHAPE = 'calc(0 * var(--nave-motion-duration-fast))'

// The two shapes Appendix C.1 holds that the sentence does not list: `calc(V + V)` (the viewport's
// padding and scroll-padding on a scrollbar edge) and `calc((V - V) / 2)` (the strip's centring
// padding). Admitted here because the normative bytes carry them; the question is in the report.
const C1_ONLY_SHAPES: ReadonlySet<string> = new Set(['calc((V - V) / 2)', 'calc(V + V)'])

const isListedShape = (shape: string): boolean => LISTED_SHAPES.some((form) => form.test(shape))

const isInGuard = (item: FlatDeclaration): boolean =>
  item.atRules.some((rule) => rule.startsWith('@media (prefers-reduced-motion: reduce)'))

/**
 * The calc() shapes of the 21 new classes outside the reduced-motion guard that are neither listed
 * nor Appendix C.1's two, and the guard shape outside its `@media`.
 */
const calcViolations = (css: string): string[] =>
  flatten(css)
    .filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner))
    .flatMap((item) =>
      calcsIn(item.value).flatMap((expression) => {
        if (expression === GUARD_SHAPE) {
          return isInGuard(item)
            ? []
            : [`${item.owner} ${item.property}: ${expression} outside its guard`]
        }
        const shape = shapeOf(expression)
        return isListedShape(shape) || C1_ONLY_SHAPES.has(shape)
          ? []
          : [`${item.owner} ${item.property}: ${shape}`]
      }),
    )

const calcShapesIn = (css: string): Set<string> =>
  new Set(
    flatten(css)
      .filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner))
      .flatMap((item) => calcsIn(item.value))
      .map((expression) => (expression === GUARD_SHAPE ? expression : shapeOf(expression))),
  )

/**
 * The named literals the new classes carry: every word of their values that has a unit or is a
 * named literal of the value classifier.
 */
const literalsOf = (css: string): Set<string> =>
  new Set(
    flatten(css)
      .filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner) && !isFocusRingDeclaration(item))
      .flatMap((item) => item.value.replaceAll(/var\([^()]*\)/g, ' ').split(/[\s(),*/+]+/))
      .filter((word) => /^-?\d*\.?\d+(?:px|rem|em|deg|ms|s|%)$/.test(word)),
  )

const fallbacksOutsideRings = (css: string): string[] =>
  flatten(css)
    .filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner) && !isFocusRingDeclaration(item))
    .flatMap((item) => fallbacksIn(item).map((text) => `${item.owner} ${text}`))

describe('AC-base-ui-feedback-navigation-40: the values of the 21 new classes are each one of the admitted forms', () => {
  it('classifies every value of the stylesheet, as the overlay release does, the new classes included', () => {
    expect(unacceptedValues(readStylesheet())).toEqual([])
    expect(unacceptedValues(expectedSheet())).toEqual([])
    expect(fallbackViolations(readStylesheet())).toEqual([])
  })

  it('adds no named literal beyond 20rem and 180deg, and no unit-bearing word but 100%', () => {
    const expected = new Set(['20rem', '100%', '180deg'])

    expect(literalsOf(expectedSheet())).toEqual(expected)
    expect(literalsOf(readStylesheet())).toEqual(expected)
  })

  it('adds no var() fallback in the 21 classes', () => {
    expect(fallbacksOutsideRings(readStylesheet())).toEqual([])
    expect(fallbacksOutsideRings(expectedSheet())).toEqual([])
    expect(
      flatten(expectedSheet()).filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner)),
    ).not.toEqual([])
  })

  it('uses only the calc() shapes the criterion lists and the two Appendix C.1 holds besides, the guard shape only in its @media', () => {
    expect(calcViolations(readStylesheet())).toEqual([])
    expect(calcShapesIn(readStylesheet())).toEqual(
      new Set([
        'calc(100% - 2 * V)',
        'calc((V - V) / 2)',
        'calc(V + 4 * V)',
        'calc(V + V)',
        'calc(V / 2)',
        GUARD_SHAPE,
      ]),
    )
  })

  it('reads the oracle sheet the same way: its calc() shapes are those six', () => {
    expect(calcViolations(expectedSheet())).toEqual([])
    expect(calcShapesIn(expectedSheet()).size).toBe(6)
  })

  it('admits transition-property: none as a keyword, with no new value form', () => {
    const none = flatten(expectedSheet()).filter(
      (item) => item.property === 'transition-property' && item.value === 'none',
    )

    expect(none.map((item) => item.owner)).toEqual([`${PREFIX}navigation-menu-fade`])
    expect(none.flatMap((item) => unacceptedIn(item))).toEqual([])
  })

  it.each(PLANTED_VALUES)('reds on planted %s in a new class (control)', (value) => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}toast-root { color: ${value} } }`

    expect(unacceptedValues(css)).not.toEqual([])
  })

  it('reds on a planted inline-size: 320px in toast-placement (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}toast-placement { inline-size: 320px } }`

    expect(unacceptedValues(css)).toEqual([`${PREFIX}toast-placement inline-size: 320px`])
  })

  it.each([
    [
      'a calc() of two tokens multiplied',
      'calc(var(--nave-spacing-content-lg) * var(--nave-spacing-content-sm))',
    ],
    ['a calc() with a literal length', 'calc(100% - 13px)'],
    [
      'a calc() subtracting two tokens, which no shape lists',
      'calc(var(--nave-spacing-content-lg) - var(--nave-spacing-content-sm))',
    ],
  ])('reds on %s planted in a new class (control)', (_name, value) => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}scroll-area { padding: ${value} } }`

    expect(calcViolations(expectedSheet())).toEqual([])
    expect(calcViolations(css)).not.toEqual([])
  })

  it('reds on the guard value planted outside its @media in a new class (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}toast-fade { transition-duration: ${GUARD_SHAPE} } }`

    expect(calcViolations(css)).toEqual([
      `${PREFIX}toast-fade transition-duration: ${GUARD_SHAPE} outside its guard`,
    ])
  })

  it('reds on a var() fallback planted in a new class (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}avatar { color: var(--nave-color-content-primary, red) } }`

    expect(fallbacksOutsideRings(css)).toEqual([
      `${PREFIX}avatar var(--nave-color-content-primary, red)`,
    ])
  })
})

describe('the selector-list splitter that the border and disjointness readers rely on', () => {
  it('splits at the top-level comma when a character outside the basic plane comes first', () => {
    expect(splitSelectorList('&[data-x="\u{1F600}"], &:hover')).toEqual([
      '&[data-x="\u{1F600}"]',
      '&:hover',
    ])
  })
})

const TRANSLUCENT = /color-mix\(|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|#[\da-f]{3,8}\b/i

const ALLOWED_BORDERS = ['var(--nave-color-border-control)', 'var(--nave-color-border-disabled)']

/**
 * The `--nave-color-*` names a tokens stylesheet declares, in any block, whose value carries an
 * alpha below 1 (a `/ a` after the channels, in a number or a percentage) or is `transparent`.
 */
const translucentColours = (css: string): string[] => {
  const found: string[] = []
  postcss.parse(css).walkDecls(/^--nave-color-/, (decl) => {
    const alphas = decl.value
      .matchAll(/\/\s*([\d.]+)(%?)\s*\)/g)
      .map((match) => Number(match[1]) / (match[2] === '%' ? 100 : 1))
    if (/\btransparent\b/i.test(decl.value) || alphas.some((alpha) => alpha < 1)) {
      found.push(decl.prop)
    }
  })
  return [...new Set(found)]
}

/**
 * The classes whose declarations name a token.
 */
const usersOf = (css: string, token: string): string[] => [
  ...new Set(
    flatten(css)
      .filter((item) => item.value.includes(token))
      .map((item) => item.owner),
  ),
]

describe('AC-base-ui-overlay-completion-34 and AC-base-ui-bridge-32: the scrim is the one translucent fill, and control boundaries are what they say', () => {
  it('has no color-mix(, no colour function and no hex colour in any value', () => {
    expect(flatten(readStylesheet()).filter((item) => TRANSLUCENT.test(item.value))).toEqual([])
  })

  it('sets a control border colour only to border.control, border.disabled, transparent, currentColor or, invalid only, danger', () => {
    expect(borderColourViolations(readStylesheet(), ALLOWED_BORDERS)).toEqual([])
  })

  it('reds on a planted translucent value (control)', () => {
    const css = planted('.x { background-color: color-mix(in srgb, red 50%, transparent) }')

    expect(flatten(css).some((item) => TRANSLUCENT.test(item.value))).toBe(true)
  })

  it('gives the input group, the combobox trigger and the chip a border colour from the list only', () => {
    const borders = new Set(
      flatten(readStylesheet())
        .filter((item) => isBorderOf(item))
        .map((item) => item.owner.replace(PREFIX, '')),
    )

    expect(
      ['input-group', 'combobox-trigger', 'chip'].filter((name) => !borders.has(name)),
    ).toEqual([])
    expect(borderColourViolations(readStylesheet(), ALLOWED_BORDERS)).toEqual([])
  })

  it('makes the scrim the one --nave-color-* of the built tokens with an alpha below 1', () => {
    expect(translucentColours(workspaceTokensCss())).toEqual(['--nave-color-backdrop-modal'])
  })

  it('names the scrim in the stylesheet only in the backdrop class', () => {
    expect(usersOf(readStylesheet(), '--nave-color-backdrop-modal')).toEqual([`${PREFIX}backdrop`])
  })

  it('reds on the scrim planted in the dialog popup (control)', () => {
    const css = planted(
      `.${PREFIX}dialog-popup { background-color: var(--nave-color-backdrop-modal) }`,
    )

    expect(usersOf(css, '--nave-color-backdrop-modal')).toEqual(
      expect.arrayContaining([`${PREFIX}dialog-popup`]),
    )
    expect(usersOf(css, '--nave-color-backdrop-modal')).not.toEqual([`${PREFIX}backdrop`])
  })

  it('reds on a tokens copy giving surface.overlay an alpha of 0.9 (control)', () => {
    const css = workspaceTokensCss()
    const copy = css.replace(/(--nave-color-surface-overlay: [^\n]*?) \/ 1\)/, '$1 / 0.9)')

    expect(copy).not.toBe(css)
    expect(translucentColours(copy)).toEqual([
      '--nave-color-surface-overlay',
      '--nave-color-backdrop-modal',
    ])
  })

  it('reads transparent and a percentage alpha as translucent too (control)', () => {
    const css =
      ':root { --nave-color-a: transparent; --nave-color-b: oklch(0.5 0 0 / 50%); --nave-color-c: oklch(0.5 0 0 / 1) }'

    expect(translucentColours(css)).toEqual(['--nave-color-a', '--nave-color-b'])
  })
})

const buttonColor = (css: string): string | undefined =>
  flatten(css).find(
    (item) =>
      item.owner === `${PREFIX}button` && item.selectors.length === 1 && item.property === 'color',
  )?.value

describe('AC-base-ui-bridge-42: the button paints content.primary on action.secondary (package half)', () => {
  it('sets color: var(--nave-color-content-primary) in the base rule', () => {
    expect(buttonColor(readStylesheet())).toBe('var(--nave-color-content-primary)')
  })

  it('reds when the rule points at content.secondary (control)', () => {
    const css = readStylesheet().replace(
      /(\.nave-base-ui-button \{[^}]*?) color: var\(--nave-color-content-primary\)/,
      '$1 color: var(--nave-color-content-secondary)',
    )

    expect(buttonColor(css)).toBe('var(--nave-color-content-secondary)')
  })

  it('has exactly one base rule on the button', () => {
    const base = flattenRules(readStylesheet()).filter(
      (item) => item.selectors[0] === `.${PREFIX}button`,
    )

    expect(base).toHaveLength(1)
  })
})
