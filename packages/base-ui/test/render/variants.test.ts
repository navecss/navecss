import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { cleanup, render } from '../support/react.ts'
import { renderScene } from '../support/rows.ts'
import { scenes } from '../support/scenes.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { tableP } from '../support/table-p.ts'

const nave: Source = await loadNave()
afterEach(cleanup)

const VARIANT_PARTS = [
  ['button', 'Button'],
  ['toolbar', 'Toolbar.Button'],
  ['dialog', 'Dialog.Trigger'],
  ['dialog', 'Dialog.Close'],
  ['popover', 'Popover.Trigger'],
  ['popover', 'Popover.Close'],
  ['menu', 'Menu.Trigger'],
  ['menubar', 'Menu.Trigger'],
  ['tooltip', 'Tooltip.Trigger'],
  ['alert-dialog', 'AlertDialog.Trigger'],
  ['alert-dialog', 'AlertDialog.Close'],
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
  {
    expected: { 'data-nave-variant': 'ghost' },
    label: 'variant="ghost"',
    props: { variant: 'ghost' },
  },
  { expected: { 'data-nave-size': 'sm' }, label: 'size="sm"', props: { size: 'sm' } },
  {
    expected: { 'data-nave-size': 'sm', 'data-nave-variant': 'ghost' },
    label: 'variant="ghost" size="sm"',
    props: { size: 'sm', variant: 'ghost' },
  },
  { expected: {}, label: 'the defaults spelled out', props: { size: 'md', variant: 'secondary' } },
  { expected: {}, label: 'size="md"', props: { size: 'md' } },
]

const naveAttributes = (element: Element): Record<string, string> =>
  Object.fromEntries(
    [...element.attributes]
      .filter(({ name }) => name.startsWith('data-nave-'))
      .map(({ name, value }) => [name, value]),
  )

// The Toggle has no variant, so a case that sets one does not apply to it.
const casesFor = (part: string): typeof CASES =>
  CASES.filter(({ props }) => part !== 'Toggle' || !('variant' in props))

describe('AC-base-ui-overlay-completion-04: variants render as data-nave-* only off the default, never as DOM props', () => {
  for (const [subpath, part] of [...VARIANT_PARTS, ['toggle', 'Toggle'] as const]) {
    for (const { expected, label, props } of casesFor(part)) {
      it(`${subpath}: ${part} with ${label}`, async () => {
        const scene = scenes[subpath]
        if (scene === undefined) {
          throw new Error(`no scene for ${subpath}`)
        }
        await render(scene.render(nave, { props: { ...openProps(), [part]: props } }))
        const elements = partsNamed(part)
        expect(elements.length, `${part} rendered`).toBeGreaterThan(0)
        // The Menubar holds two menus, and the props reach both triggers.
        for (const element of elements) {
          expect(naveAttributes(element)).toEqual(expected)
          expect(element.hasAttribute('variant')).toBe(false)
          expect(element.hasAttribute('size')).toBe(false)
        }
      })
    }
  }

  it('Toggle given a variant (a type error) renders no variant: it carries data-nave-size alone', async () => {
    await renderScene(nave, 'toggle', { Toggle: { size: 'sm', variant: 'primary' } })
    const toggle = partsNamed('Toggle')[0]
    expect(toggle, 'Toggle rendered').toBeDefined()
    expect(toggle === undefined ? [] : naveAttributes(toggle)).toEqual({ 'data-nave-size': 'sm' })
    expect(toggle?.hasAttribute('variant')).toBe(false)
  })
})

/**
 * The parts of the six that carry a trigger or a clear control but are not in the Button family:
 * what each takes is Table P's row for it (none, none, and the two classes of the Combobox's).
 */
const OTHER_TRIGGERS = [
  ['context-menu', 'ContextMenu.Trigger'],
  ['preview-card', 'PreviewCard.Trigger'],
  ['combobox', 'Combobox.Trigger'],
  ['combobox', 'Combobox.Clear'],
  ['autocomplete', 'Autocomplete.Trigger'],
  ['autocomplete', 'Autocomplete.Clear'],
] as const

describe("AC-base-ui-overlay-completion-04: the six's other triggers are not Button-family", () => {
  for (const [subpath, part] of OTHER_TRIGGERS) {
    it(`${part} carries no data-nave-* attribute and not the button class`, async () => {
      await renderScene(nave, subpath, openProps())
      const elements = partsNamed(part)
      expect(elements.length, `${part} rendered`).toBeGreaterThan(0)
      for (const element of elements) {
        expect(naveAttributes(element)).toEqual({})
        expect(element.classList.contains('nave-base-ui-button')).toBe(false)
        expect(element.className.split(/\s+/).filter((name) => name.startsWith('nave-'))).toEqual(
          tableP.get(part) ?? [],
        )
      }
    })

    it(`${part} given variant and size renders neither as an attribute`, async () => {
      await renderScene(nave, subpath, {
        ...openProps(),
        [part]: { size: 'sm', variant: 'primary' },
      })
      for (const element of partsNamed(part)) {
        expect(naveAttributes(element)).toEqual({})
        expect(element.classList.contains('nave-base-ui-button')).toBe(false)
      }
    })
  }

  it('control: a Button-family part in the same renders does carry the attribute and the class', async () => {
    await renderScene(nave, 'alert-dialog', {
      ...openProps(),
      'AlertDialog.Trigger': { variant: 'primary' },
    })
    const [trigger] = partsNamed('AlertDialog.Trigger')
    expect(trigger === undefined ? {} : naveAttributes(trigger)).toEqual({
      'data-nave-variant': 'primary',
    })
    expect(trigger?.classList.contains('nave-base-ui-button')).toBe(true)
  })
})
