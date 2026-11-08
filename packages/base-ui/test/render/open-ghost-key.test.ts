/**
 * AC-base-ui-overlay-completion-52, first scenario: the open ghost key fills a popup trigger and
 * nothing else. The key is read from the built stylesheet, its `&` resolved to the button class,
 * and put to `matches()` on triggers that carry Base UI's own parts with Nave's ghost `Button` as
 * their `render`, so `nave-base-ui-button` is the only Nave class on them.
 */
/* eslint-disable unicorn/max-nested-calls -- a tree is written as the nested calls it renders */
import type { ReactElement } from 'react'

import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { cleanup, render, user } from '../support/react.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { flattenRules, readStylesheet } from '../support/stylesheet.ts'
import { menubarTree, menuTree, selectTree } from '../support/w6-menus.ts'
import { dialogTree, popoverTree } from '../support/w6-overlays.ts'
import { el, need, partOf, settle } from '../support/w6-render.ts'

const nave: Source = await loadNave()
const bare: Source = await loadBare()
afterEach(cleanup)

const BUTTON = 'nave-base-ui-button'

/**
 * R9's key as the built stylesheet holds it: the one selector of the button that names
 * `aria-expanded`.
 */
const openGhostSelector = (): string => {
  const keys = flattenRules(readStylesheet())
    .filter((item) => item.owner === BUTTON)
    .flatMap((item) => item.selectors)
    .filter((selector) => selector.includes('aria-expanded'))
  expect(keys, 'one key of the button names aria-expanded').toHaveLength(1)
  return keys[0]!
}

/**
 * Nave's ghost `Button`, the `render` of a Base UI trigger part.
 */
const ghost = (): ReactElement =>
  createElement(partOf(nave, 'button', '.') as never, { variant: 'ghost' } as never)

const asGhost: Props = { render: ghost() }

/**
 * The menu trees add `variant: 'ghost'` to the Menubar's trigger; Base UI's own part would pass
 * that through to the DOM, so it is taken off here.
 */
const menubarGhost: Props = { ...asGhost, variant: undefined }

const disclosureTree = (subpath: 'accordion' | 'collapsible'): ReactElement =>
  subpath === 'collapsible'
    ? el(
        bare,
        'collapsible',
        'Root',
        {},
        el(bare, 'collapsible', 'Trigger', asGhost, 'Toggle'),
        el(bare, 'collapsible', 'Panel', {}, 'Panel'),
      )
    : el(
        bare,
        'accordion',
        'Root',
        {},
        el(
          bare,
          'accordion',
          'Item',
          { value: 'a' },
          el(bare, 'accordion', 'Header', {}, el(bare, 'accordion', 'Trigger', asGhost, 'Toggle')),
          el(bare, 'accordion', 'Panel', {}, 'Panel'),
        ),
      )

const navigationMenuTree = (): ReactElement =>
  el(
    bare,
    'navigation-menu',
    'Root',
    {},
    el(
      bare,
      'navigation-menu',
      'List',
      {},
      el(
        bare,
        'navigation-menu',
        'Item',
        { value: 'guides' },
        el(bare, 'navigation-menu', 'Trigger', asGhost, 'Guides'),
        el(bare, 'navigation-menu', 'Content', {}, 'Content'),
      ),
    ),
    el(
      bare,
      'navigation-menu',
      'Portal',
      {},
      el(
        bare,
        'navigation-menu',
        'Positioner',
        {},
        el(bare, 'navigation-menu', 'Popup', {}, el(bare, 'navigation-menu', 'Viewport', {})),
      ),
    ),
  )

interface Part {
  readonly name: string
  readonly marker: string
  readonly tree: () => ReactElement
}

/**
 * The popup triggers R9 is for: its key fills them.
 */
