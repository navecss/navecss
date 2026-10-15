import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'
import type { Pair } from '../support/vocabulary-pairs.ts'

import { partsNamed } from '../support/dom.ts'
import { INDETERMINATE, overflowingLayout, settle } from '../support/feedback-render.ts'
import { feedbackNave } from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { recordCarried, unrecordedPairs } from '../support/row-pairs.ts'
import { hasClass, hasItem, part } from '../support/rows.ts'
import { scenes } from '../support/scenes.ts'
import { navigationMenuOpenProps } from '../support/states.ts'
import { pair } from '../support/vocabulary-pairs.ts'

afterEach(cleanup)

const C = 'nave-base-ui-'

/**
 * The pairs this file's rows assert: the Scroll Area's scrollbar and thumb orientation, the
 * Progress indicator's mark and the two Arrows' side. Written out here, not read off the
 * stylesheet, so the file checks its own table.
 */
const RGEN_PAIRS: Readonly<Record<string, readonly Pair[]>> = {
  arrows: [pair('arrow', 'data-side'), pair('arrow-inline', 'data-side')],
  indicator: [pair('value-bar-indicator', 'data-indeterminate')],
  scrollArea: [
    pair('scroll-area-scrollbar', 'data-orientation'),
    pair('scroll-area-thumb', 'data-orientation'),
  ],
}

const renderScene = async (subpath: string, props: Record<string, Props> = {}): Promise<void> => {
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  const nave: Source = await feedbackNave()
  await render(scene.render(nave, { props }))
  await settle(30)
}

describe('AC-base-ui-feedback-navigation-39: every new attribute the stylesheet keys on appears where its rule reaches (Tier A rows)', () => {
  it('Scroll Area, keepMounted scrollbars of both orientations: data-orientation on each Scrollbar and Thumb, with their classes', async () => {
    await renderScene('scroll-area')
    const scrollbars = partsNamed('ScrollArea.Scrollbar')
    const thumbs = partsNamed('ScrollArea.Thumb')
    expect(scrollbars).toHaveLength(2)
    expect(thumbs).toHaveLength(2)
    for (const [index, orientation] of ['vertical', 'horizontal'].entries()) {
      for (const [element, name] of [
        [scrollbars[index], 'scroll-area-scrollbar'],
        [thumbs[index], 'scroll-area-thumb'],
      ] as const) {
        expect(hasItem(element, 'data-orientation', orientation), `${name} ${orientation}`).toBe(
          true,
        )
        expect(hasClass(element, `${C}${name}`), `${name} ${orientation}`).toBe(true)
        recordCarried(element, 'data-orientation', orientation)
      }
    }
  })

  it('Scroll Area: the Viewport carries an inline overflow: scroll, and -scroll-area-viewport', async () => {
    await renderScene('scroll-area')
    const viewport = part('ScrollArea.Viewport')
    expect(viewport?.style.getPropertyValue('overflow')).toBe('scroll')
    expect(hasClass(viewport, `${C}scroll-area-viewport`)).toBe(true)
  })

  it('Progress at value={null}: data-indeterminate on the Indicator, with -value-bar-indicator', async () => {
    await renderScene('progress', { 'Progress.Root': { value: INDETERMINATE } })
    const indicator = part('Progress.Indicator')
    expect(hasItem(indicator, 'data-indeterminate')).toBe(true)
    expect(hasClass(indicator, `${C}value-bar-indicator`)).toBe(true)
    recordCarried(indicator, 'data-indeterminate')
  })

  for (const side of ['inline-start', 'inline-end']) {
    it(`Toast.Arrow of an anchored toast carries data-side="${side}" with -arrow and -arrow-inline`, async () => {
      await renderScene('toast', { 'Toast.Anchored': { side } })
      const arrow = part('Toast.Arrow')
      expect(arrow, 'Toast.Arrow rendered').toBeDefined()
      expect(hasItem(arrow, 'data-side', side)).toBe(true)
      expect(hasClass(arrow, `${C}arrow`)).toBe(true)
      expect(hasClass(arrow, `${C}arrow-inline`)).toBe(true)
      recordCarried(arrow, 'data-side', side)
    })

    it(`NavigationMenu.Arrow of an open menu carries data-side="${side}" with -arrow and -arrow-inline, for side="${side}"`, async () => {
      await renderScene('navigation-menu', {
        ...navigationMenuOpenProps(),
        'NavigationMenu.Positioner': { side },
      })
      const arrow = part('NavigationMenu.Arrow')
      expect(arrow, 'NavigationMenu.Arrow rendered').toBeDefined()
      expect(hasItem(arrow, 'data-side', side)).toBe(true)
      expect(hasClass(arrow, `${C}arrow`)).toBe(true)
      expect(hasClass(arrow, `${C}arrow-inline`)).toBe(true)
      recordCarried(arrow, 'data-side', side)
    })
  }

  it("has recorded every pair of this file's table", () => {
    expect(unrecordedPairs(RGEN_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('scroll-area-thumb', 'data-planted')] })).toEqual([
      'nave-base-ui-scroll-area-thumb data-planted',
    ])
  })
})

describe('AC-base-ui-feedback-navigation-39: no new data-* carrier carries an ARIA counterpart', () => {
  it('data-orientation on a Scrollbar or a Thumb carries no aria-orientation', async () => {
    await renderScene('scroll-area')
    for (const marker of ['ScrollArea.Scrollbar', 'ScrollArea.Thumb']) {
      const elements = partsNamed(marker)
      // The control: both orientations were rendered, so both were looked at.
      expect(elements).toHaveLength(2)
      for (const element of elements) {
        expect(Object.hasOwn(element.dataset, 'orientation'), marker).toBe(true)
        expect(element.hasAttribute('aria-orientation'), marker).toBe(false)
      }
    }
  })

  it('data-indeterminate on any part of the Progress carries no aria-checked, aria-pressed or aria-valuenow', async () => {
    await renderScene('progress', { 'Progress.Root': { value: INDETERMINATE } })
    const carriers = ['Root', 'Label', 'Value', 'Track', 'Indicator'].map((name) =>
      part(`Progress.${name}`),
    )
    for (const element of carriers) {
      expect(element?.hasAttribute('data-indeterminate')).toBe(true)
      for (const name of ['aria-checked', 'aria-pressed', 'aria-valuenow']) {
        expect(element?.hasAttribute(name), name).toBe(false)
      }
    }
  })

  it('data-has-overflow-x and -y on an overflowing Viewport carry no aria-* attribute at all', async () => {
    // Stand-in for the browser's layout, so the Viewport carries the attributes (the Tier B row is the credited one).
    const restore = overflowingLayout()
    try {
      await renderScene('scroll-area')
      const viewport = part('ScrollArea.Viewport')
      expect(viewport?.hasAttribute('data-has-overflow-x')).toBe(true)
      expect(viewport?.hasAttribute('data-has-overflow-y')).toBe(true)
      expect(viewport?.getAttributeNames().filter((name) => name.startsWith('aria-'))).toEqual([])
    } finally {
      restore()
    }
  })
})
