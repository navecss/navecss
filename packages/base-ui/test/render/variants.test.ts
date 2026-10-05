import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'

let nave: Source
beforeAll(async () => {
  nave = await loadNave()
})
afterEach(cleanup)

const VARIANT_PARTS = [
  ['button', 'Button'],
  ['toolbar', 'Toolbar.Button'],
  ['dialog', 'Dialog.Trigger'],
  ['dialog', 'Dialog.Close'],
  ['popover', 'Popover.Trigger'],
  ['popover', 'Popover.Close'],
  ['menu', 'Menu.Trigger'],
  ['tooltip', 'Tooltip.Trigger'],
] as const

const CASES: readonly {
  expected: Record<string, string | undefined>
  label: string
  props: Props
}[] = [
  { expected: {}, label: 'no variant props', props: {} },
  {
    expected: { 'data-nave-variant': 'primary' },
    label: 'variant="primary"',
    props: { variant: 'primary' },
  },
  { expected: { 'data-nave-size': 'sm' }, label: 'size="sm"', props: { size: 'sm' } },
  { expected: {}, label: 'the defaults spelled out', props: { size: 'md', variant: 'secondary' } },
]

const naveAttributes = (element: Element): Record<string, string> =>
  Object.fromEntries(
    [...element.attributes]
      .filter(({ name }) => name.startsWith('data-nave-'))
      .map(({ name, value }) => [name, value]),
  )

describe('AC-base-ui-bridge-14: variants render as data-nave-* only off the default, never as DOM props', () => {
  for (const [subpath, part] of [...VARIANT_PARTS, ['toggle', 'Toggle'] as const]) {
    for (const { expected, label, props } of CASES) {
      const isToggle = part === 'Toggle'
      if (isToggle && 'variant' in props) {
        continue
      }
      it(`${part} with ${label}`, async () => {
        const scene = scenes[subpath]
        if (scene === undefined) {
          throw new Error(`no scene for ${subpath}`)
        }
        await render(scene.render(nave, { props: { ...openProps(), [part]: props } }))
        const [element] = partsNamed(part)
        expect(element, `${part} rendered`).toBeDefined()
        if (element === undefined) {
          return
        }
        expect(naveAttributes(element)).toEqual(expected)
        expect(element.hasAttribute('variant')).toBe(false)
        expect(element.hasAttribute('size')).toBe(false)
      })
    }
  }
})
