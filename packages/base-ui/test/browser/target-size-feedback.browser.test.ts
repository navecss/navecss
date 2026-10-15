/**
 * AC-base-ui-feedback-navigation-45, first scenario: every interactive part this spec adds is at
 * least 24 by 24 CSS px where a pointer reaches it (WCAG 2.2 SC 2.5.8's minimum, `7g7e` signed),
 * by the method of AC-base-ui-bridge-35: a real engine with the built tokens, Nave's reset and the
 * built stylesheet, through the built wrappers, `document.elementFromPoint` along each part's centre
 * row and column (`support/hit-extent.ts`), at the default size and the listed sizes.
 *
 * The parts: `Toast.Action` and `Toast.Close` at `md` and `sm`, `NavigationMenu.Trigger`, and every
 * `NavigationMenu.Link`, which is 29px tall with the base `padding-block`.
 *
 * That the README states no 44px target is a document check, not a browser one.
 */
import type { ReactNode } from 'react'

import reset from '@navecss/core/reset?raw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { hitExtent } from './support/hit-extent.ts'
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
import { required } from './support/w8-actions.ts'
import { navScene } from './support/w10-nav.ts'
import { createManager, raise, type ToastManager, toastScene } from './support/w10-toast.ts'

/**
SC 2.5.8's minimum, in CSS px.
 */
const MINIMUM = 24
/**
Edges are found to 0.001px, and layout rounds to a 64th of a pixel: a shortfall of one 64th fails.
 */
const TOLERANCE = 0.005

/**
A link is as tall as its line plus the base block padding: 21 + 4 + 4.
 */
const LINK_HEIGHT = 29

interface Row {
  readonly part: string
  /**
  Opens what the part is in, after the scene is mounted.
   */
  readonly prepare?: () => Promise<void>
  readonly scene: () => ReactNode
  readonly subject: string
  /**
  The height the part is expected to have, where the spec gives one.
   */
  readonly height?: number
}

const toastRow = (part: 'action' | 'close', size: 'md' | 'sm'): Row => {
  let manager: ToastManager | undefined
  return {
    part: `Toast.${part === 'action' ? 'Action' : 'Close'} (${size})`,
    prepare: async () => {
      raise(manager!, 'one')
      await settled(() => byTestId('toast-one'))
    },
    scene: () => {
      manager = createManager()
      return toastScene({
        buttonProps: size === 'sm' ? { size: 'sm' } : {},
        hasAction: true,
        manager,
      })
    },
    subject: `${part}-one`,
  }
}

const rows: readonly Row[] = [
  toastRow('close', 'md'),
  toastRow('close', 'sm'),
  toastRow('action', 'md'),
  toastRow('action', 'sm'),
  {
    part: 'NavigationMenu.Trigger',
    scene: () => navScene(),
    subject: 'trigger-guides',
  },
  {
    height: LINK_HEIGHT,
    part: 'NavigationMenu.Link (top level)',
    scene: () => navScene(),
    subject: 'top-link',
  },
  {
    height: LINK_HEIGHT,
    part: 'NavigationMenu.Link (in the panel, current)',
    prepare: async () => {
      await userEvent.click(required('trigger-guides'))
      await settled(() => byTestId('panel-link-1'))
    },
    scene: () => navScene({ activeIndex: 1 }),
    subject: 'panel-link-1',
  },
  {
    height: LINK_HEIGHT,
    part: 'NavigationMenu.Link (in the panel, not current)',
    prepare: async () => {
      await userEvent.click(required('trigger-guides'))
      await settled(() => byTestId('panel-link-1'))
    },
    scene: () => navScene({ activeIndex: 1 }),
    subject: 'panel-link-2',
  },
]

describe('AC-base-ui-feedback-navigation-45: the interactive parts the feedback and navigation components add are at least 24 by 24 CSS px', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens, reset, stylesheet)
  })

  afterEach(() => {
    page?.dispose()
    removeSheets?.()
    page = undefined
  })

  describe.each([
    { expectation: 'passes', size: 24 },
    { expectation: 'fails', size: 23.5 },
  ])('the instrument, as its own control', ({ expectation, size }) => {
    it(`AC-base-ui-feedback-navigation-45: a plain ${String(size)}px square ${expectation} the 24px check`, async () => {
      page = mount(
        h(
          'div',
          { style: { padding: 48 } },
          h('div', { 'data-testid': 'subject', style: { height: size, width: size } }),
        ),
      )
      const { height, width } = hitExtent(await settled(() => byTestId('subject')))
      expect(height).toBeCloseTo(size, 2)
      expect(width).toBeCloseTo(size, 2)
      expect(Math.min(height, width) >= MINIMUM - TOLERANCE).toBe(size >= MINIMUM)
    })
  })

  it.each(rows)(
    'AC-base-ui-feedback-navigation-45: $part is hit across at least 24 by 24',
    async ({ height: expected, prepare, scene, subject }) => {
      page = mount(h('div', { style: { padding: 48 } }, scene()))
      await settled(() => byTestId('viewport') ?? byTestId('nav'))
      await prepare?.()
      const element = await settled(() => byTestId(subject))
      const { height, width } = hitExtent(element)
      expect(width, 'hittable width').toBeGreaterThanOrEqual(MINIMUM - TOLERANCE)
      expect(height, 'hittable height').toBeGreaterThanOrEqual(MINIMUM - TOLERANCE)
      // The box is measured, not the hit extent: the extent of a link in the panel reads a
      // sub-pixel short at the popup's fractional position.
      const box = element.getBoundingClientRect().height
      expect(box, 'height of the part against the height the spec gives it').toBeCloseTo(
        expected ?? box,
        0,
      )
    },
  )
})
