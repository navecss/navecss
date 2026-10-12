import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { cleanup, render, user } from '../support/react.ts'
import { recordCarried, recordPairs, unrecordedPairs } from '../support/row-pairs.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { topName } from '../support/subpaths.ts'
import { tablePFor } from '../support/table-p.ts'
import { pair, POPUP_PAIRS } from '../support/vocabulary-pairs.ts'
import { type Kind, KINDS, standardTree } from '../support/w6-combobox.ts'
import {
  contextMenuTree,
  menubarTree,
  menuTree,
  openByClick,
  openContextMenu,
  selectTree,
} from '../support/w6-menus.ts'
import {
  dialogTree,
  popoverTree,
  previewCardTree,
  tooltipPairTree,
} from '../support/w6-overlays.ts'
import {
  addStyle,
  classesOf,
  found,
  hasSeenAttribute,
  need,
  settle,
  transitionOn,
  valuesInOrder,
  watch,
  withEmptyAnimations,
} from '../support/w6-render.ts'

const nave: Source = await loadNave()
const bare: Source = await loadBare()
afterEach(cleanup)

const C = 'nave-base-ui-'

/**
 * Opens by the keyboard-free route a user has for the component, closes by Escape, and returns
 * what the watch saw on the way.
 */
const TRIGGERS = [
  {
    name: 'Menu.Trigger standalone',
    marker: 'Menu.Trigger',
    open: async () => {
      await render(menuTree(nave, bare))
    },
  },
  {
    name: 'Menu.Trigger inside Menubar',
    marker: 'Menu.Trigger',
    open: async () => {
      await render(menubarTree(nave, bare))
    },
  },
  {
    name: 'Dialog.Trigger',
    marker: 'Dialog.Trigger',
    open: async () => {
      await render(dialogTree(nave, 'dialog'))
    },
  },
  {
    name: 'AlertDialog.Trigger',
    marker: 'AlertDialog.Trigger',
    open: async () => {
      await render(dialogTree(nave, 'alert-dialog'))
    },
  },
  {
    name: 'Popover.Trigger',
    marker: 'Popover.Trigger',
    open: async () => {
      await render(popoverTree(nave))
    },
  },
] as const

