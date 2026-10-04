import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import { ringBlock } from './support/focus.ts'
import { requiresDisabled, requiresInvalidState } from './support/selector.ts'
import { flatten, readStylesheet } from './support/stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './support/tokens.ts'

const PREFIX = 'nave-base-ui-'
const tokenValues = declaredTokens(workspaceTokensCss())

const planted = (rule: string): string => `${readStylesheet()}\n@layer components.nave { ${rule} }`

const DISABLED_PAINT = new Map([
  ['border-color', 'var(--nave-color-border-disabled)'],
  ['color', 'var(--nave-color-content-disabled)'],
  ['cursor', 'not-allowed'],
])

const isTransparentFill = (item: FlatDeclaration): boolean =>
  item.property === 'background-color' &&
  item.value === 'transparent' &&
  [`${PREFIX}button`, `${PREFIX}toggle`].includes(item.owner)

const disabledPaintProblems = (item: FlatDeclaration): string[] => {
  if (item.selectors.every((selector) => !requiresDisabled(selector))) return []
  const where = `${item.owner} ${item.property}: ${item.value}`
  const problems: string[] = []
  if (!isTransparentFill(item) && DISABLED_PAINT.get(item.property) !== item.value) {
    problems.push(where)
  }
  if (['filter', 'opacity'].includes(item.property)) problems.push(`${where} is opacity or filter`)
  if ([`${PREFIX}label`, `${PREFIX}legend`].includes(item.owner)) {
    problems.push(`${where} is a disabled rule on a label`)
  }
  return problems
}

const isInvalidKey = (item: FlatDeclaration): boolean =>
  item.selectors.some((selector) => requiresInvalidState(selector))

const orderProblems = (found: FlatDeclaration[]): string[] =>
  [...new Set(found.map((item) => item.owner))].flatMap((owner) => {
    const own = found.filter((item) => item.owner === owner)
    const lastInvalid = own.findLastIndex((item) => isInvalidKey(item))
    const firstDisabled = own.findIndex((item) =>
      item.selectors.some((selector) => requiresDisabled(selector)),
    )
    return lastInvalid !== -1 && firstDisabled !== -1 && lastInvalid > firstDisabled
      ? [`${owner} has its invalid rule after its disabled rule`]
      : []
  })

/**
 * What AC-30 asserts, as the list of what is wrong.
 */
const disabledViolations = (css: string): string[] => {
  const found = flatten(css)
  return [...found.flatMap((item) => disabledPaintProblems(item)), ...orderProblems(found)]
}

describe('AC-base-ui-bridge-30: B4, disabled paint is tokens, never opacity', () => {
  it('sets only content.disabled, border.disabled, not-allowed and a transparent fill on a disabled key', () => {
    expect(disabledViolations(readStylesheet())).toEqual([])
  })

  it('reds on an opacity under a disabled key (control)', () => {
    const css = planted(`.${PREFIX}item { &[aria-disabled="true"] { opacity: 0.5 } }`)

    expect(disabledViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('is opacity or filter')]),
    )
  })

  it.each([
    ['item', '&[aria-disabled=true]', 'color: var(--nave-color-content-secondary)'],
    [
      'number-field-group',
      '&[data-disabled=""]',
      'background-color: var(--nave-color-surface-raised)',
    ],
  ])('reads a disabled key however its value is quoted: %s %s (control)', (owner, key, paint) => {
    const css = planted(`.${PREFIX}${owner} { ${key} { ${paint} } }`)

    expect(disabledViolations(css)).toEqual([`${PREFIX}${owner} ${paint}`])
  })

  it('does not read a disabled attribute inside :not() as a disabled key (control)', () => {
    const css = planted(
      `.${PREFIX}item { &:not([aria-disabled=true]) { color: var(--nave-color-content-secondary) } }`,
    )

    expect(disabledViolations(css)).toEqual([])
  })

  it('reds on a disabled rule on a label (control)', () => {
    const css = planted(
      `.${PREFIX}label { &[data-disabled] { color: var(--nave-color-content-disabled) } }`,
    )

    expect(disabledViolations(css)).toEqual([expect.stringContaining('disabled rule on a label')])
  })

  it('reds on an invalid rule after the disabled one (control)', () => {
    const css = planted(
      `.${PREFIX}radio { &[aria-invalid="true"] { border-color: var(--nave-color-feedback-danger) } }`,
    )

    expect(disabledViolations(css)).toEqual([
      expect.stringContaining('invalid rule after its disabled'),
    ])
  })
})

