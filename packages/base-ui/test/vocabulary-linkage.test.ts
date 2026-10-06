import { describe, expect, it } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { type FlatDeclaration, flatten, readStylesheet } from './support/stylesheet.ts'
import { ROW_PAIRS } from './support/vocabulary-pairs.ts'

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

describe('AC-base-ui-bridge-22: the stylesheet-to-render linkage is complete', () => {
  it('has a render row for every pair the stylesheet extracts', () => {
    expect(
      [...stylesheetPairs(readStylesheet())].filter((pair) => !asserted.has(pair)).toSorted(byName),
    ).toEqual([])
  })

  it('asserts no pair the stylesheet does not use', () => {
    expect(
      [...asserted].filter((pair) => !stylesheetPairs(readStylesheet()).has(pair)).toSorted(byName),
    ).toEqual([])
  })

  it('control: a key added to a rule without a render row is reported', () => {
    const planted = `${readStylesheet()}\n@layer components.nave { .nave-base-ui-item[data-highlighted] { color: red } }`
    expect([...stylesheetPairs(planted)].filter((pair) => !asserted.has(pair))).toEqual([
      'nave-base-ui-item data-highlighted',
    ])
  })
})