describe('AC-base-ui-overlay-completion-15: the triggers a ghost key can mark carry aria-expanded', () => {
  for (const { marker, name, open } of TRIGGERS) {
    it(`${name} carries ${C}button and aria-expanded="false" closed, "true" open, "false" closed again`, async () => {
      await open()
      const trigger = need(marker)
      expect(trigger.classList.contains(`${C}button`)).toBe(true)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      await user().click(trigger)
      await settle()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      recordCarried(trigger, 'aria-expanded', 'true')
      await user().keyboard('{Escape}')
      await settle()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  }

  it('Tooltip.Trigger carries no aria-expanded, closed or open (and the same class as the others)', async () => {
    await render(tooltipPairTree(nave))
    const trigger = need('Tooltip.Trigger.1')
    expect(trigger.classList.contains(`${C}button`)).toBe(true)
    expect(trigger.hasAttribute('aria-expanded')).toBe(false)
    await user().hover(trigger)
    await settle()
    expect(found('Tooltip.Popup.1'), 'the tooltip opened').toBeDefined()
    expect(trigger.hasAttribute('aria-expanded')).toBe(false)
    await user().unhover(trigger)
    await settle()
    expect(trigger.hasAttribute('aria-expanded')).toBe(false)
  })

  it('names the triggers the criterion names', () => {
    expect(TRIGGERS.map(({ name }) => name)).toEqual([
      'Menu.Trigger standalone',
      'Menu.Trigger inside Menubar',
      'Dialog.Trigger',
      'AlertDialog.Trigger',
      'Popover.Trigger',
    ])
  })
})

/**
 * Every Backdrop part of the subpaths that ship, rendered open: how to open it, and the subpath
 * it belongs to (its marker is `<Namespace>.Backdrop`).
 */
const BACKDROPS = [
  {
    marker: 'Dialog.Backdrop',
    open: async () => {
      await render(dialogTree(nave, 'dialog', { Root: { open: true } }))
    },
  },
  {
    marker: 'AlertDialog.Backdrop',
    open: async () => {
      await render(dialogTree(nave, 'alert-dialog', { Root: { open: true } }))
    },
  },
  {
    marker: 'Menu.Backdrop',
    open: async () => {
      await render(menuTree(nave, bare, { Root: { open: true } }))
    },
  },
  {
    marker: 'ContextMenu.Backdrop',
    open: async () => {
      await render(contextMenuTree(nave, bare))
      await openContextMenu()
    },
  },
  {
    marker: 'Popover.Backdrop',
    open: async () => {
      await render(popoverTree(nave, { Root: { open: true } }))
    },
  },
  {
    marker: 'PreviewCard.Backdrop',
    open: async () => {
      await render(previewCardTree(nave, { Root: { open: true } }))
    },
  },
  {
    marker: 'Select.Backdrop',
    open: async () => {
      await render(selectTree(nave, { Root: { open: true } }))
    },
  },
  ...KINDS.map((kind: Kind) => ({
    marker: `${topName(kind)}.Backdrop`,
    open: async () => {
      await render(standardTree(nave, kind, { root: { open: true } }))
    },
  })),
] as const

describe('AC-base-ui-overlay-completion-16: the backdrop scope and the modal Alert Dialog', () => {
  for (const { marker, open } of BACKDROPS) {
    it(`${marker}, rendered open, carries the classes Table P gives it under the shipping scope`, async () => {
      await open()
      const backdrop = need(marker)
      const expected = tablePFor().get(marker) ?? []
      // The classes it carries are exactly the table's: none at all for a part Table P leaves out.
      expect(classesOf(backdrop)).toEqual([...expected])
    })
  }

  it('under the shipping scope only AlertDialog.Backdrop is given the scrim class', () => {
    const scrim = `${C}backdrop`
    expect(
      BACKDROPS.map(({ marker }) => marker).filter((marker) =>
        (tablePFor().get(marker) ?? []).includes(scrim),
      ),
    ).toEqual(['AlertDialog.Backdrop'])
  })

  it('control: at scope (ii) Dialog.Backdrop is given it as well, and with the scrim unsigned none is', () => {
    const scrim = `${C}backdrop`
    const carrying = (table: ReadonlyMap<string, readonly string[]>): string[] =>
      BACKDROPS.map(({ marker }) => marker).filter((marker) =>
        (table.get(marker) ?? []).includes(scrim),
      )
    expect(carrying(tablePFor([], 'ii'))).toEqual(['Dialog.Backdrop', 'AlertDialog.Backdrop'])
    expect(carrying(tablePFor(['scrim']))).toEqual([])
  })

  it('names the nine Backdrops of the criterion', () => {
    expect(BACKDROPS.map(({ marker }) => marker)).toEqual([
      'Dialog.Backdrop',
      'AlertDialog.Backdrop',
      'Menu.Backdrop',
      'ContextMenu.Backdrop',
      'Popover.Backdrop',
      'PreviewCard.Backdrop',
      'Select.Backdrop',
      'Combobox.Backdrop',
      'Autocomplete.Backdrop',
    ])
  })
})

/**
 * Whether the document holds Base UI's internal layer: a `div` with `role="presentation"` whose
 * inline style is `position: fixed`, which a modal dialog renders around its popup.
 */
const hasInternalLayer = (): boolean =>
  [...document.querySelectorAll<HTMLElement>('div[role="presentation"]')].some(
    (element) => element.style.position === 'fixed',
  )

describe('AC-base-ui-overlay-completion-16: Alert Dialog is modal whatever it is passed', () => {
  const renders = [
    {
      expected: true,
      name: 'AlertDialog with no modal prop',
      sub: 'alert-dialog',
      modal: undefined,
    },
    { expected: true, name: 'AlertDialog with modal={false}', sub: 'alert-dialog', modal: false },
    { expected: true, name: 'Dialog with modal', sub: 'dialog', modal: true },
    { expected: false, name: 'Dialog with modal={false}', sub: 'dialog', modal: false },
    { expected: false, name: 'Dialog with modal="trap-focus"', sub: 'dialog', modal: 'trap-focus' },
  ] as const

  for (const { expected, modal, name, sub } of renders) {
    it(`${name}: ${expected ? 'contains' : 'does not contain'} Base UI's internal layer, and renders its Backdrop`, async () => {
      const root = modal === undefined ? { open: true } : { modal, open: true }
      await render(dialogTree(nave, sub, { Root: root }))
      expect(need(`${topName(sub)}.Popup`)).toBeDefined()
      expect(hasInternalLayer()).toBe(expected)
      expect(found(`${topName(sub)}.Backdrop`), 'the Backdrop is rendered').toBeDefined()
    })
  }
})

/**
 * The popups of the criterion: the first four take `-popup-motion`, the others `-popup-fade`;
 * the Menu, Context Menu and Popover popups are the ones Base UI marks `data-instant="dismiss"`
 * on an Escape close.
 */
const POPUPS = [
  {
    cls: 'popup-motion',
    instant: true,
    marker: 'Menu.Popup',
    name: 'Menu',
    open: async () => {
      await render(menuTree(nave, bare))
      await openByClick('Menu.Trigger')
    },
  },
  {
    cls: 'popup-motion',
    instant: true,
    marker: 'ContextMenu.Popup',
    name: 'Context Menu',
    open: async () => {
      await render(contextMenuTree(nave, bare))
      await openContextMenu()
    },
  },
  {
    cls: 'popup-motion',
    instant: false,
    marker: 'Menu.Popup',
    name: 'Menubar menu',
    open: async () => {
      await render(menubarTree(nave, bare))
      await openByClick('Menu.Trigger')
    },
  },
  {
    cls: 'popup-motion',
    instant: true,
    marker: 'Popover.Popup',
    name: 'Popover',
    open: async () => {
      await render(popoverTree(nave))
      await openByClick('Popover.Trigger')
    },
  },
  {
    cls: 'popup-fade',
    instant: false,
    marker: 'Select.Popup',
    name: 'Select',
    open: async () => {
      await render(selectTree(nave))
      await openByClick('Select.Trigger')
    },
  },
  {
    backdrop: 'Dialog.Backdrop',
    cls: 'popup-fade',
    instant: false,
    marker: 'Dialog.Popup',
    name: 'Dialog',
    open: async () => {
      await render(dialogTree(nave, 'dialog'))
      await openByClick('Dialog.Trigger')
    },
  },
  {
    backdrop: 'AlertDialog.Backdrop',
    cls: 'popup-fade',
    instant: false,
    marker: 'AlertDialog.Popup',
    name: 'Alert Dialog',
    open: async () => {
      await render(dialogTree(nave, 'alert-dialog'))
      await openByClick('AlertDialog.Trigger')
    },
  },
  {
    cls: 'popup-fade',
    instant: false,
    marker: 'PreviewCard.Popup',
    name: 'Preview Card',
    open: async () => {
      await render(previewCardTree(nave))
      await user().hover(need('PreviewCard.Trigger'))
      await settle()
    },
  },
  ...KINDS.map((kind: Kind) => ({
    cls: 'popup-fade',
    instant: false,
    marker: `${topName(kind)}.Popup`,
    name: topName(kind),
    open: async () => {
      await render(standardTree(nave, kind))
      await user().click(need(`${topName(kind)}.Input`))
      await settle()
      if (found(`${topName(kind)}.Popup`) === undefined) {
        await user().keyboard('{ArrowDown}')
        await settle()
      }
    },
  })),
] as const

describe('AC-base-ui-overlay-completion-17: popup classes and the transient attributes they key', () => {
  for (const popup of POPUPS) {
    const { cls, instant, marker, name } = popup
    it(`${name}: the popup carries ${C}${cls}, takes data-starting-style on open and data-ending-style on close${instant ? ', and data-instant="dismiss" on Escape' : ''}`, async () => {
      const backdrops = 'backdrop' in popup ? [popup.backdrop] : []
      const markers = [marker, ...backdrops]
      const remove = addStyle(transitionOn(markers))
      const restore = withEmptyAnimations()
      // The watch starts before the popup exists: it is only ever there for a frame.
      const seen = watch(markers)
      try {
        await popup.open()
        const element = need(marker)
        // The scrim class is on the Alert Dialog's Backdrop alone, so its keys reach that one.
        expect(backdrops.map((name) => classesOf(need(name)).includes(`${C}backdrop`))).toEqual(
          backdrops.map((name) => name === 'AlertDialog.Backdrop'),
        )
        expect(element.classList.contains(`${C}${cls}`)).toBe(true)
        expect(
          element.classList.contains(`${C}${cls === 'popup-fade' ? 'popup-motion' : 'popup-fade'}`),
        ).toBe(false)
        await user().keyboard('{Escape}')
        await settle(120)
      } finally {
        seen.stop()
        restore()
        remove()
      }
      expect(hasSeenAttribute(seen, marker, 'data-starting-style')).toBe(true)
      expect(hasSeenAttribute(seen, marker, 'data-ending-style')).toBe(true)
      expect(!instant || hasSeenAttribute(seen, marker, 'data-instant', 'dismiss')).toBe(true)
      expect(
        backdrops.map((name) => [
          name,
          hasSeenAttribute(seen, name, 'data-starting-style'),
          hasSeenAttribute(seen, name, 'data-ending-style'),
        ]),
      ).toEqual(backdrops.map((name) => [name, true, true]))
      recordPairs(
        seen.pairs.filter(([, attribute]) =>
          ['data-ending-style', 'data-instant', 'data-starting-style'].includes(attribute),
        ),
      )
    })
  }

  it('control: without the stylesheet and the stand-in for getAnimations the Menu exit is never observed in jsdom', async () => {
    const popup = POPUPS[0]
    const seen = watch([popup.marker])
    await popup.open()
    await user().keyboard('{Escape}')
    await settle(120)
    seen.stop()
    expect(hasSeenAttribute(seen, popup.marker, 'data-ending-style')).toBe(false)
  })

  it('names the ten popups of the criterion: four with the motion class, six with the fade', () => {
    expect(POPUPS.filter(({ cls }) => cls === 'popup-motion').map(({ name }) => name)).toEqual([
      'Menu',
      'Context Menu',
      'Menubar menu',
      'Popover',
    ])
    expect(POPUPS.filter(({ cls }) => cls === 'popup-fade').map(({ name }) => name)).toEqual([
      'Select',
      'Dialog',
      'Alert Dialog',
      'Preview Card',
      'Combobox',
      'Autocomplete',
    ])
  })

  it('under the shipping table the four motion popups take popup-motion and the six take popup-fade, and no popup takes both', () => {
    const table = tablePFor()
    const popups = [
      ...['Menu', 'ContextMenu', 'Popover'].map((name) => `${name}.Popup`),
      ...['Select', 'Dialog', 'AlertDialog', 'PreviewCard', 'Combobox', 'Autocomplete'].map(
        (name) => `${name}.Popup`,
      ),
    ]
    expect(
      popups.map((marker) => [
        marker,
        (table.get(marker) ?? []).filter(
          (name) => name.endsWith('-motion') || name.endsWith('-fade'),
        ),
      ]),
    ).toEqual([
      ['Menu.Popup', [`${C}popup-motion`]],
      ['ContextMenu.Popup', [`${C}popup-motion`]],
      ['Popover.Popup', [`${C}popup-motion`]],
      ['Select.Popup', [`${C}popup-fade`]],
      ['Dialog.Popup', [`${C}popup-fade`]],
      ['AlertDialog.Popup', [`${C}popup-fade`]],
      ['PreviewCard.Popup', [`${C}popup-fade`]],
      ['Combobox.Popup', [`${C}popup-fade`]],
      ['Autocomplete.Popup', [`${C}popup-fade`]],
    ])
  })
})

describe('AC-base-ui-overlay-completion-18: the tooltip fades on its own atom', () => {
  it(`Tooltip.Popup carries ${C}tooltip-motion, and the second popup in a provider gets data-instant "delay" and then "dismiss"`, async () => {
    const remove = addStyle(transitionOn(['Tooltip.Popup.1', 'Tooltip.Popup.2']))
    const restore = withEmptyAnimations()
    const seen = watch(['Tooltip.Popup.1', 'Tooltip.Popup.2'])
    try {
      await render(tooltipPairTree(nave))
      await user().hover(need('Tooltip.Trigger.1'))
      await settle()
      expect(need('Tooltip.Popup.1').classList.contains(`${C}tooltip-motion`)).toBe(true)
      expect(need('Tooltip.Popup.1').classList.contains(`${C}tooltip-popup`)).toBe(true)
      await user().hover(need('Tooltip.Trigger.2'))
      await settle()
      expect(need('Tooltip.Popup.2').classList.contains(`${C}tooltip-motion`)).toBe(true)
      await user().keyboard('{Escape}')
      await settle(120)
    } finally {
      seen.stop()
      restore()
      remove()
    }
    expect(valuesInOrder(seen, 'Tooltip.Popup.2', 'data-instant')).toEqual(['delay', 'dismiss'])
    expect(hasSeenAttribute(seen, 'Tooltip.Popup.2', 'data-starting-style')).toBe(true)
    recordPairs(seen.pairs.filter(([cls]) => cls === `${C}tooltip-motion`))
  })

  it('control: the first popup of the provider is opened by the pointer without the group delay', async () => {
    const seen = watch(['Tooltip.Popup.1'])
    await render(tooltipPairTree(nave))
    await user().hover(need('Tooltip.Trigger.1'))
    await settle()
    seen.stop()
    expect(hasSeenAttribute(seen, 'Tooltip.Popup.1', 'data-instant', 'delay')).toBe(false)
  })

  it('with the tooltip fade unsigned Tooltip.Popup is given only the tooltip popup class', () => {
    expect(tablePFor(['tooltip-fade']).get('Tooltip.Popup')).toEqual([`${C}tooltip-popup`])
    expect(tablePFor().get('Tooltip.Popup')).toEqual([`${C}tooltip-popup`, `${C}tooltip-motion`])
  })
})

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the popup rows cover every pair they own', () => {
  it('has recorded every pair of the popups table', () => {
    expect(unrecordedPairs(POPUP_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('popup-fade', 'data-planted')] })).toEqual([
      'nave-base-ui-popup-fade data-planted',
    ])
  })
})
