import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'
import type { Pair } from '../support/vocabulary-pairs.ts'

import { act, cleanup, user } from '../support/react.ts'
import { recordCarried, recordPairs, recordRelated, unrecordedPairs } from '../support/row-pairs.ts'
import { hasClass, hasItem, part, renderScene } from '../support/rows.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { tableP } from '../support/table-p.ts'
import { OVERLAY_PAIRS, pair } from '../support/vocabulary-pairs.ts'

const nave: Source = await loadNave()
afterEach(cleanup)

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })

const panelSelector = (namespace: string): string => `[data-part="${CSS.escape(namespace)}.Panel"]`

interface PanelAttribute {
  readonly element: Element
  readonly name: string
}

// Every attribute carried by the Panels in an added node, the node itself included.
const panelAttributesIn = (node: Node, selector: string): PanelAttribute[] => {
  if (!(node instanceof Element)) {
    return []
  }
  return [node, ...node.querySelectorAll(selector)]
    .filter((target) => target.matches(selector))
    .flatMap((element) => element.getAttributeNames().map((name) => ({ element, name })))
}

const panelAttributesOf = (record: MutationRecord, selector: string): PanelAttribute[] => {
  const changed =
    record.type === 'attributes' &&
    record.target instanceof Element &&
    record.target.matches(selector)
      ? [{ element: record.target, name: record.attributeName ?? '' }]
      : []
  const added = [...record.addedNodes].flatMap((node) => panelAttributesIn(node, selector))
  return [...changed, ...added]
}

interface Seen {
  /**
  Every attribute name the Panel carried.
   */
  readonly names: Set<string>
  /**
  The (class, attribute) pairs of the Panel element as it was rendered.
   */
  readonly pairs: Pair[]
}

/**
 * Opens then closes the Panel and returns every attribute name it carried on the way, with or
 * without a transition on the Panel, and the pairs of its classes with those names.
 */
const attributesSeen = async (
  subpath: string,
  namespace: string,
  hasTransition: boolean,
): Promise<Seen> => {
  const style = document.createElement('style')
  style.textContent = `[data-part="${namespace}.Panel"] { transition-property: height; transition-duration: 200ms }`
  if (hasTransition) {
    document.head.append(style)
  }
  const seen: Seen = { names: new Set<string>(), pairs: [] }
  const selector = panelSelector(namespace)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const { element, name } of panelAttributesOf(record, selector)) {
        seen.names.add(name)
        seen.pairs.push(...[...element.classList].map((cls) => [cls, name] as const))
      }
    }
  })
  await renderScene(nave, subpath)
  observer.observe(document.body, { attributes: true, childList: true, subtree: true })
  const trigger = part(`${namespace}.Trigger`)!
  await user().click(trigger)
  await settle()
  await user().click(trigger)
  await settle()
  observer.disconnect()
  style.remove()
  await cleanup()
  return seen
}

const svgChild = (): unknown => createElement('svg', { 'data-test': 'svg', key: Math.random() })

const iconChild = (token: string): unknown => {
  if (token === '<svg>') {
    return svgChild()
  }
  if (token === '<span>') {
    return createElement('span', { key: 'span' }, createElement('svg', { 'data-test': 'svg' }))
  }
  return token
}

