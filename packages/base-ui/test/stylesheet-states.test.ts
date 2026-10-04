import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import { ringBlock } from './support/focus.ts'
import { flatten, readStylesheet } from './support/stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './support/tokens.ts'

const PREFIX = 'nave-base-ui-'
const tokenValues = declaredTokens(workspaceTokensCss())

const planted = (rule: string): string => `${readStylesheet()}\n@layer components.nave { ${rule} }`

const DISABLED = /\[aria-disabled="true"\]|\[data-disabled\]|:disabled/

/**
 * Whether a selector keys on a disabled state positively, not only inside a `:not()`.
 */
const isDisabledKey = (selector: string): boolean =>
  DISABLED.test(selector.replaceAll(/:not\([^)]*\)/g, ''))

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
  if (item.selectors.every((selector) => !isDisabledKey(selector))) return []
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
  item.selectors.some((selector) => selector.includes('[aria-invalid="true"]'))

const orderProblems = (found: FlatDeclaration[]): string[] =>
  [...new Set(found.map((item) => item.owner))].flatMap((owner) => {
    const own = found.filter((item) => item.owner === owner)
    const lastInvalid = own.findLastIndex((item) => isInvalidKey(item))
    const firstDisabled = own.findIndex((item) =>
      item.selectors.some((selector) => isDisabledKey(selector)),
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
 * The resolved border radius minus the resolved border width: the curve the inset must clear.
 */
const innerRadius = (found: FlatDeclaration[], owner: string): number => {
  const radius = px(declared(found, owner, { property: 'border-radius' }) ?? '0') ?? 0
  const border = declared(found, owner, { property: 'border' }) ?? ''
  const width = px(/var\(--nave-border-width-[a-z]+\)/.exec(border)?.[0] ?? '0') ?? 0
  return Math.max(0, radius - width)
}

const rowProblem = (found: FlatDeclaration[], owner: string, sides: readonly Side[]): string[] => {
  const width = px(ringBlock['outline-width'] ?? '')
  const offset = px(ringBlock['outline-offset'] ?? '')
  const insets = sides.map((side) => px(declared(found, owner, side) ?? ''))
  if (width === undefined || offset === undefined || insets.includes(undefined)) {
    return [`${owner} has a side that does not resolve to px`]
  }
  const smallest = Math.min(...(insets as number[]))
  const needed = width + offset + 0.293 * innerRadius(found, owner)
  return smallest >= needed ? [] : [`${owner}: ${smallest} < ${needed}`]
}

const isClipping = (item: FlatDeclaration): boolean =>
  ['overflow', 'overflow-x', 'overflow-y'].includes(item.property) && item.value !== 'visible'

/**
 * P >= W + O + 0.293 x R for each row of Table T3, and every overflow class a row.
 */
const clipViolations = (css: string): string[] => {
  const found = flatten(css)
  const rows = T3.entries().flatMap(([owner, sides]) => rowProblem(found, owner, sides))
  const missing = found
    .filter((item) => isClipping(item) && !T3.has(item.owner))
    .map((item) => `${item.owner} clips and is not a row of Table T3`)
  return [...rows, ...missing]
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
  it('holds P >= W + O + 0.293 x R for every row of Table T3', () => {
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

  it('reds on a clipping class that is not a row (control)', () => {
    expect(clipViolations(planted(`.${PREFIX}title { overflow: hidden }`))).toEqual([
      expect.stringContaining('title clips'),
    ])
  })
})
