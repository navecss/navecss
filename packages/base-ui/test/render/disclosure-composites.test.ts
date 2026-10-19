import type { ReactElement } from 'react'

import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import {
  disclosureTriggerDisabled,
  disclosureTriggerDisabledSelectors,
} from '../support/disclosure-disabled.ts'
import { cleanup, render } from '../support/react.ts'
import { loadNave } from '../support/sources.ts'
import { el, need, settle } from '../support/w6-render.ts'

const nave: Source = await loadNave()
afterEach(cleanup)

const trigger = (): ReactElement =>
  el(
    nave,
    'collapsible',
    'Root',
    { disabled: true },
    el(nave, 'collapsible', 'Trigger', {}, 'More'),
  )

// The README's sentence on a disabled disclosure trigger at Base UI 1.9.0 names the parts that
// still add `aria-disabled` to a disabled button inside them, so the trigger's disabled rule
// reaches it there. These rows hold that list against what Base UI renders; at the floor every
// placement carries `aria-disabled` anyway.
describe('a disabled disclosure trigger inside the parts that add aria-disabled', () => {
  const INSIDE = {
    'Toolbar.Root': () => el(nave, 'toolbar', 'Root', {}, trigger()),
    ToggleGroup: () => el(nave, 'toggle-group', '.', {}, trigger()),
    RadioGroup: () => el(nave, 'radio-group', '.', {}, trigger()),
    'Tabs.List': () =>
      el(nave, 'tabs', 'Root', { defaultValue: 'a' }, el(nave, 'tabs', 'List', {}, trigger())),
    Menubar: () => el(nave, 'menubar', '.', {}, trigger()),
    'NavigationMenu.List': () =>
      el(nave, 'navigation-menu', 'Root', {}, el(nave, 'navigation-menu', 'List', {}, trigger())),
  } as const

  it.each(Object.entries(INSIDE))(
    'inside %s it carries aria-disabled and the disabled rule reaches it',
    async (_name, tree) => {
      await render(tree())
      const collapsible = need('Collapsible.Trigger')
      expect(collapsible.getAttribute('aria-disabled')).toBe('true')
      expect(
        disclosureTriggerDisabledSelectors().some((selector) => collapsible.matches(selector)),
      ).toBe(true)
    },
  )

  it('inside the open NavigationMenu.Content it carries aria-disabled and the disabled rule reaches it', async () => {
    const content = el(nave, 'navigation-menu', 'Content', {}, trigger())
    const navTrigger = el(nave, 'navigation-menu', 'Trigger', {}, 'Open')
    const item = el(nave, 'navigation-menu', 'Item', { value: 'a' }, navTrigger, content)
    const popup = el(nave, 'navigation-menu', 'Popup', {}, el(nave, 'navigation-menu', 'Viewport'))
    const positioner = el(nave, 'navigation-menu', 'Positioner', {}, popup)
    const portal = el(nave, 'navigation-menu', 'Portal', {}, positioner)
    const list = el(nave, 'navigation-menu', 'List', {}, item)
    await render(el(nave, 'navigation-menu', 'Root', { defaultValue: 'a' }, list, portal))
    await settle()
    const collapsible = need('Collapsible.Trigger')
    expect(collapsible.getAttribute('aria-disabled')).toBe('true')
    expect(
      disclosureTriggerDisabledSelectors().some((selector) => collapsible.matches(selector)),
    ).toBe(true)
  })

  it('inside Tabs.Panel, which is not one of them, it follows the run like a bare one', async () => {
    const panel = el(nave, 'tabs', 'Panel', { value: 'a' }, trigger())
    await render(el(nave, 'tabs', 'Root', { defaultValue: 'a' }, panel))
    const collapsible = need('Collapsible.Trigger')
    expect(collapsible.getAttribute('aria-disabled') === 'true').toBe(
      disclosureTriggerDisabled().aria,
    )
  })
})
