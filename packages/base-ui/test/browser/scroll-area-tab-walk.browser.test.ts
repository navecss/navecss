/**
 * AC-base-ui-feedback-navigation-30: a focused child's ring on an up-and-down Tab walk at the 28px
 * gutter, on the block axis only, in headless Chromium.
 *
 * A Scroll Area 360 by 220 px holds one column of 14 Nave buttons at the inline start and a spacer
 * wider than the Viewport, so both strips appear. Tab goes forward through the 14 buttons, 120ms
 * between keys, then Shift+Tab back through them. At every position the focused button's ring band
 * (W + O out from its border box, 4px) has to lie inside the scrollport on the block axis and clear
 * of the horizontal strip and the corner; at maximum scroll the last button's band has to end 24px
 * above the Viewport's block-end edge.
 *
 * The positive control plants `scroll-padding-block-end: 4px` over the shipped gutter and has to
 * put a ring under the strip at one or more positions: a walk that finds none there would find none
 * anywhere, and the zero is not credited.
 *
 * This asserts no inline-axis (sideways) Tab state and no Firefox or WebKit Tab state; those are a
 * record (`owz2`), and no criterion of the spec claims them.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Button } from '../../dist/button/index.js'
import { framesLater } from './support/frames.ts'
import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { ring } from './support/w7-css.ts'
import { isOverlapping, parkPointer, required, TOUCH } from './support/w11-page.ts'
import {
  cornerOf,
  maximumScroll,
  measured,
  scrollArea,
  type ScrollAreaParts,
} from './support/w11-scroll-area.ts'

const BUTTONS = 14
/**
The time between keys, as the spec gives it.
 */
const KEY_INTERVAL = 120
const MOST_PRESSES = 40
/**
The Viewport's padding at rest, and its gutter on the edges a strip sits on.
 */
const REST = 4
const GUTTER = 28
const STRIP = 24

/**
The shipped gutter overridden by the stylesheet's own value for a bare 4px: unlayered, so it wins.
 */
const PLANTED_SCROLL_PADDING = `
.nave-base-ui-scroll-area-viewport[data-has-overflow-x] { scroll-padding-block-end: var(--nave-spacing-control-xs); }
`

interface Reading {
  readonly clearOfStrip: boolean
  readonly drawsRing: boolean
  readonly insideScrollportOnBlockAxis: boolean
  readonly label: string
  readonly shortOfEdge: number
}

const itemId = (position: number): string => `item-${String(position)}`

const scene = (): ReturnType<typeof h> =>
  h(
    'div',
    { style: { padding: 24 } },
    h('button', { 'data-testid': 'before' }, 'Before'),
    scrollArea(
      h(
        'div',
        {},
        h(
          'div',
          { style: { alignItems: 'flex-start', display: 'flex', flexDirection: 'column', gap: 8 } },
          ...Array.from({ length: BUTTONS }, (_, index) =>
            h(
              Button,
              { 'data-testid': itemId(index + 1), key: index },
              `Item ${String(index + 1)}`,
            ),
          ),
        ),
        h('div', { style: { height: 1, width: 600 } }),
      ),
    ),
  )

const pause = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, KEY_INTERVAL)
  })
  await framesLater(2)
}

const focusedItem = (): number | undefined => {
  for (let position = 1; position <= BUTTONS; position += 1) {
    if (document.activeElement === required(itemId(position))) {
      return position
    }
  }
  return undefined
}

/**
 * Where the focused button's ring band lies against the Viewport and the strips, read after the
 * engine has finished scrolling to it.
 */
const read = (parts: ScrollAreaParts, position: number, direction: string): Reading => {
  const button = required(itemId(position))
  const reach = ring().offset + ring().width
  const box = button.getBoundingClientRect()
  const band = new DOMRect(
    box.left - reach,
    box.top - reach,
    box.width + 2 * reach,
    box.height + 2 * reach,
  )
  const port = parts.viewport.getBoundingClientRect()
  const style = getComputedStyle(button)
  return {
    clearOfStrip:
      !isOverlapping(band, parts.scrollbarX.getBoundingClientRect()) &&
      !isOverlapping(band, cornerOf(parts).getBoundingClientRect()),
    drawsRing:
      style.outlineStyle === 'solid' &&
      style.outlineWidth === '2px' &&
      style.outlineOffset === '2px',
    insideScrollportOnBlockAxis: band.top >= port.top - TOUCH && band.bottom <= port.bottom + TOUCH,
    label: `${direction} at item ${String(position)}`,
    shortOfEdge: port.bottom - band.bottom,
  }
}

