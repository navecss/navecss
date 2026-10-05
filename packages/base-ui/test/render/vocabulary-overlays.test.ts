import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { act, cleanup, user } from '../support/react.ts'
import { hasItem, hasClass, part, renderScene } from '../support/rows.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'

let nave: Source
beforeAll(async () => {
  nave = await loadNave()
})
afterEach(cleanup)

const IS_FLOOR = process.env.NAVE_BASE_UI === 'floor'

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })

describe('AC-base-ui-bridge-22: every item the stylesheet keys on appears where its rule reaches (overlays)', () => {
  const CASES = [
    {
      items: ['--anchor-width', '--available-height'],
      owner: 'Menu.Popup',
      positioner: 'Menu.Positioner',
      subpath: 'menu',
    },
    {
      items: ['--anchor-width', '--available-height'],
      owner: 'Select.Popup',
      positioner: 'Select.Positioner',
      subpath: 'select',
    },
    {
      items: ['--available-height'],
      owner: 'Popover.Popup',
      positioner: 'Popover.Positioner',
      subpath: 'popover',
    },
  ] as const

  for (const { items, owner, positioner, subpath } of CASES) {
    it(`${positioner} hasItem ${items.join(' and ')}, and ${owner} sits inside it with its class`, async () => {
      await renderScene(nave, subpath, openProps())
      const carrier = part(positioner)
      const popup = part(owner)
      expect(items.filter((item) => !hasItem(carrier, item))).toEqual([])
      expect(carrier?.contains(popup ?? null)).toBe(true)
      expect(popup?.className).toContain('nave-base-ui-')
    })
  }

  const SIDES = ['top', 'bottom', 'left', 'right', 'inline-start', 'inline-end']
  for (const [subpath, namespace] of [
    ['popover', 'Popover'],
    ['menu', 'Menu'],
    ['select', 'Select'],
    ['tooltip', 'Tooltip'],
  ] as const) {
    for (const side of SIDES) {
      it(`${namespace}.Arrow hasItem data-side="${side}" with the class, for side="${side}"`, async () => {
        await renderScene(nave, subpath, { ...openProps(), [`${namespace}.Positioner`]: { side } })
        const arrow = part(`${namespace}.Arrow`)
        expect(hasItem(arrow, 'data-side', side)).toBe(true)
        expect(hasClass(arrow, 'nave-base-ui-arrow')).toBe(true)
      })
    }
  }

  it('Select.Value hasItem data-placeholder when there is no value, with the class', async () => {
    await renderScene(nave, 'select', { 'Select.Root': { defaultValue: null } })
    const value = part('Select.Value')
    expect(hasItem(value, 'data-placeholder')).toBe(true)
    expect(hasClass(value, 'nave-base-ui-select-value')).toBe(true)
  })
})

describe('AC-base-ui-bridge-22: disclosure and tabs', () => {
  for (const [subpath, namespace] of [
    ['accordion', 'Accordion'],
    ['collapsible', 'Collapsible'],
  ] as const) {
    it(`${namespace}: the Panel hasItem its height variable once opened, with the class`, async () => {
      await renderScene(nave, subpath)
      await user().click(part(`${namespace}.Trigger`)!)
      const panel = part(`${namespace}.Panel`)
      expect(hasItem(panel, `--${subpath}-panel-height`)).toBe(true)
      expect(hasClass(panel, `nave-base-ui-${subpath}-panel`)).toBe(true)
    })

    it(`${namespace}: opening then closing is seen as data-starting-style then data-ending-style`, async () => {
      const seen = async (withTransition: boolean): Promise<Set<string>> => {
        const style = document.createElement('style')
        style.textContent = `[data-part="${namespace}.Panel"] { transition-property: height; transition-duration: 200ms }`
        if (withTransition) {
          document.head.append(style)
        }
        const names = new Set<string>()
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            if (
              record.type === 'attributes' &&
              record.target instanceof Element &&
              record.target.matches(`[data-part="${CSS.escape(namespace)}.Panel"]`)
            ) {
              names.add(record.attributeName ?? '')
            }
            for (const node of record.addedNodes) {
              if (node instanceof Element) {
                for (const target of [
                  node,
                  ...node.querySelectorAll(`[data-part="${CSS.escape(namespace)}.Panel"]`),
                ]) {
                  if (target.matches(`[data-part="${CSS.escape(namespace)}.Panel"]`)) {
                    for (const name of target.getAttributeNames()) {
                      names.add(name)
                    }
                  }
                }
              }
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
        return names
      }
      const withStyle = await seen(true)
      expect([...withStyle].filter((name) => name.endsWith('-style')).toSorted()).toEqual([
        'data-ending-style',
        'data-starting-style',
      ])
      // The control: without the test stylesheet the exit is never observed.
      expect((await seen(false)).has('data-ending-style')).toBe(false)
    })

    it(`${namespace}: the Trigger hasItem aria-expanded when opened, and the icon key reaches by shape`, async () => {
      const SHAPES = [
        { children: ['Title', '<svg>'], reached: 1 },
        { children: ['<svg>', 'Title'], reached: 1 },
        { children: ['<svg>', 'Title', '<svg>'], reached: 1 },
        { children: ['<span>', 'Title'], reached: 0 },
      ] as const
      const { createElement } = await import('react')
      const make = (token: string): unknown =>
        token === '<svg>'
          ? createElement('svg', { 'data-test': 'svg', key: Math.random() })
          : token === '<span>'
            ? createElement('span', { key: 'span' }, createElement('svg', { 'data-test': 'svg' }))
            : token
      const widths: number[] = []
      for (const shape of SHAPES) {
        await renderScene(nave, subpath, {
          [`${namespace}.Trigger`]: { children: shape.children.map(make) },
        })
        const trigger = part(`${namespace}.Trigger`)!
        await user().click(trigger)
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        widths.push(trigger.querySelectorAll(':scope > svg:last-child').length)
        await cleanup()
      }
      expect(widths).toEqual(SHAPES.map((shape) => shape.reached))
    })

    it(`${namespace}: the Panel's first and last element children are the ones the inset keys reach`, async () => {
      const { createElement } = await import('react')
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

  it('Tabs: a vertical list hasItem aria-orientation, the Indicator data-orientation, with the classes', async () => {
    await renderScene(nave, 'tabs', { 'Tabs.Root': { orientation: 'vertical' } })
    const list = part('Tabs.List')
    const indicator = part('Tabs.Indicator')
    expect(hasItem(list, 'aria-orientation', 'vertical')).toBe(true)
    expect(hasClass(list, 'nave-base-ui-tab-list')).toBe(true)
    expect(hasItem(indicator, 'data-orientation', 'vertical')).toBe(true)
    expect(hasClass(indicator, 'nave-base-ui-tab-indicator')).toBe(true)
  })

  it('Tabs: the Indicator hasItem the active-tab variables', async () => {
    await renderScene(nave, 'tabs')
    const indicator = part('Tabs.Indicator')
    expect(
      ['--active-tab-left', '--active-tab-top', '--active-tab-width', '--active-tab-height'].filter(
        (item) => !hasItem(indicator, item),
      ),
    ).toEqual([])
  })

  it('names every Tabs part it looks at', () => {
    expect(IS_FLOOR || partsNamed('Tabs.List').length === 0).toBe(true)
  })
})
