import { afterEach, describe, expect, it } from 'vitest'

import { partsNamed } from '../support/dom.ts'
import { cleanup, user } from '../support/react.ts'
import {
  BASE,
  type Feedback,
  inlineStyle,
  loadFeedback,
  naveClasses,
  nonTranslationStyles,
  settle,
  sorted,
  until,
} from '../support/w10-feedback.ts'
import {
  type NavigationMenuSceneOptions,
  renderNavigationMenu,
  triggerOf as trigger,
} from '../support/w10-navigation-scene.ts'

const feedback: Feedback = await loadFeedback()
afterEach(cleanup)

/**
 * Opens the first item by a click on its trigger and waits for the Popup with its panel.
 */
const open = async (options: NavigationMenuSceneOptions = {}): Promise<void> => {
  await renderNavigationMenu(feedback, options)
  await user().click(trigger())
  await until('the popup to open', () => partsNamed('NavigationMenu.Popup').length === 1)
  await settle()
}

describe('AC-base-ui-feedback-navigation-22: the icon turns on its trigger aria-expanded (the render half)', () => {
  it('closed, the trigger carries aria-expanded false and the Icon is its direct child carrying nave-base-ui-navigation-menu-icon', async () => {
    await renderNavigationMenu(feedback)
    const icon = partsNamed('NavigationMenu.Icon')[0]!
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(icon.parentElement).toBe(trigger())
    expect(icon.classList.contains(`${BASE}navigation-menu-icon`)).toBe(true)
  })

  it('opened by a click: the trigger carries aria-expanded true, data-popup-open and data-pressed, and the Icon is still its direct child with the class', async () => {
    await open()
    const icon = partsNamed('NavigationMenu.Icon')[0]!
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(trigger().dataset.popupOpen !== undefined).toBe(true)
    expect(trigger().dataset.pressed !== undefined).toBe(true)
    expect(icon.parentElement).toBe(trigger())
    expect(icon.classList.contains(`${BASE}navigation-menu-icon`)).toBe(true)
    // Measured with it: the Icon is hidden from assistive technology and carries the open mark,
    // which no rule keys.
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.dataset.popupOpen !== undefined).toBe(true)
  })

  it('closed by Escape: the trigger carries aria-expanded false again', async () => {
    await open()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await user().keyboard('{Escape}')
    await until('the popup to close', () => partsNamed('NavigationMenu.Popup').length === 0)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().dataset.popupOpen !== undefined).toBe(false)
  })

  it('control: an Icon wrapped in another element is not the trigger direct child, so the parent-keyed rule would miss it', async () => {
    await open({ wrapIcon: true })
    const icon = partsNamed('NavigationMenu.Icon')[0]!
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(icon.parentElement).not.toBe(trigger())
    expect(icon.parentElement?.hasAttribute('aria-expanded')).toBe(false)
    expect(icon.closest('[aria-expanded]')).toBe(trigger())
  })
})

describe('AC-base-ui-feedback-navigation-25: the list keeps its list semantics in the structure Base UI renders (the render half)', () => {
  it('NavigationMenu.Root renders a nav, and NavigationMenu.List a ul whose parent is that nav, carrying nave-base-ui-navigation-menu-list', async () => {
    await renderNavigationMenu(feedback)
    const root = partsNamed('NavigationMenu.Root')[0]!
    const list = partsNamed('NavigationMenu.List')[0]!
    expect(root.tagName).toBe('NAV')
    expect(list.tagName).toBe('UL')
    expect(list.parentElement).toBe(root)
    expect(naveClasses(list)).toEqual([`${BASE}navigation-menu-list`])
  })

  it('the items are li elements of that list, and the Root carries no nave- class', async () => {
    await renderNavigationMenu(feedback)
    const list = partsNamed('NavigationMenu.List')[0]!
    expect([...list.children].map((child) => child.tagName)).toEqual(['LI', 'LI'])
    expect(naveClasses(partsNamed('NavigationMenu.Root')[0])).toEqual([])
  })

  it('control: the open Popup is a nav of its own, outside the list, so one nav is the root and one the popup', async () => {
    await open()
    const popup = partsNamed('NavigationMenu.Popup')[0]!
    expect(popup.tagName).toBe('NAV')
    expect(partsNamed('NavigationMenu.List')[0]!.contains(popup)).toBe(false)
  })
})

