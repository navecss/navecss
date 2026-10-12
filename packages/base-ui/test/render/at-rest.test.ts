import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { act, cleanup, user } from '../support/react.ts'
import { part, renderScene } from '../support/rows.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'

const nave: Source = await loadNave()
afterEach(cleanup)

const declarations = (element: Element | undefined): Map<string, string> =>
  new Map(
    (element?.getAttribute('style') ?? '')
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const colon = declaration.indexOf(':')
        return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const
      }),
  )

const TRANSITION_ATTRIBUTES = ['data-starting-style', 'data-ending-style']
const SINGLE_TRANSLATE = /^(?:none|translate(?:3d|X|Y|Z)?\([^()]*\))$/

/**
 * What at-rest inline styles may hold: translation only. Anything else (a fade, a scale, a
 * rotation, a filter) would make the part a group that paints its content as one flat layer.
 */
const nonTranslationStyles = (element: Element | undefined): string[] => {
  const styles = declarations(element)
  const problems = ['opacity', 'filter', 'scale', 'rotate'].filter((name) => styles.has(name))
  const transform = styles.get('transform')
  if (transform !== undefined && !SINGLE_TRANSLATE.test(transform)) {
    problems.push(`transform: ${transform}`)
  }
  return problems
}

const untilAtRest = async (positioner: string): Promise<void> => {
  const popupMarker = positioner.replace('Positioner', 'Popup')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const element = part(positioner)
    const popup = part(popupMarker)
    const isResting =
      element !== undefined &&
      declarations(element).has('--anchor-width') &&
      TRANSITION_ATTRIBUTES.every(
        (name) => !element.hasAttribute(name) && popup?.hasAttribute(name) !== true,
      )
    if (isResting) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  }
  throw new Error(`${positioner} never came to rest`)
}

/**
 * What keeps a rendered part's inline styles from carrying translation only: nothing when it does,
 * and a note when the part did not render, so a part that is missing never passes.
 */
const translationProblems = (marker: string): string[] => {
  const element = part(marker)
  return element === undefined ? [`${marker} did not render`] : nonTranslationStyles(element)
}

/**
 * The same for every Backdrop of a namespace's scene (there is at least one).
 */
const backdropProblems = (namespace: string): string[] => {
  const backdrops = partsNamed(`${namespace}.Backdrop`)
  return backdrops.length === 0
    ? [`${namespace}.Backdrop did not render`]
    : backdrops.flatMap((backdrop) => nonTranslationStyles(backdrop))
}

describe('AC-base-ui-bridge-34, extended by AC-base-ui-overlay-completion-45: Positioners, Popups, Backdrops and the Slider Thumb at rest carry translation only', () => {
  for (const [subpath, namespace] of [
    ['popover', 'Popover'],
    ['menu', 'Menu'],
    ['select', 'Select'],
    ['tooltip', 'Tooltip'],
    ['preview-card', 'PreviewCard'],
    ['combobox', 'Combobox'],
    ['autocomplete', 'Autocomplete'],
  ] as const) {
    it(`${namespace}: the Positioner and the Popup`, async () => {
      await renderScene(nave, subpath, openProps())
      await untilAtRest(`${namespace}.Positioner`)
      const popup = part(`${namespace}.Popup`)
      expect(popup).toBeDefined()
      expect(TRANSITION_ATTRIBUTES.some((name) => popup?.hasAttribute(name))).toBe(false)
      expect(nonTranslationStyles(part(`${namespace}.Positioner`))).toEqual([])
      expect(nonTranslationStyles(popup)).toEqual([])
    })
  }

  for (const [subpath, namespace] of [
    ['dialog', 'Dialog'],
    ['alert-dialog', 'AlertDialog'],
  ] as const) {
    it(`${namespace}: the Popup`, async () => {
      await renderScene(nave, subpath, openProps())
      expect(translationProblems(`${namespace}.Popup`)).toEqual([])
    })
  }

  for (const [subpath, namespace] of [
    ['dialog', 'Dialog'],
    ['alert-dialog', 'AlertDialog'],
    ['popover', 'Popover'],
    ['menu', 'Menu'],
    ['select', 'Select'],
    ['preview-card', 'PreviewCard'],
    ['context-menu', 'ContextMenu'],
    ['combobox', 'Combobox'],
    ['autocomplete', 'Autocomplete'],
  ] as const) {
    it(`${namespace}: the Backdrop`, async () => {
      await renderScene(nave, subpath, openProps())
      expect(backdropProblems(namespace)).toEqual([])
    })
  }

  it('ContextMenu opened by contextmenu: the Positioner, the Popup and the Backdrop', async () => {
    await renderScene(nave, 'context-menu')
    expect(part('ContextMenu.Popup')).toBeUndefined()
    await user().pointer({ keys: '[MouseRight]', target: part('ContextMenu.Trigger')! })
    await untilAtRest('ContextMenu.Positioner')
    expect(
      TRANSITION_ATTRIBUTES.some((name) => part('ContextMenu.Popup')?.hasAttribute(name)),
    ).toBe(false)
    // The control: Base UI placed the Positioner at the pointer with a translation, which the
    // check admits.
    expect(declarations(part('ContextMenu.Positioner')).get('transform')).toMatch(/^translate\(/)
    expect(nonTranslationStyles(part('ContextMenu.Positioner'))).toEqual([])
    expect(nonTranslationStyles(part('ContextMenu.Popup'))).toEqual([])
    expect(backdropProblems('ContextMenu')).toEqual([])
  })

  it("Menubar's menus, opened by a click on a trigger: the Positioner, the Popup and the Backdrop", async () => {
    await renderScene(nave, 'menubar')
    expect(part('Menu.Popup')).toBeUndefined()
    await user().click(part('Menu.Trigger')!)
    await untilAtRest('Menu.Positioner')
    expect(nonTranslationStyles(part('Menu.Positioner'))).toEqual([])
    expect(nonTranslationStyles(part('Menu.Popup'))).toEqual([])
  })

  for (const orientation of ['horizontal', 'vertical']) {
    it(`Slider: the Thumb, ${orientation}`, async () => {
      const props: Record<string, Props> = { 'Slider.Root': { orientation } }
      await renderScene(nave, 'slider', props)
      expect(nonTranslationStyles(part('Slider.Thumb'))).toEqual([])
      expect(declarations(part('Slider.Thumb')).get('translate')).toBeDefined()
    })
  }

  it('control: a Positioner still fading in is reported', () => {
    const element = document.createElement('div')
    element.setAttribute('style', 'opacity: 0; transform: scale(0.9) translate(1px, 2px)')
    expect(nonTranslationStyles(element)).toEqual([
      'opacity',
      'transform: scale(0.9) translate(1px, 2px)',
    ])
  })

  it('control: a Backdrop with a filter or a rotation is reported, and a single translation is admitted', () => {
    const element = document.createElement('div')
    element.setAttribute('style', 'filter: blur(2px); rotate: 3deg; scale: 2')
    expect(nonTranslationStyles(element)).toEqual(['filter', 'scale', 'rotate'])
    element.setAttribute('style', 'transform: translate(12px, 8px)')
    expect(nonTranslationStyles(element)).toEqual([])
    element.setAttribute('style', 'transform: none')
    expect(nonTranslationStyles(element)).toEqual([])
  })
})
