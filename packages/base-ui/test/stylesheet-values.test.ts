import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import { COLOR_KEYWORDS } from './support/colors.ts'
import { flatten, flattenRules, readStylesheet, splitSelectorList } from './support/stylesheet.ts'
import { focusRingClasses } from './support/table-p.ts'
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

const isFallbackHome = (owner: string): boolean =>
  owner === `${PREFIX}slider-thumb` || focusRingClasses.includes(owner)

/**
 * The `var()` fallbacks outside the admitted two, and the admitted two outside their parts.
 */
const fallbackViolations = (css: string): string[] =>
  flatten(css).flatMap((item) =>
    fallbacksIn(item).flatMap((text) => {
      if (!ADMITTED_FALLBACKS.includes(text)) return [`${item.owner} ${text}`]
      return isFallbackHome(item.owner) ? [] : [`${item.owner} ${text} outside its parts`]
    }),
  )

/**
 * Whether every alternative of some enclosing rule's selector list keys on the invalid state: one
 * sibling alternative without it would let the paint reach a valid control.
 */
const isInvalidKey = (item: FlatDeclaration): boolean =>
  item.selectors.some((list) =>
    splitSelectorList(list).every((branch) => branch.includes('[aria-invalid="true"]')),
  )

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

const PLANTED_VALUES = [
  '#fff',
  'red',
  '12px',
  'var(--nave-color-content-primary, red)',
  'calc(100% - 13px)',
]

describe('AC-base-ui-bridge-24: every declared value is one of the admitted forms', () => {
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

    expect(borderColourViolations(css, [])).not.toEqual([])
  })

  it('reds on a danger border outside an invalid key (control)', () => {
    const css = planted(`.${PREFIX}input { border-color: var(--nave-color-feedback-danger) }`)

    expect(borderColourViolations(css, [])).not.toEqual([])
  })
})

const named = (css: string): Set<string> => new Set(css.match(/--nave-[a-z0-9-]+/g))

describe('AC-base-ui-bridge-25: every Nave token the stylesheet names exists in the workspace', () => {
  it('names 54 distinct tokens, each declared by the workspace tokens', () => {
    const found = named(readStylesheet())

    expect(found.size).toBe(54)
    expect(
      found
        .values()
        .filter((name) => !tokens.has(name))
        .toArray(),
    ).toEqual([])
  })

  it('reds on a planted token the workspace does not declare (control)', () => {
    const css = planted('.x { color: var(--nave-color-surface-scrim) }')

    expect(
      named(css)
        .values()
        .filter((name) => !tokens.has(name))
        .toArray(),
    ).toEqual(['--nave-color-surface-scrim'])
  })
})

const TRANSLUCENT = /color-mix\(|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|#[\da-f]{3,8}\b/i

describe('AC-base-ui-bridge-32: no translucent surface behind text, and control boundaries are what they say', () => {
  it('has no color-mix(, no colour function and no hex colour in any value', () => {
    expect(flatten(readStylesheet()).filter((item) => TRANSLUCENT.test(item.value))).toEqual([])
  })

  it('sets a control border colour only to border.control, border.disabled, transparent, currentColor or, invalid only, danger', () => {
    expect(
      borderColourViolations(readStylesheet(), [
        'var(--nave-color-border-control)',
        'var(--nave-color-border-disabled)',
      ]),
    ).toEqual([])
  })

  it('reds on a planted translucent value (control)', () => {
    const css = planted('.x { background-color: color-mix(in srgb, red 50%, transparent) }')

    expect(flatten(css).some((item) => TRANSLUCENT.test(item.value))).toBe(true)
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
