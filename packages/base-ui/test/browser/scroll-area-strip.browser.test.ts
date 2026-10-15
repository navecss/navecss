/**
 * AC-base-ui-feedback-navigation-45, second scenario: the Scroll Area strip is one 24px target, at
 * every Base UI minor from 1.3.0 to the one the package is developed against.
 *
 * `vitest.browser.config.ts` runs this file in the project for each minor, through the manifest's
 * aliases, so it imports nothing but the Scroll Area wrapper from the package. The Root is 360 by
 * 220 px with content overflowing both axes, so each strip is longer than 24px (its length is the
 * reader's and is not asserted). Each Scrollbar's thin dimension is measured; every pixel across it
 * is hit-tested along the line through the Thumb's centre; and a pointer pressed 1px inside the
 * strip's outer edge and moved 30px along it must scroll the Viewport.
 *
 * The controls: the same press-and-move started on the Thumb scrolls the Viewport too (so a
 * press that scrolls nothing is the strip's, not the instrument's), and the earlier 12px strip
 * (`-scroll-area-scrollbar`, 458 B `b6d8420edcd5b266`) measures below 24 and reds the first clause.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { afterEach, describe, expect, inject, it } from 'vitest'

import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import {
  measureControlRule,
  replaceRule,
  SCROLLBAR,
  SCROLLBAR_12PX_STRIP,
} from './support/w11-controls.ts'
import { parkPointer } from './support/w11-page.ts'
import {
  measured,
  overflowingContent,
  pointAcross,
  pressAndMove,
  scrollArea,
  type ScrollAreaParts,
  scrollTo,
  thinDimension,
  thumbCentre,
} from './support/w11-scroll-area.ts'

/**
SC 2.5.8's minimum, in CSS px, and the distance the pointer moves along the strip.
 */
const MINIMUM = 24
const MOVE = 30
/**
Edges are found to a 64th of a pixel: a shortfall of one 64th fails.
 */
const SHORTFALL = 0.005

type Orientation = 'horizontal' | 'vertical'

const ORIENTATIONS: readonly Orientation[] = ['vertical', 'horizontal']

const stripOf = (parts: ScrollAreaParts, orientation: Orientation): HTMLElement =>
  orientation === 'vertical' ? parts.scrollbarY : parts.scrollbarX

const thumbOf = (parts: ScrollAreaParts, orientation: Orientation): HTMLElement =>
  orientation === 'vertical' ? parts.thumbY : parts.thumbX

const scrolled = (parts: ScrollAreaParts, orientation: Orientation): number =>
  orientation === 'vertical' ? parts.viewport.scrollTop : parts.viewport.scrollLeft

/**
The first clause: the strip's thin dimension is at least the minimum.
 */
const expectThinAtLeastMinimum = (strip: HTMLElement): void => {
  expect(thinDimension(strip), 'the strip thin dimension').toBeGreaterThanOrEqual(
    MINIMUM - SHORTFALL,
  )
}

describe(`AC-base-ui-feedback-navigation-45: the Scroll Area strip is one 24px target (Base UI ${inject('baseUi')})`, () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  afterEach(() => {
    page?.dispose()
    removeSheets?.()
    page = undefined
  })

  const show = async (sheet = stylesheet): Promise<ScrollAreaParts> => {
    removeSheets = useSheets(tokens, sheet)
    await parkPointer()
    page = mount(h('div', { style: { padding: 24 } }, scrollArea(overflowingContent())))
    const parts = await measured('both')
    expect(getComputedStyle(document.documentElement).fontSize, 'the default root size').toBe(
      '16px',
    )
    await scrollTo(parts.viewport, 0, 0)
    return parts
  }

  describe.each(ORIENTATIONS)('the %s strip', (orientation) => {
    it(`AC-base-ui-feedback-navigation-45: the ${orientation} strip measures at least 24 CSS px across`, async () => {
      const parts = await show()
      const strip = stripOf(parts, orientation)
      expect(strip.dataset.orientation, 'the strip is the one the case names').toBe(orientation)
      expectThinAtLeastMinimum(strip)
    })

    it(`AC-base-ui-feedback-navigation-45: every pixel across the ${orientation} strip hit-tests to the Scrollbar or its Thumb`, async () => {
      const parts = await show()
      const strip = stripOf(parts, orientation)
      const thumb = thumbOf(parts, orientation)
      const across = Math.round(thinDimension(strip))
      const hits = Array.from({ length: across }, (_, step) => {
        const { x, y } = pointAcross(strip, thumb, step)
        return document.elementFromPoint(x, y)
      })
      const stray = hits
        .map((hit, step) => ({ hit, step }))
        .filter(({ hit }) => hit !== strip && hit !== thumb && !thumb.contains(hit))
      expect(
        stray.map(({ step, hit }) => `${String(step)}px: ${hit?.tagName ?? 'nothing'}`),
        'the points across the strip that hit something else',
      ).toEqual([])
      // The instrument's controls: the line crosses the Thumb as well as the strip around it.
      expect(hits.filter((hit) => hit === thumb).length, 'points on the Thumb').toBeGreaterThan(0)
      expect(hits.filter((hit) => hit === strip).length, 'points on the strip').toBeGreaterThan(0)
    })

    it(`AC-base-ui-feedback-navigation-45: a press 1px inside the ${orientation} strip outer edge, moved ${String(MOVE)}px along it, scrolls the Viewport`, async () => {
      const parts = await show()
      const strip = stripOf(parts, orientation)
      const centre = thumbCentre(strip, thumbOf(parts, orientation))
      expect(scrolled(parts, orientation), 'the Viewport starts at the start').toBe(0)
      await pressAndMove(strip, { across: thinDimension(strip) - 1, along: centre.along }, MOVE)
      expect(scrolled(parts, orientation), 'the Viewport scroll offset').toBeGreaterThan(0)
    })

    it(`AC-base-ui-feedback-navigation-45: the control, the same press-and-move started on the ${orientation} Thumb scrolls the Viewport too`, async () => {
      const parts = await show()
      const strip = stripOf(parts, orientation)
      const centre = thumbCentre(strip, thumbOf(parts, orientation))
      expect(scrolled(parts, orientation), 'the Viewport starts at the start').toBe(0)
      await pressAndMove(strip, centre, MOVE)
      expect(scrolled(parts, orientation), 'the Viewport scroll offset').toBeGreaterThan(0)
    })

    it(`AC-base-ui-feedback-navigation-45: the bound control, the 12px ${orientation} strip measures below 24 and reds the first clause`, async () => {
      const parts = await show(replaceRule(stylesheet, SCROLLBAR, SCROLLBAR_12PX_STRIP.text))
      const strip = stripOf(parts, orientation)
      expect(thinDimension(strip), 'the earlier 12px strip').toBeCloseTo(12, 2)
      expect(() => {
        expectThinAtLeastMinimum(strip)
      }, 'the first clause on the 12px strip').toThrow()
    })
  })

  it('AC-base-ui-feedback-navigation-45: the control rules are the spec bytes, 450 B for the shipped strip and 458 B for the earlier 12px strip', async () => {
    expect(await measureControlRule(SCROLLBAR), 'the shipped strip rule').toEqual({
      bytes: 450,
      hash: '7145173da3a49712',
    })
    expect(await measureControlRule(SCROLLBAR_12PX_STRIP), 'the earlier 12px strip rule').toEqual({
      bytes: 458,
      hash: 'b6d8420edcd5b266',
    })
    expect(
      stylesheet.split(SCROLLBAR.text).length - 1,
      'copies of the shipped strip rule in the built stylesheet',
    ).toBe(1)
  })
})