/**
 * Presses Tab, or Shift+Tab, until the focus has been on each button in turn, and reads each
 * position. Returns the readings in order.
 */
const walk = async (parts: ScrollAreaParts, isShift: boolean): Promise<Reading[]> => {
  const readings: Reading[] = []
  const direction = isShift ? 'backward' : 'forward'
  const last = isShift ? 1 : BUTTONS
  for (let presses = 0; presses < MOST_PRESSES; presses += 1) {
    await userEvent.tab({ shift: isShift })
    await pause()
    const position = focusedItem()
    if (position !== undefined) {
      readings.push(read(parts, position, direction))
      if (position === last) {
        return readings
      }
    }
  }
  throw new Error(`the ${direction} walk never reached item ${String(last)}`)
}

describe('AC-base-ui-feedback-navigation-30: a focused child ring on an up-and-down Tab walk at the 28px gutter', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  afterEach(() => {
    page?.dispose()
    removeSheets?.()
    page = undefined
  })

  /**
  Mounts the scene, checks the walk's preconditions, puts focus on the button before the Scroll Area and
  returns the parts.
   */
  const start = async (extra = ''): Promise<ScrollAreaParts> => {
    removeSheets = useSheets(tokens, stylesheet, extra)
    await parkPointer()
    page = mount(scene())
    const parts = await measured('both')
    const port = parts.viewport.getBoundingClientRect()
    for (let position = 1; position <= BUTTONS; position += 1) {
      const box = required(itemId(position)).getBoundingClientRect()
      expect(
        box.left,
        `item ${String(position)} starts inside the scrollport`,
      ).toBeGreaterThanOrEqual(port.left + REST - TOUCH)
      expect(box.right, `item ${String(position)} ends inside the scrollport`).toBeLessThanOrEqual(
        port.right - GUTTER + TOUCH,
      )
      expect(
        box.height,
        `item ${String(position)} fits the Viewport less its scroll padding`,
      ).toBeLessThanOrEqual(port.height - REST - GUTTER)
    }
    expect(
      parts.scrollbarX.getBoundingClientRect().height,
      'the horizontal strip is the 24px one',
    ).toBeCloseTo(STRIP, 2)
    required('before').focus()
    return parts
  }

  it(
    'AC-base-ui-feedback-navigation-30: at every position forward and back the ring band is inside the scrollport and clear of the horizontal strip and the corner',
    { timeout: 60_000 },
    async () => {
      const parts = await start()
      const forward = await walk(parts, false)
      const atLast = maximumScroll(parts.viewport).top - parts.viewport.scrollTop
      const backward = await walk(parts, true)
      expect(forward.length, 'every button was reached going forward').toBe(BUTTONS)
      expect(backward.length, 'every button was reached coming back').toBe(BUTTONS - 1)
      const unclear = [...forward, ...backward].filter(
        (reading) => !reading.insideScrollportOnBlockAxis || !reading.clearOfStrip,
      )
      expect(
        unclear.map((reading) => reading.label),
        'the positions where the ring band leaves the scrollport or meets the strip or the corner',
      ).toEqual([])
      const noRing = [...forward, ...backward].filter((reading) => !reading.drawsRing)
      expect(
        noRing.map((reading) => reading.label),
        'the positions where the focused button draws no focus ring, so that nothing was measured',
      ).toEqual([])
      expect(Math.abs(atLast), 'the last button was reached at maximum scroll').toBeLessThanOrEqual(
        1,
      )
      const lastReading = forward.at(-1)
      expect(
        lastReading?.shortOfEdge,
        'the last ring band ends this far above the Viewport block-end edge',
      ).toBeGreaterThanOrEqual(GUTTER - ring().offset - ring().width - TOUCH)
    },
  )

  it(
    'AC-base-ui-feedback-navigation-30: the positive control, with scroll-padding-block-end planted at 4px the walk finds a ring under the strip',
    { timeout: 60_000 },
    async () => {
      const parts = await start(PLANTED_SCROLL_PADDING)
      expect(getComputedStyle(parts.viewport).scrollPaddingBottom, 'the plant took').toBe('4px')
      const readings = [...(await walk(parts, false)), ...(await walk(parts, true))]
      const under = readings.filter((reading) => !reading.clearOfStrip)
      expect(
        under.length,
        'the positions where the planted 4px puts a ring under the strip or the corner; if none, the zero is not credited and the row returns to STEWARD',
      ).toBeGreaterThan(0)
    },
  )
})