const POPUP_PARTS: readonly Part[] = [
  {
    name: 'Menu.Trigger',
    marker: 'Menu.Trigger',
    tree: () => menuTree(bare, bare, { Trigger: asGhost }),
  },
  {
    name: 'Menu.Trigger in a Menubar',
    marker: 'Menu.Trigger',
    tree: () => menubarTree(bare, bare, { Trigger: menubarGhost }),
  },
  {
    name: 'Popover.Trigger',
    marker: 'Popover.Trigger',
    tree: () => popoverTree(bare, { Trigger: asGhost }),
  },
  {
    name: 'Dialog.Trigger',
    marker: 'Dialog.Trigger',
    tree: () => dialogTree(bare, 'dialog', { Trigger: asGhost }),
  },
  {
    name: 'AlertDialog.Trigger',
    marker: 'AlertDialog.Trigger',
    tree: () => dialogTree(bare, 'alert-dialog', { Trigger: asGhost }),
  },
]

/**
 * The triggers outside "menu, popover or dialog": a disclosure, a Navigation Menu and a Select.
 */
const OTHER_PARTS: readonly (Part & { readonly haspopup: string | undefined })[] = [
  {
    name: 'Collapsible.Trigger',
    marker: 'Collapsible.Trigger',
    haspopup: undefined,
    tree: () => disclosureTree('collapsible'),
  },
  {
    name: 'Accordion.Trigger',
    marker: 'Accordion.Trigger',
    haspopup: undefined,
    tree: () => disclosureTree('accordion'),
  },
  {
    name: 'NavigationMenu.Trigger',
    marker: 'NavigationMenu.Trigger',
    haspopup: undefined,
    tree: navigationMenuTree,
  },
  {
    name: 'Select.Trigger',
    marker: 'Select.Trigger',
    haspopup: 'listbox',
    tree: () => selectTree(bare, { Trigger: asGhost }),
  },
]

const button = async (attributes: Props): Promise<HTMLElement> => {
  await render(
    createElement(
      partOf(nave, 'button', '.') as never,
      {
        'aria-expanded': true,
        'data-part': 'Button',
        variant: 'ghost',
        ...attributes,
      } as never,
    ),
  )
  return need('Button')
}

const naveClasses = (element: Element): string[] =>
  [...element.classList].filter((name) => name.startsWith('nave-'))

const openByClick = async (marker: string): Promise<HTMLElement> => {
  const trigger = need(marker)
  await user().click(trigger)
  await settle()
  return trigger
}

describe('AC-base-ui-overlay-completion-52: the open ghost key fills a popup trigger and nothing else', () => {
  it.each(POPUP_PARTS)('is true on an open ghost $name', async ({ marker, tree }) => {
    await render(tree())
    const trigger = await openByClick(marker)

    expect(naveClasses(trigger)).toEqual([BUTTON])
    expect(trigger.dataset.naveVariant).toBe('ghost')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.matches(openGhostSelector())).toBe(true)
  })

  it.each(OTHER_PARTS)(
    'is false on an open ghost $name, which still carries the variant and aria-expanded',
    async ({ haspopup, marker, tree }) => {
      await render(tree())
      const trigger = await openByClick(marker)

      expect(naveClasses(trigger)).toEqual([BUTTON])
      expect(trigger.dataset.naveVariant).toBe('ghost')
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      expect(trigger.getAttribute('aria-haspopup') ?? undefined).toBe(haspopup)
      expect(trigger.matches(openGhostSelector())).toBe(false)
    },
  )

  describe('on a bare ghost Button with aria-expanded set by hand', () => {
    it.each(['menu', 'true', 'dialog'])('is true with aria-haspopup="%s"', async (value) => {
      const trigger = await button({ 'aria-haspopup': value })
      expect(trigger.matches(openGhostSelector())).toBe(true)
    })

    it.each(['listbox', 'tree', 'grid', 'false'])(
      'is false with aria-haspopup="%s"',
      async (value) => {
        const trigger = await button({ 'aria-haspopup': value })
        expect(trigger.matches(openGhostSelector())).toBe(false)
      },
    )

    it('is false with the attribute absent', async () => {
      const trigger = await button({})
      expect(trigger.matches(openGhostSelector())).toBe(false)
    })

    it('is false with aria-expanded="false" beside aria-haspopup="menu"', async () => {
      const trigger = await button({ 'aria-expanded': false, 'aria-haspopup': 'menu' })

      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(trigger.matches(openGhostSelector())).toBe(false)
    })
  })
})
