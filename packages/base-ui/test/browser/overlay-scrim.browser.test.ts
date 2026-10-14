/**
 * AC-base-ui-overlay-completion-16, third scenario: the scrim of an Alert Dialog, read in a real
 * engine with the built tokens and stylesheet, through the built wrappers, in light and in dark.
 * Its paint and its box, what sits under a point of the viewport, and an outside click: the Alert
 * Dialog stays open, where a modal Dialog (the control) closes.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { AlertDialog } from '../../dist/alert-dialog/index.js'
import { Dialog } from '../../dist/dialog/index.js'
import { framesLater, isReachedWithin } from './support/frames.ts'
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
import { colorOf, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w7-lists.ts'

/**
The scrim's colour at the default tint, as the engine serialises it.
 */
const SCRIM_AT_DEFAULT_TINT: Readonly<Record<Scheme, string>> = {
  dark: 'oklch(0.12 0.0067 186.17 / 0.6)',
  light: 'oklch(0.12 0.0067 186.17 / 0.3)',
}

/**
Page content under the overlay: a button that fills the viewport, so a point that reaches it is
a point the scrim and Base UI's layer did not cover.
 */
const pageContent = (): ReactNode =>
  h(
    'button',
    {
      'data-testid': 'page',
      style: { height: '100vh', left: 0, position: 'fixed', top: 0, width: '100vw' },
    },
    'Page',
  )

/**
The frames a close is given to show after an outside click: the control must close within them, and
the Alert Dialog is watched for as many.
 */
const CLOSE_FRAMES = 60

const alertDialog = (): ReactNode =>
  h(
    'div',
    {},
    pageContent(),
    h(
      AlertDialog.Root,
      { defaultOpen: true },
      h(AlertDialog.Trigger, { 'data-testid': 'trigger' }, 'Open'),
      h(
        AlertDialog.Portal,
        {},
        h(AlertDialog.Backdrop, { 'data-testid': 'backdrop' }),
        h(
          AlertDialog.Viewport,
          {},
          h(
            AlertDialog.Popup,
            { 'data-testid': 'popup' },
            h(AlertDialog.Title, {}, 'Delete?'),
            h(AlertDialog.Description, {}, 'This cannot be undone.'),
            h(AlertDialog.Close, {}, 'Cancel'),
          ),
        ),
      ),
    ),
  )

const modalDialog = (): ReactNode =>
  h(
    'div',
    {},
    pageContent(),
    h(
      Dialog.Root,
      { defaultOpen: true },
      h(
        Dialog.Portal,
        {},
        h(
          Dialog.Viewport,
          {},
          h(
            Dialog.Popup,
            { 'data-testid': 'popup' },
            h(Dialog.Title, {}, 'Title'),
            h(Dialog.Description, {}, 'Description'),
            h(Dialog.Close, {}, 'Close'),
          ),
        ),
      ),
    ),
  )

/**
 * The element a pointer meets at the top-left corner of the viewport. It is clicked 2px in from
 * the corner, which is outside the popup whatever the layout.
 */
const clickInTheCorner = async (): Promise<void> => {
  const corner = document.elementFromPoint(2, 2)
  if (corner === null) {
    throw new Error('nothing at the corner of the viewport')
  }
  await userEvent.click(corner, { position: { x: 2, y: 2 } })
}

describe('AC-base-ui-overlay-completion-16: the Alert Dialog scrim', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens, stylesheet)
  })

  afterEach(() => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  const open = async (scheme: Scheme, scene: () => ReactNode): Promise<void> => {
    removeScheme = useScheme(scheme)
    page = mount(scene())
    await settled(() => byTestId('popup'))
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-overlay-completion-16: the Backdrop is fixed over the viewport with no stacking of its own, painted with the scrim token', async () => {
      await open(scheme, alertDialog)
      const backdrop = required('backdrop')
      const style = getComputedStyle(backdrop)
      expect(style.position).toBe('fixed')
      expect(style.zIndex).toBe('auto')
      expect(style.isolation).toBe('auto')
      const { clientHeight, clientWidth } = document.documentElement
      const rect = backdrop.getBoundingClientRect()
      expect(
        [rect.left, rect.top, rect.width, rect.height],
        'the Backdrop against the viewport',
      ).toEqual([0, 0, clientWidth, clientHeight])
      expect(style.backgroundColor).toBe(colorOf('var(--nave-color-backdrop-modal)'))
      expect(style.backgroundColor).toBe(SCRIM_AT_DEFAULT_TINT[scheme])
    })

    it('AC-base-ui-overlay-completion-16: the popup is hit at its centre and a viewport corner is hit by the layer or the Backdrop, never the page', async () => {
      await open(scheme, alertDialog)
      const popup = required('popup').getBoundingClientRect()
      const atCentre = document.elementFromPoint(
        popup.left + popup.width / 2,
        popup.top + popup.height / 2,
      )
      expect(
        atCentre !== null && required('popup').contains(atCentre),
        'the popup at its centre',
      ).toBe(true)
      const { clientHeight, clientWidth } = document.documentElement
      for (const [x, y] of [
        [1, 1],
        [clientWidth - 2, 1],
        [1, clientHeight - 2],
        [clientWidth - 2, clientHeight - 2],
      ] as const) {
        const hit = document.elementFromPoint(x, y)
        expect(hit, `an element at ${String(x)},${String(y)}`).not.toBeNull()
        expect(
          required('page').contains(hit),
          `the page content at ${String(x)},${String(y)}`,
        ).toBe(false)
        const isBackdrop = hit === required('backdrop')
        const isLayer =
          hit instanceof HTMLElement &&
          hit.getAttribute('role') === 'presentation' &&
          getComputedStyle(hit).position === 'fixed'
        expect(
          isBackdrop || isLayer,
          `the Backdrop or the layer at ${String(x)},${String(y)}`,
        ).toBe(true)
      }
    })

    it('AC-base-ui-overlay-completion-16: an outside click leaves the Alert Dialog open', async () => {
      await open(scheme, alertDialog)
      const popup = required('popup')
      await clickInTheCorner()
      // The click has been delivered and handled when it returns. A close that the click began
      // would show as an ending style at once and as an unmounted popup within CLOSE_FRAMES, the
      // frames in which the control below is seen to close.
      await framesLater(CLOSE_FRAMES)
      expect(popup.isConnected, 'the Alert Dialog after the outside click').toBe(true)
      expect(Object.hasOwn(popup.dataset, 'endingStyle'), 'a close that began').toBe(false)
    })

    it('AC-base-ui-overlay-completion-16: the same outside click closes a modal Dialog (control)', async () => {
      await open(scheme, modalDialog)
      const popup = required('popup')
      await clickInTheCorner()
      const isClosed = await isReachedWithin(() => !popup.isConnected, CLOSE_FRAMES)
      expect(
        isClosed,
        `the modal Dialog after the outside click, within ${CLOSE_FRAMES} frames`,
      ).toBe(true)
    })
  })
})