/**
 * A length in px, from a literal or a workspace token, with rem at 16px.
 */
const px = (value: string): number | undefined => {
  const token = /^var\((--nave-[\da-z-]+)(?:,[^)]*)?\)$/.exec(value)?.[1]
  const literal = token === undefined ? value : tokenValues.get(token)
  const match = /^(-?\d*\.?\d+)(px|rem)?$/.exec(literal ?? '')
  if (match === null) return undefined
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1)
}

interface Side {
  readonly property: string
  readonly selector?: string
}

const PANEL: readonly Side[] = [
  { property: 'padding-inline' },
  { property: 'margin-block-start', selector: '& > :first-child' },
  { property: 'margin-block-end', selector: '& > :last-child' },
]

const POPUP: readonly Side[] = [{ property: 'padding' }, { property: 'scroll-padding' }]

const T3: ReadonlyMap<string, readonly Side[]> = new Map([
  [`${PREFIX}accordion-panel`, PANEL],
  [`${PREFIX}collapsible-panel`, PANEL],
  [`${PREFIX}dialog-popup`, POPUP],
  [`${PREFIX}list-popup`, POPUP],
  [`${PREFIX}popover-popup`, POPUP],
])

const declared = (found: FlatDeclaration[], owner: string, side: Side): string | undefined =>
  found.find(
    (item) =>
      item.owner === owner &&
      item.property === side.property &&
      item.selectors.slice(1).join(',') === (side.selector ?? ''),
  )?.value

/**
 * What a rounded corner takes off the inset's clearance, as a fraction of the corner's radius: the
 * focus ring follows the popup's curve, and at 45 degrees the curve sits `1 - sqrt(1/2)`, about
 * 0.293, of a radius away from the square corner it replaces.
 */
const CORNER_SAGITTA = 0.293

/**
 * The resolved border radius minus the resolved border width: the curve the inset must clear.
 * A radius or width that is declared and does not resolve to px is undefined, never read as square.
 */
const innerRadius = (found: FlatDeclaration[], owner: string): number | undefined => {
  const declaredRadius = declared(found, owner, { property: 'border-radius' })
  const border = declared(found, owner, { property: 'border' })
  const radius = declaredRadius === undefined ? 0 : px(declaredRadius)
  const widthToken =
    border === undefined ? '0' : /var\(--nave-border-width-[a-z]+\)/.exec(border)?.[0]
  const width = widthToken === undefined ? undefined : px(widthToken)
  return radius === undefined || width === undefined ? undefined : Math.max(0, radius - width)
}

const rowProblem = (found: FlatDeclaration[], owner: string, sides: readonly Side[]): string[] => {
  const width = px(ringBlock['outline-width'] ?? '')
  const offset = px(ringBlock['outline-offset'] ?? '')
  const radius = innerRadius(found, owner)
  const insets = sides.map((side) => px(declared(found, owner, side) ?? ''))
  if (
    width === undefined ||
    offset === undefined ||
    radius === undefined ||
    insets.includes(undefined)
  ) {
    return [`${owner} has a side that does not resolve to px`]
  }
  const smallest = Math.min(...(insets as number[]))
  const needed = width + offset + CORNER_SAGITTA * radius
  return smallest >= needed ? [] : [`${owner}: ${smallest} < ${needed}`]
}

const OVERFLOW_PROPERTIES = new Set([
  'overflow',
  'overflow-block',
  'overflow-inline',
  'overflow-x',
  'overflow-y',
])

/**
 * `contain` values that clip a descendant: paint containment, and the `strict` and `content`
 * shorthands that include it.
 */
const CLIPPING_CONTAIN = new Set(['content', 'paint', 'strict'])

const unprefixed = (property: string): string => property.toLowerCase().replace(/^-[a-z]+-/, '')

const wordsOf = (value: string): string[] => value.trim().toLowerCase().split(/\s+/)

/**
 * Whether a declaration makes a box clip its descendants, so that a focus ring drawn outside a
 * child can be cut off: an overflow other than visible, paint containment, content-visibility
 * other than visible, a `clip-path` other than none, or a `clip` other than auto. The property
 * name is compared with any vendor prefix stripped.
 */
const isClipping = (item: FlatDeclaration): boolean => {
  const property = unprefixed(item.property)
  const words = wordsOf(item.value)
  if (OVERFLOW_PROPERTIES.has(property)) return words.some((word) => word !== 'visible')
  if (property === 'contain') return words.some((word) => CLIPPING_CONTAIN.has(word))
  if (property === 'content-visibility') return words.some((word) => word !== 'visible')
  return isUncomputableClip(item)
}

