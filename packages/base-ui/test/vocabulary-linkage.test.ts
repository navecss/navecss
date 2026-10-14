import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { type FlatDeclaration, flatten, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import {
  GUARD_PAIRS,
  METER_INDICATOR_EXEMPT,
  ROW_PAIRS,
  TIER_B_PAIRS,
} from './support/vocabulary-pairs.ts'

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

// The pairs jsdom cannot produce, asserted by browser rows that name their criterion (AC-39).
const tierB = new Map(
  TIER_B_PAIRS.map(([[cls, item], id]): [string, string] => [`${cls} ${item}`, id]),
)

/**
 * The `&[data-instant]` key of the reduced-motion guard on the three motion classes whose parts do
 * not declare the attribute at every minor: no row can assert a key that matches nothing there.
 */
const exempt = new Set(GUARD_PAIRS.map(([cls, item]) => `${cls} ${item}`))

const unasserted = (css: string): string[] =>
  [...stylesheetPairs(css)]
    .filter((pair) => !asserted.has(pair) && !exempt.has(pair) && !tierB.has(pair))
    .toSorted(byName)

const BROWSER_DIR = path.join(PACKAGE_DIR, 'test/browser')

/**
 * The browser test files that carry a criterion id and name the item, so a Tier B pair is
 * asserted by a row that exists and says which criterion it serves.
 */
const browserRowsFor = (id: string, item: string): string[] =>
  readdirSync(BROWSER_DIR)
    .filter((file) => file.endsWith('.browser.test.ts'))
    .filter((file) => {
      const text = readFileSync(path.join(BROWSER_DIR, file), 'utf8')
      return text.includes(id) && text.includes(item)
    })

describe('AC-base-ui-feedback-navigation-39 (second scenario, stylesheet side), AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the stylesheet-to-render linkage is complete', () => {
  it('has a render row for every pair the stylesheet extracts, but the three guard keys', () => {
    expect(unasserted(readStylesheet())).toEqual([])
  })

  it('extracts the pairs the new classes add, each of which a row asserts (the positive control for the check above)', () => {
    const used = stylesheetPairs(readStylesheet())
    const added = [
      'nave-base-ui-current-link aria-current',
      'nave-base-ui-navigation-menu-fade data-ending-style',
      'nave-base-ui-navigation-menu-fade data-starting-style',
      'nave-base-ui-navigation-menu-icon aria-expanded',
      'nave-base-ui-navigation-menu-trigger aria-disabled',
      'nave-base-ui-scroll-area-scrollbar data-orientation',
      'nave-base-ui-scroll-area-thumb data-orientation',
      'nave-base-ui-toast-fade data-ending-style',
      'nave-base-ui-toast-fade data-starting-style',
      'nave-base-ui-toast-fade data-swipe-direction',
      'nave-base-ui-toast-limit data-limited',
      'nave-base-ui-scroll-area-viewport data-has-overflow-x',
      'nave-base-ui-scroll-area-viewport data-has-overflow-y',
      'nave-base-ui-value-bar-indicator data-indeterminate',
    ]

    expect(added.filter((pair) => !used.has(pair))).toEqual([])
    expect(added.filter((pair) => !asserted.has(pair) && !tierB.has(pair))).toEqual([])
  })

  it('asserts the three pairs jsdom cannot produce in Tier B rows, each named in a browser test that carries its criterion', () => {
    const used = stylesheetPairs(readStylesheet())

    const pairs = tierB.keys().toArray()

    expect(pairs.filter((pair) => !used.has(pair))).toEqual([])
    expect(pairs.filter((pair) => asserted.has(pair))).toEqual([])
    expect(
      [...tierB]
        .filter(([pair, id]) => browserRowsFor(id, pair.split(' ', 2)[1] ?? '').length === 0)
        .map(([pair, id]) => `${pair} has no row in a browser test naming ${id}`),
    ).toEqual([])
  })

  it('exempts one (class, part) pair, the indeterminate key on Meter.Indicator, and its (class, item) pair is still asserted by Progress.Indicator', () => {
    const [cls, item] = METER_INDICATOR_EXEMPT.pair

    expect(METER_INDICATOR_EXEMPT.part).toBe('Meter.Indicator')
    expect(stylesheetPairs(readStylesheet()).has(`${cls} ${item}`)).toBe(true)
    expect(asserted.has(`${cls} ${item}`)).toBe(true)
    expect(exempt.has(`${cls} ${item}`)).toBe(false)
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

  it('control: a key planted in a new class without a render row is reported, and so is a Tier B pair whose browser row is dropped', () => {
    const planted = `${readStylesheet()}\n@layer components.nave { .nave-base-ui-toast-root[data-type] { color: red } .nave-base-ui-current-link[data-active] { color: red } }`

    expect(unasserted(planted)).toEqual([
      'nave-base-ui-current-link data-active',
      'nave-base-ui-toast-root data-type',
    ])
    expect(browserRowsFor('AC-base-ui-feedback-navigation-15', 'data-no-such-attribute')).toEqual(
      [],
    )
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
