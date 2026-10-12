import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { cleanup, render, user } from '../support/react.ts'
import { recordCarried, unrecordedPairs } from '../support/row-pairs.ts'
import { part, renderScene } from '../support/rows.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { topName } from '../support/subpaths.ts'
import { LIST_PAIRS, pair } from '../support/vocabulary-pairs.ts'
import { type Kind, KINDS, standardTree } from '../support/w6-combobox.ts'
import {
  arrowThrough,
  contextMenuTree,
  menubarTree,
  menuTree,
  openByClick,
  openContextMenu,
  selectTree,
} from '../support/w6-menus.ts'
import { previewCardTree } from '../support/w6-overlays.ts'
import { found, hasPart, need, settle } from '../support/w6-render.ts'

const nave: Source = await loadNave()
const bare: Source = await loadBare()
afterEach(cleanup)

const C = 'nave-base-ui-'

/**
 * The item kinds a menu holds, as `data-part` markers; `LinkItem` only where the installed Base UI
 * has it (a part younger than the run's Base UI is absent from the wrapper too).
 */
const menuKinds = (namespace: string, subpath: 'context-menu' | 'menu'): string[] => [
  `${namespace}.Item`,
  ...(hasPart(bare, subpath, 'LinkItem') ? [`${namespace}.LinkItem`] : []),
  `${namespace}.CheckboxItem`,
  `${namespace}.RadioItem`,
  `${namespace}.SubmenuTrigger`,
]

const LISTS = [
  {
    kinds: () => menuKinds('Menu', 'menu'),
    name: 'Menu',
    open: async () => {
      await render(menuTree(nave, bare))
      await openByClick('Menu.Trigger')
    },
  },
  {
    kinds: () => menuKinds('Menu', 'menu'),
    name: 'Menu inside Menubar',
    open: async () => {
      await render(menubarTree(nave, bare))
      await openByClick('Menu.Trigger')
    },
  },
  {
    kinds: () => menuKinds('ContextMenu', 'context-menu'),
    name: 'Context Menu',
    open: async () => {
      await render(contextMenuTree(nave, bare))
      await openContextMenu()
    },
  },
  {
    kinds: () => ['Select.Item'],
    name: 'Select',
    open: async () => {
      await render(selectTree(nave))
      await openByClick('Select.Trigger')
    },
  },
  ...KINDS.map((kind: Kind) => ({
    kinds: () => [`${topName(kind)}.Item`],
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

describe('AC-base-ui-overlay-completion-14: the highlight fill reaches every list item', () => {
  for (const { kinds, name, open } of LISTS) {
    it(`${name}: every kind of item, highlighted by ArrowDown, carries data-highlighted, ${C}item and ${C}item-highlight`, async () => {
      await open()
      const seen = await arrowThrough(8, (item) => {
        expect(Object.hasOwn(item.dataset, 'highlighted')).toBe(true)
        expect(item.classList.contains(`${C}item`)).toBe(true)
        expect(item.classList.contains(`${C}item-highlight`)).toBe(true)
        recordCarried(item, 'data-highlighted')
      })
      expect(seen.length).toBeGreaterThan(0)
      const markers = new Set(seen.map((item) => item.dataset.part))
      expect(kinds().filter((marker) => !markers.has(marker))).toEqual([])
    })
  }

  it('names the lists the criterion names: Menu alone and in a Menubar, Context Menu, Select, Combobox and Autocomplete', () => {
    expect(LISTS.map(({ name }) => name)).toEqual([
      'Menu',
      'Menu inside Menubar',
      'Context Menu',
      'Select',
      'Combobox',
      'Autocomplete',
    ])
  })
})

describe('AC-base-ui-overlay-completion-21: the tab indicator slides, over its own atom', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    it(`Tabs.Indicator carries ${C}tab-indicator and ${C}tab-indicator-motion, ${orientation}`, async () => {
      await renderScene(nave, 'tabs', { 'Tabs.Root': { orientation } })
      const indicator = part('Tabs.Indicator')
      expect(indicator, 'Tabs.Indicator is rendered').toBeDefined()
      expect(indicator?.dataset.orientation).toBe(orientation)
      expect(indicator?.classList.contains(`${C}tab-indicator`)).toBe(true)
      expect(indicator?.classList.contains(`${C}tab-indicator-motion`)).toBe(true)
    })
  }
})

describe('AC-base-ui-overlay-completion-22: every Arrow takes the logical sides, keyed on what Base UI renders', () => {
  const SIDES = ['inline-start', 'inline-end'] as const

  const ARROWS = [
    {
      marker: 'ContextMenu.Arrow',
      open: async (side: string) => {
        await render(contextMenuTree(nave, bare, { Positioner: { side } }))
        await openContextMenu()
      },
    },
    {
      marker: 'PreviewCard.Arrow',
      open: async (side: string) => {
        await render(previewCardTree(nave, { Positioner: { side }, Root: { open: true } }))
        await settle()
      },
    },
    ...KINDS.map((kind: Kind) => ({
      marker: `${topName(kind)}.Arrow`,
      open: async (side: string) => {
        await render(standardTree(nave, kind, { parts: { Positioner: { side } } }))
        await user().click(need(`${topName(kind)}.Input`))
        await settle()
        if (found(`${topName(kind)}.Popup`) === undefined) {
          await user().keyboard('{ArrowDown}')
          await settle()
        }
      },
    })),
  ] as const

  for (const { marker, open } of ARROWS) {
    for (const side of SIDES) {
      it(`${marker} carries ${C}arrow and ${C}arrow-inline with data-side="${side}", for side="${side}"`, async () => {
        await open(side)
        const arrow = need(marker)
        expect(arrow.dataset.side).toBe(side)
        expect(arrow.classList.contains(`${C}arrow`)).toBe(true)
        expect(arrow.classList.contains(`${C}arrow-inline`)).toBe(true)
        recordCarried(arrow, 'data-side', side)
      })
    }
  }

  it('names the Arrows the criterion adds: Context Menu, Preview Card, Combobox and Autocomplete', () => {
    expect(ARROWS.map(({ marker }) => marker)).toEqual([
      'ContextMenu.Arrow',
      'PreviewCard.Arrow',
      'Combobox.Arrow',
      'Autocomplete.Arrow',
    ])
    expect(SIDES).toEqual(['inline-start', 'inline-end'])
  })
})

describe('AC-base-ui-overlay-completion-29: the Menubar root carries its orientation', () => {
  it(`orientation="vertical" gives the Menubar aria-orientation="vertical" and ${C}toolbar`, async () => {
    await render(menubarTree(nave, bare, { Menubar: { orientation: 'vertical' } }))
    const root = need('Menubar')
    expect(root.getAttribute('aria-orientation')).toBe('vertical')
    expect(root.classList.contains(`${C}toolbar`)).toBe(true)
    recordCarried(root, 'aria-orientation', 'vertical')
  })
})

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the list rows cover every pair they own', () => {
  it('has recorded every pair of the lists table', () => {
    expect(unrecordedPairs(LIST_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('item-highlight', 'data-planted')] })).toEqual([
      'nave-base-ui-item-highlight data-planted',
    ])
  })
})