/**
 * Whether a declaration clips along a shape or rectangle the inset rule cannot turn into a number.
 */
const isUncomputableClip = (item: FlatDeclaration): boolean => {
  const property = unprefixed(item.property)
  const value = item.value.trim().toLowerCase()
  return (property === 'clip-path' && value !== 'none') || (property === 'clip' && value !== 'auto')
}

/**
 * P >= W + O + CORNER_SAGITTA x R for each row of Table T3, every class that clips a row, and
 * every clip the inset rule cannot compute reported to be checked by hand.
 */
const clipViolations = (css: string): string[] => {
  const found = flatten(css)
  const rows = T3.entries().flatMap(([owner, sides]) => rowProblem(found, owner, sides))
  const missing = found
    .filter((item) => isClipping(item) && !T3.has(item.owner))
    .map((item) => `${item.owner} clips and is not a row of Table T3`)
  const byHand = found
    .filter((item) => isUncomputableClip(item))
    .map(
      (item) =>
        `${item.owner} declares ${item.property}: ${item.value}, and its geometry needs checking by hand`,
    )
  return [...rows, ...new Set(missing), ...byHand]
}

const withDeclaration = (rule: string, property: string, value: string): string => {
  const root = postcss.parse(readStylesheet())
  root.walkRules(`.${PREFIX}${rule}`, (found) => {
    found.walkDecls(property, (decl) => {
      decl.value = value
    })
  })
  return root.toString()
}

describe('AC-base-ui-bridge-31: clip insets and scroll-padding, computed from the built tokens and atoms', () => {
  it('holds P >= W + O + CORNER_SAGITTA x R for every row of Table T3', () => {
    expect(clipViolations(readStylesheet())).toEqual([])
  })

  it('reds when the accordion panel inset is planted to zero (control)', () => {
    expect(clipViolations(withDeclaration('accordion-panel', 'padding-inline', '0'))).toEqual([
      expect.stringContaining('accordion-panel'),
    ])
  })

  it('reds on a value that does not resolve to px instead of skipping the row (control)', () => {
    const css = withDeclaration('list-popup', 'padding', 'var(--nave-no-such-token)')

    expect(clipViolations(css)).toEqual([expect.stringContaining('does not resolve to px')])
  })

  it('reds on a declared radius that does not resolve to px instead of reading it as square (control)', () => {
    const css = withDeclaration('list-popup', 'border-radius', 'var(--nave-no-such-token)')

    expect(clipViolations(css)).toEqual([expect.stringContaining('does not resolve to px')])
  })

  it('reds on a clipping class that is not a row (control)', () => {
    expect(clipViolations(planted(`.${PREFIX}title { overflow: hidden }`))).toEqual([
      expect.stringContaining('title clips'),
    ])
  })

  it.each([
    'content-visibility: auto',
    'content-visibility: hidden',
    'contain: paint',
    'contain: content',
    'contain: strict',
    'contain: layout paint',
    'overflow-inline: hidden',
    'overflow-block: clip',
    '-webkit-overflow-x: hidden',
  ])('reds on a planted %s on a class that is not a row (control)', (declaration) => {
    expect(clipViolations(planted(`.${PREFIX}title { ${declaration} }`))).toEqual([
      `${PREFIX}title clips and is not a row of Table T3`,
    ])
  })

  it.each(['clip-path: inset(0)', '-webkit-clip-path: inset(0)', 'clip: rect(0 0 0 0)'])(
    'reds on a planted %s, whose geometry the inset rule cannot compute (control)',
    (declaration) => {
      expect(clipViolations(planted(`.${PREFIX}title { ${declaration} }`))).toEqual([
        `${PREFIX}title clips and is not a row of Table T3`,
        expect.stringContaining('needs checking by hand'),
      ])
    },
  )

  it('reds on a clip-path planted on a row of Table T3 as well, by hand (control)', () => {
    expect(clipViolations(planted(`.${PREFIX}list-popup { clip-path: inset(0) }`))).toEqual([
      expect.stringContaining('needs checking by hand'),
    ])
  })

  it.each([
    'contain: layout',
    'contain: size',
    'container-type: inline-size',
    'content-visibility: visible',
    'overflow-clip-margin: 4px',
    'overflow: visible',
    'clip-path: none',
    'clip: auto',
  ])('does not report a planted %s, which clips nothing (control)', (declaration) => {
    expect(clipViolations(planted(`.${PREFIX}title { ${declaration} }`))).toEqual([])
  })
})