describe('AC-base-ui-bridge-22: every item the stylesheet keys on appears where its rule reaches (overlays)', () => {
  const CASES = [
    {
      cls: 'list-popup',
      items: ['--anchor-width', '--available-height'],
      owner: 'Menu.Popup',
      positioner: 'Menu.Positioner',
      subpath: 'menu',
    },
    {
      cls: 'list-popup',
      items: ['--anchor-width', '--available-height'],
      owner: 'Select.Popup',
      positioner: 'Select.Positioner',
      subpath: 'select',
    },
    {
      cls: 'popover-popup',
      items: ['--available-height'],
      owner: 'Popover.Popup',
      positioner: 'Popover.Positioner',
      subpath: 'popover',
    },
  ] as const

  for (const { cls, items, owner, positioner, subpath } of CASES) {
    it(`${positioner} carries ${items.join(' and ')}, and ${owner} sits inside it with its class`, async () => {
      await renderScene(nave, subpath, openProps())
      const holder = part(positioner)
      const popup = part(owner)
      expect(items.filter((item) => !hasItem(holder, item))).toEqual([])
      expect(popup !== undefined && holder?.contains(popup) === true).toBe(true)
      expect(hasClass(popup, `nave-base-ui-${cls}`)).toBe(true)
      for (const item of items) {
        recordRelated(popup, holder, item)
      }
    })
  }

  const SIDES = ['top', 'bottom', 'left', 'right', 'inline-start', 'inline-end']
  const ARROWS = [
    ['popover', 'Popover'],
    ['menu', 'Menu'],
    ['select', 'Select'],
    ['tooltip', 'Tooltip'],
  ] as const
  for (const [subpath, namespace] of ARROWS) {
    for (const side of SIDES) {
      it(`${namespace}.Arrow carries data-side="${side}" with the class, for side="${side}"`, async () => {
        await renderScene(nave, subpath, { ...openProps(), [`${namespace}.Positioner`]: { side } })
        const arrow = part(`${namespace}.Arrow`)
        expect(hasItem(arrow, 'data-side', side)).toBe(true)
        expect(hasClass(arrow, 'nave-base-ui-arrow')).toBe(true)
        recordCarried(arrow, 'data-side', side)
      })
    }
  }

  it('lists the components AC-22 names: the Positioner variables, the four Arrows and the six sides', () => {
    expect(CASES.map(({ positioner }) => positioner)).toEqual([
      'Menu.Positioner',
      'Select.Positioner',
      'Popover.Positioner',
    ])
    expect(ARROWS.map(([, namespace]) => namespace)).toEqual([
      'Popover',
      'Menu',
      'Select',
      'Tooltip',
    ])
    expect(SIDES).toEqual(['top', 'bottom', 'left', 'right', 'inline-start', 'inline-end'])
  })

  it('Select.Value carries data-placeholder when there is no value, with the class', async () => {
    // eslint-disable-next-line unicorn/no-null -- null is the Select's empty value, which undefined would leave uncontrolled
    await renderScene(nave, 'select', { 'Select.Root': { defaultValue: null } })
    const value = part('Select.Value')
    expect(hasItem(value, 'data-placeholder')).toBe(true)
    expect(hasClass(value, 'nave-base-ui-select-value')).toBe(true)
    recordCarried(value, 'data-placeholder')
  })
})

