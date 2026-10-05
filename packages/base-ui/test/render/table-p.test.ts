import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { marked } from '../support/dom.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { SUBPATHS, topName } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'
import { inT0 } from '../support/table-t0.ts'

let bare: Source
let nave: Source

beforeAll(async () => {
  bare = await loadBare()
  nave = await loadNave()
})
afterEach(cleanup)

/**
 * Every key of every v1 component that is in neither Table P nor Table T0, or in both.
 */
const unplaced = (keys: readonly string[]): string[] =>
  keys.filter((part) => (tableP.has(part) ? 1 : 0) + (inT0(part) ? 1 : 0) !== 1)

const keysAt = (source: Source, subpath: string): string[] => {
  const ui = source(subpath)
  const top = topName(subpath)
  return typeof ui === 'object' &&
    Object.keys(ui).some((key) => /^[A-Z]/.test(key) || key === 'createHandle')
    ? Object.keys(ui).map((key) => `${top}.${key}`)
    : [top]
}

describe('AC-base-ui-bridge-04: every part of every v1 component is either styled or deliberately not', () => {
  it('places every key of Base UI at this run in exactly one of the two tables', () => {
    expect(SUBPATHS.flatMap((subpath) => unplaced(keysAt(bare, subpath)))).toEqual([])
  })

  it('control: a part added to a namespace and absent from both tables is reported', () => {
    expect(unplaced([...keysAt(bare, 'dialog'), 'Dialog.Drawer'])).toEqual(['Dialog.Drawer'])
  })

  it('gives every rendered part exactly its row, and every unstyled part no Nave class', async () => {
    const problems: string[] = []
    const seen = new Set<string>()
    for (const subpath of SUBPATHS) {
      const scene = scenes[subpath]
      if (scene === undefined) {
        problems.push(`${subpath} has no scene`)
        continue
      }
      await render(
        scene.render(nave, {
          props: {
            ...openProps(),
            'Accordion.Root': { defaultValue: ['a'] },
            'Collapsible.Root': { defaultOpen: true },
          },
        }),
      )
      for (const { element, part } of marked()) {
        seen.add(part)
        const naveClasses = element.className
          .split(/\s+/)
          .filter((name) => name.startsWith('nave-'))
        const expected = tableP.get(part) ?? []
        if (naveClasses.join(' ') !== expected.join(' ')) {
          problems.push(
            `${part}: classes [${naveClasses.join(' ')}], expected [${expected.join(' ')}]`,
          )
        }
      }
    }
    expect(problems).toEqual([])
    // Every row's part that this Base UI has was rendered, so no row passed without being looked at.
    const present = new Set(SUBPATHS.flatMap((subpath) => keysAt(bare, subpath)))
    expect([...tableP.keys()].filter((part) => present.has(part) && !seen.has(part))).toEqual([])
  })
})
