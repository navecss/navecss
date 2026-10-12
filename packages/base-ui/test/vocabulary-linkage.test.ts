import { describe, expect, it } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { type FlatDeclaration, flatten, readStylesheet } from './support/stylesheet.ts'
import { GUARD_PAIRS, ROW_PAIRS } from './support/vocabulary-pairs.ts'

/**
 * The (class, item) pairs the stylesheet's rules key on: every attribute name in every selector
 * and every Base UI variable in every value, by the class that owns the rule. `data-nave-*` is
 * Nave's own and is asserted by the variants rows.
 */
const declarationPairs = ({ owner, selectors, value }: FlatDeclaration): string[] => {
  const attributes = selectors
    .flatMap((selector) => attributeReads(selector).map(({ name }) => name))
    .filter((name) => !name.startsWith('data-nave-'))
  const variables = value
    .matchAll(/var\((--[\w-]+)/g)
    .map((match) => match[1] ?? '')
    .filter((name) => !name.startsWith('--nave-'))
    .toArray()
  return [...attributes, ...variables].map((item) => `${owner} ${item}`)
}

const stylesheetPairs = (css: string): Set<string> =>
  new Set(flatten(css).flatMap((declaration) => declarationPairs(declaration)))

const byName = (a: string, b: string): number => a.localeCompare(b)

const asserted = new Set(
  Object.values(ROW_PAIRS)
    .flat()
    .map(([cls, item]) => `${cls} ${item}`),
)

/**
 * The `&[data-instant]` key of the reduced-motion guard on the three motion classes whose parts do
 * not declare the attribute at every minor: no row can assert a key that matches nothing there.
 */
const exempt = new Set(GUARD_PAIRS.map(([cls, item]) => `${cls} ${item}`))

const unasserted = (css: string): string[] =>
  [...stylesheetPairs(css)]
    .filter((pair) => !asserted.has(pair) && !exempt.has(pair))
    .toSorted(byName)

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the stylesheet-to-render linkage is complete', () => {
  it('has a render row for every pair the stylesheet extracts, but the three guard keys', () => {
    expect(unasserted(readStylesheet())).toEqual([])
  })

  it('asserts no pair the stylesheet does not use', () => {
    expect(
      [...asserted].filter((pair) => !stylesheetPairs(readStylesheet()).has(pair)).toSorted(byName),
    ).toEqual([])
  })

  it('exempts exactly the guard keys of the three classes, each of which the stylesheet carries and no row asserts', () => {
    expect([...exempt].toSorted(byName)).toEqual([
      'nave-base-ui-backdrop data-instant',
      'nave-base-ui-popup-fade data-instant',
      'nave-base-ui-tab-indicator-motion data-instant',
    ])
    const used = stylesheetPairs(readStylesheet())
    expect([...exempt].filter((key) => !used.has(key))).toEqual([])
    expect([...exempt].filter((key) => asserted.has(key))).toEqual([])
  })

  it('control: a key added to a rule without a render row is reported', () => {
    const planted = `${readStylesheet()}\n@layer components.nave { .nave-base-ui-item[data-highlighted] { color: red } }`
    expect(unasserted(planted)).toEqual(['nave-base-ui-item data-highlighted'])
  })

  it('control: the exemption does not reach another class, or another key of an exempt class', () => {
    const planted = `${readStylesheet()}\n@layer components.nave { .nave-base-ui-popup-motion[data-planted] { color: red } .nave-base-ui-tooltip-popup[data-instant] { color: red } .nave-base-ui-backdrop[data-planted] { color: red } }`
    expect(unasserted(planted)).toEqual([
      'nave-base-ui-backdrop data-planted',
      'nave-base-ui-popup-motion data-planted',
      'nave-base-ui-tooltip-popup data-instant',
    ])
  })
})
