/**
 * AC-base-ui-feedback-navigation-26, second scenario: the current link's underline clears the
 * focus ring at three line heights, and moving the current page moves nothing. A real engine, the
 * built tokens, Nave's reset and the built stylesheet, through the built wrappers, in light and in
 * dark. The menu is open with a two-column panel of six links, one of them `active`; a reader's rule
 * `@layer overrides { .probe a { line-height: <lh> } }` sets the line height, and the underline's
 * ink is found by a pixel scan below the link's border box with the glyphs and the ring made
 * transparent.
 *
 * Two controls. The earlier bytes (no `padding-block`) at `line-height: 1` put ink inside the
 * ring's band. The keyed form (`padding-block` inside `[aria-current="page"]`) moves a sibling by
 * 8px when `active` moves. Each form is checked against the byte count and hash the spec prints
 * before it is used.
 */
import type { ReactNode } from 'react'

import reset from '@navecss/core/reset?raw'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { isReachedWithin, MAX_FRAMES } from './support/frames.ts'
import {
  byTestId,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { colorOf, px, ring, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w8-actions.ts'
import { atRest } from './support/w8-watch.ts'
import { underlineInk } from './support/w10-ink.ts'
import { allLinks, navScene } from './support/w10-nav.ts'
import {
  CURRENT_LINK_KEYED,
  CURRENT_LINK_WITHOUT_PADDING,
  printedForm,
  withRule,
} from './support/w10-sheets.ts'

const LINE_HEIGHTS = ['normal', '1.2', '1'] as const

/**
The index of the Guides link that is current, and the one it moves to.
 */
const CURRENT = 2
const MOVED_TO = 4

const probe = (lineHeight: string): string =>
  `@layer overrides { .probe a { line-height: ${lineHeight} } }`

/**
 * The setter of the page's current link, which the test calls from outside the page: a click on a
 * button outside the menu, even one sent by script, is a press outside the panel and closes it.
 */
const control: { setIndex: ((index: number) => void) | undefined } = { setIndex: undefined }

/**
The menu, its current page held in state so that the test can move it.
 */
const Switchable = (): ReactNode => {
  const [index, setIndex] = useState(0)
  control.setIndex = setIndex
  return navScene({ activeIndex: index, probeClass: 'probe' })
}

interface LinkBox {
  readonly height: number
  readonly left: number
  readonly top: number
  readonly width: number
}

/**
The boxes of the links on the page, by test id, from the popup's own corner so that the popup moving moves none of them.
 */
const boxesInPopup = (popup: HTMLElement): Map<string, LinkBox> => {
  const origin = popup.getBoundingClientRect()
  return new Map(
    allLinks()
      .filter((link) => popup.contains(link))
      .map((link) => {
        const box = link.getBoundingClientRect()
        return [
          link.dataset.testid ?? '',
          {
            height: box.height,
            left: box.left - origin.left,
            top: box.top - origin.top,
            width: box.width,
          },
        ] as const
      }),
  )
}

const largestMove = (before: Map<string, LinkBox>, after: Map<string, LinkBox>): number => {
  let largest = 0
  for (const [id, box] of before) {
    const moved = after.get(id)
    expect(moved, `${id} is still on the page`).toBeDefined()
    largest = Math.max(
      largest,
      Math.abs(moved!.top - box.top),
      Math.abs(moved!.left - box.left),
      Math.abs(moved!.height - box.height),
      Math.abs(moved!.width - box.width),
    )
  }
  return largest
}

describe('AC-base-ui-feedback-navigation-26 (second scenario): the current link and its underline', () => {
  let mounted: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(() => {
    mounted?.dispose()
    removeScheme?.()
    removeSheets?.()
    mounted = undefined
  })

  /**
   * Opens the menu on its Guides panel with the reader's line height and returns the popup. The
   * sheets are in the order a consumer loads them: tokens, the reset, then Nave's stylesheet.
   */
  const open = async (
    scheme: Scheme,
    lineHeight: string,
    options: { readonly isSwitchable?: boolean; readonly sheet?: string } = {},
  ): Promise<HTMLElement> => {
    const { isSwitchable = false, sheet = stylesheet } = options
    removeSheets = useSheets(tokens, reset, sheet, probe(lineHeight))
    removeScheme = useScheme(scheme)
    mounted = mount(
      isSwitchable ? h(Switchable) : navScene({ activeIndex: CURRENT, probeClass: 'probe' }),
    )
    await settled(() => byTestId('trigger-guides'))
    await userEvent.click(required('trigger-guides'))
    await settled(() => byTestId('panel-link-0'))
    return atRest('popup')
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    describe.each(LINE_HEIGHTS)('at line-height %s', (lineHeight) => {
      it('AC-base-ui-feedback-navigation-26 (Tier B): the current link computes a 4px underline in its text colour, the next link the default one, and every link a 4px block padding', async () => {
        await open(scheme, lineHeight)
        const current = required(`panel-link-${String(CURRENT)}`)
        const neighbour = required(`panel-link-${String(CURRENT + 1)}`)
        expect(current.getAttribute('aria-current'), 'the current link').toBe('page')
        expect(neighbour.hasAttribute('aria-current'), 'its neighbour').toBe(false)
        const style = getComputedStyle(current)
        expect(style.textDecorationThickness).toBe('4px')
        expect(style.textDecorationColor, 'in the colour of the link').toBe(style.color)
        expect(style.color).toBe(colorOf('var(--nave-color-content-link)'))
        expect(getComputedStyle(neighbour).textDecorationThickness).toBe('auto')
        const links = allLinks()
        expect(links.length, 'the top-level link and the six in the panel').toBe(7)
        for (const link of links) {
          const padding = getComputedStyle(link)
          expect(
            [padding.paddingTop, padding.paddingBottom],
            `${link.dataset.testid ?? ''} padding`,
          ).toEqual(['4px', '4px'])
        }
      })

      it('AC-base-ui-feedback-navigation-26 (Tier B): the underline ink lies no deeper than the link border-box edge, so none is inside the ring band', async () => {
        const popup = await open(scheme, lineHeight)
        const current = required(`panel-link-${String(CURRENT)}`)
        current.focus()
        const ink = await underlineInk(popup, current)
        expect(
          ink.rows,
          'rows of ink: the underline is there to be located',
        ).toBeGreaterThanOrEqual(3)
        expect(ink.rows, 'rows of ink: it is a 4px underline').toBeLessThanOrEqual(5)
        // One pixel of slack is the pixel grid: the border box rarely ends on a whole pixel.
        expect(ink.depth, 'the ink below the border-box edge').toBeLessThanOrEqual(1)
      }, 30_000)

      it('AC-base-ui-feedback-navigation-26 (Tier B): moving active from the first link to the fifth changes no link box by more than 0.5px', async () => {
        const popup = await open(scheme, lineHeight, { isSwitchable: true })
        const before = boxesInPopup(popup)
        control.setIndex?.(MOVED_TO)
        const isMoved = await isReachedWithin(
          () => required(`panel-link-${String(MOVED_TO)}`).hasAttribute('aria-current'),
          MAX_FRAMES,
        )
        expect(isMoved, 'the current page moved').toBe(true)
        expect(
          required('panel-link-0').hasAttribute('aria-current'),
          'and left the first link',
        ).toBe(false)
        await atRest('popup')
        expect(
          largestMove(before, boxesInPopup(popup)),
          'largest change of a box',
        ).toBeLessThanOrEqual(0.5)
      }, 30_000)
    })
  })

  it('AC-base-ui-feedback-navigation-26 (Tier B, control): the earlier bytes with no padding-block put ink inside the ring band at line-height 1', async () => {
    const form = await printedForm(CURRENT_LINK_WITHOUT_PADDING, {
      bytes: 157,
      hash: '89711ea1afd33b28',
    })
    const popup = await open('light', '1', { sheet: withRule(stylesheet, 'current-link', form) })
    const current = required(`panel-link-${String(CURRENT)}`)
    current.focus()
    const ink = await underlineInk(popup, current)
    expect(ink.rows, 'the underline is there to be located').toBeGreaterThanOrEqual(3)
    const { offset } = ring()
    expect(ink.depth, 'the ink is deeper than the ring offset: inside the band').toBeGreaterThan(
      offset,
    )
    expect(px(getComputedStyle(current).paddingBottom), 'no block padding').toBe(0)
  }, 30_000)

  it('AC-base-ui-feedback-navigation-26 (Tier B, reflow control): the keyed form moves a sibling by 8px when active moves', async () => {
    const form = await printedForm(CURRENT_LINK_KEYED, { bytes: 201, hash: '1aba28783d7d6392' })
    const popup = await open('light', 'normal', {
      isSwitchable: true,
      sheet: withRule(stylesheet, 'current-link', form),
    })
    const before = boxesInPopup(popup)
    control.setIndex?.(MOVED_TO)
    await isReachedWithin(
      () => required(`panel-link-${String(MOVED_TO)}`).hasAttribute('aria-current'),
      MAX_FRAMES,
    )
    await atRest('popup')
    expect(
      largestMove(before, boxesInPopup(popup)),
      'largest change of a box',
    ).toBeGreaterThanOrEqual(7.5)
  }, 30_000)
})
