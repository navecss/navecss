/**
 * AC-secondary-action-states-22, Tier A: the registry regenerates the states for the items whose
 * parts use the Button or Toggle atoms, and only those, into `@layer components.consumer`.
 */
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { modulesOf, normalizeSelector } from './support/registry/css-rules.ts'
import { loadRegistry } from './support/registry/load.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'
import { ACTIVE_VALUE, BUTTON_KEYS, HOVER_VALUE, TOGGLE_KEYS } from './support/secondary-states.ts'

const WITH_STATES = [
  'alert-dialog',
  'button',
  'dialog',
  'menu',
  'popover',
  'toast',
  'toggle',
  'tooltip',
  'toolbar',
]
const NAMES_A_STATE = /--nave-color-action-secondary-(?:hover|active)(?![\w-])/

const byText = (a: string, b: string): number => a.localeCompare(b)

const ATOM_KEYS = {
  baseUiButton: { local: 'button', keys: BUTTON_KEYS },
  baseUiToggle: { local: 'toggle', keys: TOGGLE_KEYS },
} as const
const ATOM_NAMES: readonly string[] = Object.keys(ATOM_KEYS)

/**
The state keys a module's class carries in the consumer layer, with the value each sets.
 */
const stateRulesOf = (css: string, local: string): string[] => {
  const found: string[] = []
  postcss.parse(css).walkAtRules('layer', (layer) => {
    if (layer.params !== 'components.consumer') return
    layer.walkRules(`.${local}`, (rule) => {
      for (const node of rule.nodes) {
        if (node.type !== 'rule') continue
        const fill = node.nodes.find(
          (decl) => decl.type === 'decl' && decl.prop === 'background-color',
        )
        if (fill?.type === 'decl' && NAMES_A_STATE.test(fill.value)) {
          found.push(`${normalizeSelector(node.selector)} | ${fill.value}`)
        }
      }
    })
  })
  return found
}

const wanted = (keys: readonly string[]): string[] =>
  keys.map(
    (key, index) => `${normalizeSelector(key)} | ${index === 0 ? HOVER_VALUE : ACTIVE_VALUE}`,
  )

describe('AC-secondary-action-states-22: the registry regenerates the states for the items that use the two atoms, and only those', () => {
  const { found, problems } = modulesOf(loadRegistry())

  it('finds every styled item', () => {
    expect(problems).toEqual([])
  })

  it('has exactly nine items whose parts use baseUiButton or baseUiToggle', () => {
    const users = found
      .filter((item) => item.atomNames.some((name) => ATOM_NAMES.includes(name)))
      .map((item) => item.subpath)

    expect(users.toSorted(byText)).toEqual(WITH_STATES.toSorted(byText))
  })

  it("carries each used atom's two keys, in order, in the consumer layer, and names the states nowhere else", () => {
    for (const item of found) {
      for (const [atom, { keys, local }] of Object.entries(ATOM_KEYS)) {
        const expected = item.atomNames.includes(atom) ? wanted(keys) : []

        expect(stateRulesOf(item.content, local), `${item.label} ${local}`).toEqual(expected)
      }
      const isUses = item.atomNames.some((name) => ATOM_NAMES.includes(name))

      expect(NAMES_A_STATE.test(item.content), item.label).toBe(isUses)
    }
  })

  it("floors every item's tokens peer at the manifest's raised range", () => {
    const range = manifestOf().peerDependencies['@navecss/tokens']

    for (const item of found) {
      const peers = (item.item.meta?.peerDependencies ?? {}) as Record<string, string>

      expect(peers['@navecss/tokens'], item.label).toBe(range)
    }
  })
})
