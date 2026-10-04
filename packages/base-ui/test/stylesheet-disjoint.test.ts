import { describe, expect, it } from 'vitest'

import { compare, isMutuallyExclusive, selectorSpecificity } from './support/selector.ts'
import { flatten, readStylesheet, resolveAgainst } from './support/stylesheet.ts'
import { tableP } from './support/table-p.ts'

const PREFIX = 'nave-base-ui-'

interface SettingRule {
  readonly owner: string
  readonly selector: string
  readonly properties: Set<string>
}

/**
Every rule of a stylesheet with the properties it sets, its selector resolved against its class.
A rule with a selector list is one rule per alternative, since each is judged on its own.
 */
const settingRules = (css: string): SettingRule[] => {
  const byRule = new Map<string, SettingRule>()
  for (const item of flatten(css)) {
    let selectors = [`.${item.owner}`]
    for (const list of item.selectors.slice(1)) selectors = resolveAgainst(selectors, list)
    for (const selector of selectors) {
      const key = `${item.owner}|${selector}`
      const known = byRule.get(key)
      if (known === undefined) {
        byRule.set(key, { owner: item.owner, selector, properties: new Set([item.property]) })
      } else {
        known.properties.add(item.property)
      }
    }
  }
  return byRule.values().toArray()
}

const pairsOf = (classes: readonly string[]): string[][] =>
  classes.flatMap((first, index) => classes.slice(index + 1).map((second) => [first, second]))

/**
 * The class pairs that share a part, from a part-to-classes table.
 */
const sharedPairs = (parts: ReadonlyMap<string, readonly string[]>): string[][] => {
  const pairs = parts
    .values()
    .flatMap((classes) => pairsOf(classes))
    .map((pair): [string, string[]] => [pair.join('|'), pair])
  return new Map(pairs).values().toArray()
}

/**
Each property both classes of a pair set on rules that can match one element, with the specificity of each.
 */
const conflicts = (css: string, parts: ReadonlyMap<string, readonly string[]>): string[] => {
  const rules = settingRules(css)
  return sharedPairs(parts).flatMap(([first = '', second = '']) =>
    rules
      .filter((a) => a.owner === first)
      .flatMap((a) =>
        rules
          .filter((b) => b.owner === second && !isMutuallyExclusive(a.selector, b.selector))
          .flatMap((b) =>
            [...a.properties]
              .filter((property) => b.properties.has(property))
              .map((property) => {
                const [x, y] = [selectorSpecificity(a.selector), selectorSpecificity(b.selector)]
                return `${property}: ${a.selector} (${x.join(',')}) against ${b.selector} (${y.join(',')}, ${compare(x, y) === 0 ? 'equal' : 'unequal'})`
              }),
          ),
      ),
  )
}

describe('AC-base-ui-bridge-08: the disjointness rule has an instrument, and it bites', () => {
  it('finds exactly one shared-part pair in v1, the disclosure trigger with its icon, and no conflict', () => {
    expect(sharedPairs(tableP)).toEqual([
      [`${PREFIX}disclosure-trigger`, `${PREFIX}disclosure-icon`],
    ])
    expect(conflicts(readStylesheet(), tableP)).toEqual([])
  })

  it('reports a highlight rule on Menu.Item against the item disabled colour, at equal specificity (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item-highlight { &[data-highlighted] { color: x } } }`
    const parts = new Map(tableP).set('Menu.Item', [`${PREFIX}item`, `${PREFIX}item-highlight`])

    expect(conflicts(css, parts)).toEqual([
      `color: .${PREFIX}item[aria-disabled="true"] (0,2,0) against .${PREFIX}item-highlight[data-highlighted] (0,2,0, equal)`,
    ])
  })

  it('does not report the same rule once it excludes the disabled state with :not() (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item-highlight { &[data-highlighted]:not([aria-disabled="true"]) { color: x } } }`
    const parts = new Map(tableP).set('Menu.Item', [`${PREFIX}item`, `${PREFIX}item-highlight`])

    expect(conflicts(css, parts)).toEqual([])
  })

  it('joins a nested selector with no & to its parent as a descendant (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item-highlight { [data-highlighted] { color: x } } }`
    const parts = new Map(tableP).set('Menu.Item', [`${PREFIX}item`, `${PREFIX}item-highlight`])

    expect(conflicts(css, parts)).toEqual([
      `color: .${PREFIX}item[aria-disabled="true"] (0,2,0) against .${PREFIX}item-highlight [data-highlighted] (0,2,0, equal)`,
    ])
  })

  it('judges every branch of a selector list, not only the first (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item-highlight { &[data-highlighted]:not([aria-disabled="true"]), &[data-highlighted] { color: x } } }`
    const parts = new Map(tableP).set('Menu.Item', [`${PREFIX}item`, `${PREFIX}item-highlight`])

    expect(conflicts(css, parts)).toEqual([
      `color: .${PREFIX}item[aria-disabled="true"] (0,2,0) against .${PREFIX}item-highlight[data-highlighted] (0,2,0, equal)`,
    ])
  })

  it('does not read a :not() holding two attributes as excluding either one (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item-highlight { &[data-highlighted]:not([aria-disabled="true"][data-side="top"]) { color: x } } }`
    const parts = new Map(tableP).set('Menu.Item', [`${PREFIX}item`, `${PREFIX}item-highlight`])

    expect(conflicts(css, parts)).toHaveLength(1)
  })
})
