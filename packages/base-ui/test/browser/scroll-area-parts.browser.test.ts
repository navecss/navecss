/**
 * AC-base-ui-feedback-navigation-28, the Tier B clause: what the Viewport reports about overflow in
 * a real engine. AC-base-ui-feedback-navigation-29: the Scroll Area's marks are always painted,
 * opaque, and survive forced colours; the strips, thumbs and corner have the spec's geometry, the
 * thumb's arithmetic is exact, and the Viewport keeps the browser's own focus ring.
 *
 * Measured in headless Chromium with the built tokens and stylesheet, through the built wrappers,
 * in light and in dark (jsdom has no layout). The control of the last scenario takes the strip's
 * rule out of the stylesheet by its exact bytes (`support/w11-controls.ts`).
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { colorOf, emulateForcedColors, lengthOf, SCHEMES, useScheme } from './support/w7-css.ts'
import { replaceRule, SCROLLBAR, THUMB } from './support/w11-controls.ts'
import { parkPointer, required, TOLERANCE } from './support/w11-page.ts'
import {
  cornerOf,
  fittingContent,
  maximumScroll,
  measured,
  overflowingContent,
  scrollArea,
  type ScrollAreaParts,
  scrollTo,
  thinDimension,
} from './support/w11-scroll-area.ts'

/**
The strip, the thumb's stroke and the corner, in CSS px at the default root size.
 */
const STRIP = 24
const STROKE = 2
const ACROSS = 4
const INSET = 10
/**
The Viewport's padding and scroll padding: the 4px it keeps at rest, and the 28px gutter (the strip
plus the ring's reach) on the edges a strip sits on.
 */
const REST = 4
const GUTTER = 28

const transparent = 'rgba(0, 0, 0, 0)'
const EDGES = ['Top', 'Right', 'Bottom', 'Left'] as const

