import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { act, cleanup } from '../support/react.ts'
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const element = part(positioner)
    const isResting =
      element !== undefined &&
      declarations(element).has('--anchor-width') &&
      TRANSITION_ATTRIBUTES.every((name) => !element.hasAttribute(name))
    if (isResting) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  }
  throw new Error(`${positioner} never came to rest`)
}

describe('AC-base-ui-bridge-34: Positioners, Popups and the Slider Thumb at rest carry translation only', () => {
  for (const [subpath, namespace] of [
    ['popover', 'Popover'],
    ['menu', 'Menu'],
    ['select', 'Select'],
    ['tooltip', 'Tooltip'],
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

  it('Dialog: the Popup', async () => {
    await renderScene(nave, 'dialog', openProps())
    expect(nonTranslationStyles(part('Dialog.Popup'))).toEqual([])
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
})