describe('AC-base-ui-feedback-navigation-26: the current link is keyed on aria-current page, and every link carries the block padding (the render half of the first scenario)', () => {
  for (const place of ['panel', 'top'] as const) {
    it(`<NavigationMenu.Link active> ${place === 'panel' ? 'in the panel' : 'at the top level'}: the active link carries aria-current page, data-active and both classes; every other link carries both classes and neither attribute`, async () => {
      await open({ activeLink: place })
      const activeName = place === 'panel' ? 'panel-active' : 'top'
      const links = partsNamed('NavigationMenu.Link')
      // A panel with two links and a top-level link: three links, one of them active.
      expect(sorted(links.map((element) => element.dataset.link ?? ''))).toEqual([
        'panel',
        'panel-active',
        'top',
      ])
      for (const element of links) {
        expect(naveClasses(element)).toEqual([`${BASE}current-link`, `${BASE}toolbar-link`])
        const isActive = element.dataset.link === activeName
        expect(element.getAttribute('aria-current') === 'page').toBe(isActive)
        expect(element.hasAttribute('aria-current')).toBe(isActive)
        expect(element.dataset.active !== undefined).toBe(isActive)
      }
    })
  }

  it('control: with no link active no link carries aria-current or data-active, so the keyed attributes come from active', async () => {
    await open()
    for (const element of partsNamed('NavigationMenu.Link')) {
      expect(element.hasAttribute('aria-current')).toBe(false)
      expect(element.dataset.active !== undefined).toBe(false)
    }
  })
})

describe('AC-base-ui-feedback-navigation-39: every new attribute the stylesheet keys on appears where its rule reaches (the Navigation Menu rows)', () => {
  it('Navigation Menu, click a trigger: aria-expanded true on NavigationMenu.Trigger, the Icon its direct child carrying nave-base-ui-navigation-menu-icon', async () => {
    await open()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const icon = partsNamed('NavigationMenu.Icon')[0]!
    expect(icon.parentElement).toBe(trigger())
    expect(icon.classList.contains(`${BASE}navigation-menu-icon`)).toBe(true)
  })

  it('Navigation Menu, <Link active>: aria-current page on NavigationMenu.Link, nave-base-ui-current-link on the carrier', async () => {
    await open({ activeLink: 'panel' })
    const carriers = partsNamed('NavigationMenu.Link').filter(
      (element) => element.getAttribute('aria-current') === 'page',
    )
    expect(carriers.map((element) => element.dataset.link)).toEqual(['panel-active'])
    expect(carriers[0]!.classList.contains(`${BASE}current-link`)).toBe(true)
  })

  for (const side of ['inline-start', 'inline-end']) {
    it(`Navigation Menu (anchored), side ${side}: data-side ${side} on NavigationMenu.Arrow, nave-base-ui-arrow-inline and nave-base-ui-arrow on the carrier`, async () => {
      await open({ side })
      const arrow = partsNamed('NavigationMenu.Arrow')[0]!
      expect(arrow.dataset.side).toBe(side)
      expect(naveClasses(arrow)).toEqual([`${BASE}arrow`, `${BASE}arrow-inline`])
    })
  }
})

describe('AC-base-ui-feedback-navigation-43: positioners and popups carry translation only at rest (the open Navigation Menu)', () => {
  it('the open NavigationMenu.Positioner and NavigationMenu.Popup have no inline opacity, filter, scale or rotate, and any transform is none or a single translate', async () => {
    await open()
    await until('the popup to come to rest', () => {
      const positioner = partsNamed('NavigationMenu.Positioner')[0]
      const popup = partsNamed('NavigationMenu.Popup')[0]
      return (
        positioner !== undefined &&
        popup !== undefined &&
        inlineStyle(positioner).has('--anchor-width') &&
        popup.dataset.startingStyle === undefined &&
        popup.dataset.endingStyle === undefined
      )
    })
    const positioner = partsNamed('NavigationMenu.Positioner')[0]!
    const popup = partsNamed('NavigationMenu.Popup')[0]!
    expect(nonTranslationStyles(positioner)).toEqual([])
    expect(nonTranslationStyles(popup)).toEqual([])
    // The control that the Positioner examined is the placed one: Base UI gives it an inline
    // position (and no transform, which the check admits).
    expect(inlineStyle(positioner).get('position')).toBe('absolute')
  })

  it('control: a popup that still carries an inline fade, a scale or a rotation is reported, and a single translation is admitted', () => {
    const element = document.createElement('nav')
    element.setAttribute('style', 'opacity: 0; filter: blur(2px); scale: 2; rotate: 3deg')
    expect(nonTranslationStyles(element)).toEqual(['opacity', 'filter', 'scale', 'rotate'])
    element.setAttribute('style', 'transform: translate(12px, 8px)')
    expect(nonTranslationStyles(element)).toEqual([])
    element.setAttribute('style', 'transform: none')
    expect(nonTranslationStyles(element)).toEqual([])
  })
})