describe('AC-base-ui-feedback-navigation-28 and -29: the Scroll Area in a real engine', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(async () => {
    await emulateForcedColors('none')
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  /**
  Mounts the scene in the given scheme under the given stylesheet and returns the measured parts.
   */
  const show = async (
    scheme: 'dark' | 'light',
    { content = 'overflowing', sheet = stylesheet } = {},
  ): Promise<ScrollAreaParts> => {
    removeScheme = useScheme(scheme)
    removeSheets = useSheets(tokens, sheet)
    await parkPointer()
    page = mount(
      h(
        'div',
        { style: { padding: 24 } },
        scrollArea(content === 'overflowing' ? overflowingContent() : fittingContent()),
      ),
    )
    return measured(content === 'overflowing' ? 'both' : 'none')
  }

  describe('AC-base-ui-feedback-navigation-28: the overflow the Viewport reports', () => {
    it('AC-base-ui-feedback-navigation-28: with content overflowing both axes the Viewport carries data-has-overflow-x and -y and tabindex 0', async () => {
      const { viewport } = await show('light')
      expect(viewport.scrollWidth, 'the content is wider than the Viewport').toBeGreaterThan(
        viewport.clientWidth,
      )
      expect(viewport.scrollHeight, 'the content is taller than the Viewport').toBeGreaterThan(
        viewport.clientHeight,
      )
      expect(Object.hasOwn(viewport.dataset, 'hasOverflowX'), 'data-has-overflow-x').toBe(true)
      expect(Object.hasOwn(viewport.dataset, 'hasOverflowY'), 'data-has-overflow-y').toBe(true)
      expect(viewport.getAttribute('tabindex'), 'tabindex').toBe('0')
    })

    it('AC-base-ui-feedback-navigation-28: with content that does not overflow neither attribute is there and tabindex is -1', async () => {
      const { viewport } = await show('light', { content: 'fitting' })
      expect(viewport.scrollWidth, 'the content fits across').toBeLessThanOrEqual(
        viewport.clientWidth,
      )
      expect(viewport.scrollHeight, 'the content fits down').toBeLessThanOrEqual(
        viewport.clientHeight,
      )
      expect(Object.hasOwn(viewport.dataset, 'hasOverflowX'), 'data-has-overflow-x').toBe(false)
      expect(Object.hasOwn(viewport.dataset, 'hasOverflowY'), 'data-has-overflow-y').toBe(false)
      expect(viewport.getAttribute('tabindex'), 'tabindex').toBe('-1')
    })
  })

  describe.each(SCHEMES)('AC-base-ui-feedback-navigation-29 in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-29: the strips are 24px and opaque, the corner 24 by 24, all painted with no hover', async () => {
      const parts = await show(scheme)
      const surface = colorOf('var(--nave-color-surface-base)')
      expect(parts.scrollbarY.getBoundingClientRect().width, 'vertical strip width').toBeCloseTo(
        STRIP,
        2,
      )
      expect(
        parts.scrollbarX.getBoundingClientRect().height,
        'horizontal strip height',
      ).toBeCloseTo(STRIP, 2)
      const corner = cornerOf(parts).getBoundingClientRect()
      expect(corner.width, 'corner width').toBeCloseTo(STRIP, 2)
      expect(corner.height, 'corner height').toBeCloseTo(STRIP, 2)
      for (const [name, element] of [
        ['vertical strip', parts.scrollbarY],
        ['horizontal strip', parts.scrollbarX],
        ['corner', cornerOf(parts)],
      ] as const) {
        const { backgroundColor } = getComputedStyle(element)
        expect(backgroundColor, `${name}'s background`).toBe(surface)
        expect(backgroundColor, `${name}'s background has no alpha`).not.toContain('/')
        expect(backgroundColor, `${name}'s background is not transparent`).not.toBe(transparent)
      }
      for (const [name, element] of [
        ['vertical strip', parts.scrollbarY],
        ['horizontal strip', parts.scrollbarX],
        ['vertical thumb', parts.thumbY],
        ['horizontal thumb', parts.thumbX],
        ['corner', cornerOf(parts)],
      ] as const) {
        const box = element.getBoundingClientRect()
        expect(getComputedStyle(element).visibility, `${name} is visible`).toBe('visible')
        expect(getComputedStyle(element).opacity, `${name} is opaque`).toBe('1')
        expect(box.width * box.height, `${name} has an area`).toBeGreaterThan(0)
      }
      expect(Object.hasOwn(parts.scrollbarY.dataset, 'hovering'), 'nothing is hovered').toBe(false)
      expect(Object.hasOwn(parts.scrollbarX.dataset, 'hovering'), 'nothing is hovered').toBe(false)
    })

    it('AC-base-ui-feedback-navigation-29: each thumb draws two 2px strokes in the control border colour, 4px across, 10px from each long edge', async () => {
      const parts = await show(scheme)
      const stroke = colorOf('var(--nave-color-border-control)')
      expect(lengthOf('var(--nave-border-width-lg)'), 'the token the stroke halves').toBe(ACROSS)
      const vertical = getComputedStyle(parts.thumbY)
      const horizontal = getComputedStyle(parts.thumbX)
      for (const edge of ['Left', 'Right'] as const) {
        expect(vertical[`border${edge}Width`], `vertical thumb, ${edge} stroke`).toBe(
          `${String(STROKE)}px`,
        )
        expect(vertical[`border${edge}Style`], `vertical thumb, ${edge} style`).toBe('solid')
        expect(vertical[`border${edge}Color`], `vertical thumb, ${edge} colour`).toBe(stroke)
      }
      for (const edge of ['Top', 'Bottom'] as const) {
        expect(horizontal[`border${edge}Width`], `horizontal thumb, ${edge} stroke`).toBe(
          `${String(STROKE)}px`,
        )
        expect(horizontal[`border${edge}Style`], `horizontal thumb, ${edge} style`).toBe('solid')
        expect(horizontal[`border${edge}Color`], `horizontal thumb, ${edge} colour`).toBe(stroke)
      }
      const stripY = parts.scrollbarY.getBoundingClientRect()
      const thumbY = parts.thumbY.getBoundingClientRect()
      expect(thumbY.width, 'vertical thumb, across').toBeCloseTo(ACROSS, 2)
      expect(thumbY.left - stripY.left, 'vertical thumb, from the strip start edge').toBeCloseTo(
        INSET,
        2,
      )
      expect(stripY.right - thumbY.right, 'vertical thumb, from the strip end edge').toBeCloseTo(
        INSET,
        2,
      )
      const stripX = parts.scrollbarX.getBoundingClientRect()
      const thumbX = parts.thumbX.getBoundingClientRect()
      expect(thumbX.height, 'horizontal thumb, across').toBeCloseTo(ACROSS, 2)
      expect(thumbX.top - stripX.top, 'horizontal thumb, from the strip start edge').toBeCloseTo(
        INSET,
        2,
      )
      expect(
        stripX.bottom - thumbX.bottom,
        'horizontal thumb, from the strip end edge',
      ).toBeCloseTo(INSET, 2)
    })

    it('AC-base-ui-feedback-navigation-29: the Viewport pads 4px at its block-start and inline-start and 28px at its block-end and inline-end, padding and scroll padding alike', async () => {
      const { viewport } = await show(scheme)
      const style = getComputedStyle(viewport)
      const expected = { Bottom: GUTTER, Left: REST, Right: GUTTER, Top: REST }
      for (const edge of EDGES) {
        expect(style[`padding${edge}`], `padding, ${edge}`).toBe(`${String(expected[edge])}px`)
        expect(style[`scrollPadding${edge}`], `scroll padding, ${edge}`).toBe(
          `${String(expected[edge])}px`,
        )
      }
    })

    it('AC-base-ui-feedback-navigation-29: the vertical thumb meets the strip at scroll 0 and at maximum scroll, and its length over the strip is client over scroll height', async () => {
      const { scrollbarY, thumbY, viewport } = await show(scheme)
      await scrollTo(viewport, 0, 0)
      const strip = scrollbarY.getBoundingClientRect()
      const atStart = thumbY.getBoundingClientRect()
      expect(
        Math.abs(atStart.top - strip.top),
        'the thumb starts at the strip start',
      ).toBeLessThanOrEqual(TOLERANCE)
      const ratio = viewport.clientHeight / viewport.scrollHeight
      expect(atStart.height / strip.height, 'thumb over strip, at the start').toBeCloseTo(ratio, 3)
      await scrollTo(viewport, 0, maximumScroll(viewport).top)
      expect(viewport.scrollTop, 'the Viewport is at its maximum').toBeCloseTo(
        maximumScroll(viewport).top,
        0,
      )
      const atEnd = thumbY.getBoundingClientRect()
      expect(
        Math.abs(atEnd.bottom - strip.bottom),
        'the thumb ends at the strip end',
      ).toBeLessThanOrEqual(TOLERANCE)
      expect(atEnd.height / strip.height, 'thumb over strip, at the end').toBeCloseTo(ratio, 3)
    })

    it('AC-base-ui-feedback-navigation-29: under forced colours each thumb keeps a solid border that is not transparent', async () => {
      const parts = await show(scheme)
      await emulateForcedColors('active')
      const vertical = getComputedStyle(parts.thumbY)
      const horizontal = getComputedStyle(parts.thumbX)
      for (const edge of ['Left', 'Right'] as const) {
        expect(vertical[`border${edge}Style`], `vertical thumb, ${edge} style`).toBe('solid')
        expect(vertical[`border${edge}Color`], `vertical thumb, ${edge} colour`).not.toBe(
          transparent,
        )
      }
      for (const edge of ['Top', 'Bottom'] as const) {
        expect(horizontal[`border${edge}Style`], `horizontal thumb, ${edge} style`).toBe('solid')
        expect(horizontal[`border${edge}Color`], `horizontal thumb, ${edge} colour`).not.toBe(
          transparent,
        )
      }
    })

    it('AC-base-ui-feedback-navigation-29: the Viewport focused by Tab is :focus-visible and draws the browser ring, outline-style auto', async () => {
      const { viewport } = await show(scheme)
      document.body.focus()
      await userEvent.tab()
      expect(document.activeElement, 'Tab lands on the Viewport').toBe(viewport)
      expect(viewport.matches(':focus-visible'), 'the Viewport matches :focus-visible').toBe(true)
      expect(getComputedStyle(viewport).outlineStyle, 'the ring is the browser own').toBe('auto')
    })

    it('AC-base-ui-feedback-navigation-29: the control, with the strip rule removed no 24px strip is painted, and with the thumb rule too no mark is', async () => {
      const withoutStrip = await show(scheme, { sheet: replaceRule(stylesheet, SCROLLBAR) })
      expect(thinDimension(withoutStrip.scrollbarY), 'the strip is no longer 24px').toBeLessThan(
        STRIP,
      )
      expect(
        getComputedStyle(withoutStrip.scrollbarY).backgroundColor,
        'the strip is not painted',
      ).toBe(transparent)
      expect(
        withoutStrip.viewport.offsetWidth - withoutStrip.viewport.clientWidth,
        'Base UI hides the native scrollbar, so none takes its place',
      ).toBe(0)
      page?.dispose()
      removeScheme?.()
      removeSheets?.()
      const withoutMarks = await show(scheme, {
        sheet: replaceRule(replaceRule(stylesheet, SCROLLBAR), THUMB),
      })
      const thumb = getComputedStyle(withoutMarks.thumbY)
      for (const edge of EDGES) {
        expect(thumb[`border${edge}Width`], `thumb, ${edge} stroke`).toBe('0px')
      }
      expect(thumb.backgroundColor, 'the thumb is not painted').toBe(transparent)
      expect(
        getComputedStyle(withoutMarks.scrollbarY).backgroundColor,
        'the strip is not painted',
      ).toBe(transparent)
      expect(required('thumb-y').getBoundingClientRect().width, 'the thumb has no width').toBe(0)
    })
  })
})