describe('AC-base-ui-bridge-22: disclosure and tabs', () => {
  for (const [subpath, namespace] of [
    ['accordion', 'Accordion'],
    ['collapsible', 'Collapsible'],
  ] as const) {
    it(`${namespace}: the Panel carries its height variable once opened, with the class`, async () => {
      await renderScene(nave, subpath)
      await user().click(part(`${namespace}.Trigger`)!)
      const panel = part(`${namespace}.Panel`)
      expect(hasItem(panel, `--${subpath}-panel-height`)).toBe(true)
      expect(hasClass(panel, `nave-base-ui-${subpath}-panel`)).toBe(true)
      recordCarried(panel, `--${subpath}-panel-height`)
    })

    it(`${namespace}: opening then closing is seen as data-starting-style then data-ending-style`, async () => {
      const { names, pairs } = await attributesSeen(subpath, namespace, true)
      const styleNames = [...names].filter((name) => name.endsWith('-style'))
      expect(styleNames.toSorted((a, b) => a.localeCompare(b))).toEqual([
        'data-ending-style',
        'data-starting-style',
      ])
      // The control: without the test stylesheet the exit is never observed.
      const withoutStyle = await attributesSeen(subpath, namespace, false)
      expect(withoutStyle.names.has('data-ending-style')).toBe(false)
      recordPairs(pairs.filter(([, name]) => name.endsWith('-style')))
    })

    it(`${namespace}: the Trigger carries aria-expanded when opened, and the icon key reaches by shape`, async () => {
      const SHAPES = [
        { children: ['Title', '<svg>'], reached: 1 },
        { children: ['<svg>', 'Title'], reached: 1 },
        { children: ['<svg>', 'Title', '<svg>'], reached: 1 },
        { children: ['<span>', 'Title'], reached: 0 },
      ] as const
      const widths: number[] = []
      for (const shape of SHAPES) {
        await renderScene(nave, subpath, {
          [`${namespace}.Trigger`]: { children: shape.children.map((token) => iconChild(token)) },
        })
        const trigger = part(`${namespace}.Trigger`)!
        await user().click(trigger)
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(hasClass(trigger, 'nave-base-ui-disclosure-icon')).toBe(true)
        recordCarried(trigger, 'aria-expanded', 'true')
        widths.push(trigger.querySelectorAll(':scope > svg:last-child').length)
        await cleanup()
      }
      expect(widths).toEqual(SHAPES.map((shape) => shape.reached))
    })

    it(`${namespace}: the Panel's first and last element children are the ones the inset keys reach`, async () => {
      await renderScene(nave, subpath, {
        [`${namespace}.Panel`]: {
          children: [createElement('p', { key: 'a' }, 'a'), createElement('p', { key: 'b' }, 'b')],
        },
        ...(subpath === 'accordion' ? {} : {}),
      })
      await user().click(part(`${namespace}.Trigger`)!)
      const panel = part(`${namespace}.Panel`)!
      expect(panel.querySelector(':scope > :first-child')?.textContent).toBe('a')
      expect(panel.querySelector(':scope > :last-child')?.textContent).toBe('b')
    })
  }

  it('Tabs: a vertical list carries aria-orientation, the Indicator data-orientation, with the classes', async () => {
    await renderScene(nave, 'tabs', { 'Tabs.Root': { orientation: 'vertical' } })
    const list = part('Tabs.List')
    const indicator = part('Tabs.Indicator')
    expect(hasItem(list, 'aria-orientation', 'vertical')).toBe(true)
    expect(hasClass(list, 'nave-base-ui-tab-list')).toBe(true)
    expect(hasItem(indicator, 'data-orientation', 'vertical')).toBe(true)
    expect(hasClass(indicator, 'nave-base-ui-tab-indicator')).toBe(true)
    recordCarried(list, 'aria-orientation', 'vertical')
    recordCarried(indicator, 'data-orientation', 'vertical')
  })

  it('Tabs: the Indicator carries the active-tab variables', async () => {
    await renderScene(nave, 'tabs')
    const indicator = part('Tabs.Indicator')
    expect(
      ['--active-tab-left', '--active-tab-top', '--active-tab-width', '--active-tab-height'].filter(
        (item) => !hasItem(indicator, item),
      ),
    ).toEqual([])
    for (const item of [
      '--active-tab-left',
      '--active-tab-top',
      '--active-tab-width',
      '--active-tab-height',
    ]) {
      recordCarried(indicator, item)
    }
  })

  it('names every Tabs part it looks at: each is rendered, with its class', async () => {
    await renderScene(nave, 'tabs')
    const names = ['Tabs.List', 'Tabs.Indicator']
    expect(
      names.filter((name) => {
        const classes = tableP.get(name) ?? []
        return classes.length === 0 || classes.some((cls) => !hasClass(part(name), cls))
      }),
    ).toEqual([])
  })
})

describe("AC-base-ui-bridge-22: the overlays' render rows cover every pair they own", () => {
  it('has recorded every pair of the overlays table', () => {
    expect(unrecordedPairs(OVERLAY_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('arrow', 'data-planted')] })).toEqual([
      'nave-base-ui-arrow data-planted',
    ])
  })
})
