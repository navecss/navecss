import { describe, expect, it } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { flatten, readStylesheet } from './support/stylesheet.ts'
import { ROW_PAIRS } from './support/vocabulary-pairs.ts'

/**
 * The (class, item) pairs the stylesheet's rules key on: every attribute name in every selector
 * and every Base UI variable in every value, by the class that owns the rule. `data-nave-*` is
 * Nave's own and is asserted by the variants rows.
 */
const stylesheetPairs = (css: string): Set<string> => {
  const found = new Set<string>()
  for (const { owner, selectors, value } of flatten(css)) {
    for (const selector of selectors) {
      for (const { name } of attributeReads(selector)) {
        if (!name.startsWith('data-nave-')) {
          found.add(`${owner} ${name}`)
        }
      }
    }
    for (const match of value.matchAll(/var\((--[\w-]+)/g)) {
      if (!(match[1] ?? '').startsWith('--nave-')) {
        found.add(`${owner} ${match[1]}`)
      }
    }
  }
  return found
}

const asserted = new Set(
  Object.values(ROW_PAIRS)
    .flat()
    .map(([cls, item]) => `${cls} ${item}`),
)

describe('AC-base-ui-bridge-22: the stylesheet-to-render linkage is complete', () => {
  it('has a render row for every pair the stylesheet extracts', () => {
    expect(
      [...stylesheetPairs(readStylesheet())].filter((pair) => !asserted.has(pair)).toSorted(),
    ).toEqual([])
  })

  it('asserts no pair the stylesheet does not use', () => {
    expect(
      [...asserted].filter((pair) => !stylesheetPairs(readStylesheet()).has(pair)).toSorted(),
    ).toEqual([])
  })

  it('control: a key added to a rule without a render row is reported', () => {
    const planted = `${readStylesheet()}\n@layer components.nave { .nave-base-ui-item[data-highlighted] { color: red } }`
    expect([...stylesheetPairs(planted)].filter((pair) => !asserted.has(pair))).toEqual([
      'nave-base-ui-item data-highlighted',
    ])
  })
})
