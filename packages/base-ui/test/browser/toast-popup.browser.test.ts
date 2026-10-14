/**
 * AC-base-ui-feedback-navigation-18: a popup opened from a toast, with and without the Toast
 * viewport as its container, in a real engine with the built tokens and stylesheet, through the
 * built wrappers. `placement` signed: the viewport is on `layer.toast`.
 *
 * Without `container` the Popover is portalled into `<body>` after the viewport, so it paints under
 * the toasts: at least one of five points over the popup returns a toast. That is the positive
 * control for the next clause. With the viewport as `container` all five points return the popup or
 * a descendant and its button is clickable. In a toast with a `timeout` of 2500, opened by keyboard,
 * Enter on the trigger puts focus in the popup, the toast is still open 3500ms later with focus in
 * the popup, Escape returns focus to the trigger in the toast, and a Tab out of the popup lands on
 * the toast's next control with the toast still open 3500ms later and focus never on `<body>`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { createRef, type ReactNode, type RefObject } from 'react'
import { afterEach, describe, expect, inject, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Popover } from '../../dist/popover/index.js'
import { framesLater, isReachedWithin, MAX_FRAMES } from './support/frames.ts'
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
import { type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { parkPointer, required } from './support/w8-actions.ts'
import { forMilliseconds } from './support/w10-nav.ts'
import { closeOf, createManager, raise, toastScene } from './support/w10-toast.ts'

const BASE_UI = inject('baseUi')

/**
The wait the spec gives a timed toast to prove its timer is paused: longer than its timeout of 2500ms.
 */
const PAST_TIMEOUT_MS = 3500

/**
 * The points over a box at which the stacking is read: its centre and four points inside its
 * corners.
 */
const POINTS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0.2, 0.2],
  [0.8, 0.2],
  [0.2, 0.8],
  [0.8, 0.8],
]

/**
 * A Popover in each toast, large enough to reach over the toasts under it: its trigger is in the
 * toast, and its popup is portalled into the viewport when the viewport is the container.
 */
const popoverIn =
  (viewport: RefObject<HTMLElement | null> | undefined) =>
  (name: string): ReactNode =>
    name === 'newer'
      ? h(
          Popover.Root,
          {},
          h(Popover.Trigger, { 'data-testid': 'popover-trigger' }, 'More'),
          h(
            Popover.Portal,
            viewport === undefined ? {} : { container: viewport },
            h(
              Popover.Positioner,
              { align: 'end', side: 'top', sideOffset: 8 },
              h(
                Popover.Popup,
                { 'data-testid': 'popup', style: { minBlockSize: 200, minInlineSize: 240 } },
                h(Popover.Title, {}, 'Details'),
                h(Popover.Close, { 'data-testid': 'popup-button' }, 'Done'),
              ),
            ),
          ),
        )
      : undefined

/**
What is at each of the points over the popup.
 */
const hits = (popup: Element): (Element | null)[] => {
  const box = popup.getBoundingClientRect()
  return POINTS.map(([x, y]) =>
    document.elementFromPoint(box.left + box.width * x, box.top + box.height * y),
  )
}

const isToastHit = (hit: Element | null, popup: Element): boolean => {
  const viewport = byTestId('viewport')
  return hit !== null && viewport !== undefined && viewport.contains(hit) && !popup.contains(hit)
}

describe(`AC-base-ui-feedback-navigation-18: a popup opened from a toast, at Base UI ${BASE_UI}`, () => {
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
   * Two toasts, the older kept and the newer holding the Popover trigger, with the popup portalled
   * into the viewport or not.
   */
  const show = async (scheme: Scheme, isContained: boolean, newerTimeout = 0): Promise<void> => {
    removeSheets = useSheets(tokens, stylesheet)
    removeScheme = useScheme(scheme)
    const manager = createManager()
    const viewport = createRef<HTMLElement>()
    mounted = mount(
      toastScene({
        extra: popoverIn(isContained ? viewport : undefined),
        manager,
        viewportRef: viewport,
      }),
    )
    await settled(() => byTestId('viewport'))
    // A pointer left over the toast area by an earlier test would pause and resume the timers.
    await parkPointer()
    raise(manager, 'older')
    await settled(() => byTestId('toast-older'))
    raise(manager, 'newer', { timeout: newerTimeout })
    await settled(() => byTestId('toast-newer'))
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-18 (Tier B, placement signed): without a container at least one of five points over the popup returns a toast (the positive control)', async () => {
      await show(scheme, false)
      await userEvent.click(required('popover-trigger'))
      const popup = await settled(() => byTestId('popup'))
      expect(popup.parentElement, 'the popup is portalled into the body').not.toBe(
        required('viewport'),
      )
      const toastHits = hits(popup).filter((hit) => isToastHit(hit, popup))
      expect(toastHits.length, 'points over the popup that return a toast').toBeGreaterThanOrEqual(
        1,
      )
    }, 30_000)

    it('AC-base-ui-feedback-navigation-18 (Tier B, placement signed): with the viewport as container all five points return the popup or a descendant and its button is clickable', async () => {
      await show(scheme, true)
      await userEvent.click(required('popover-trigger'))
      const popup = await settled(() => byTestId('popup'))
      expect(required('viewport').contains(popup), 'the popup is inside the viewport').toBe(true)
      for (const [index, hit] of hits(popup).entries()) {
        expect(
          hit !== null && popup.contains(hit),
          `point ${String(index)} returns the popup`,
        ).toBe(true)
      }
      let isClicked = false
      required('popup-button').addEventListener('click', () => {
        isClicked = true
      })
      await userEvent.click(required('popup-button'))
      expect(isClicked, 'the popup button received the click').toBe(true)
    }, 30_000)
  })

  /**
   * Opens the Popover of the newer toast, a toast with a timeout of 2500, by keyboard: F6 into the
   * toasts, Tab to the toast, Tab to the trigger, Enter.
   */
  const openByKeyboard = async (): Promise<Element> => {
    await show('light', true, 2500)
    const newer = required('toast-newer')
    document.body.focus()
    await userEvent.keyboard('{F6}')
    await userEvent.tab()
    expect(document.activeElement, 'Tab reached the newer toast').toBe(newer)
    await userEvent.tab()
    expect(document.activeElement, 'Tab reached the trigger in the toast').toBe(
      required('popover-trigger'),
    )
    await userEvent.keyboard('{Enter}')
    const popup = await settled(() => byTestId('popup'))
    const isInPopup = await isReachedWithin(
      () => popup.contains(document.activeElement),
      MAX_FRAMES,
    )
    expect(isInPopup, 'Enter put focus in the popup').toBe(true)
    return popup
  }

  it('AC-base-ui-feedback-navigation-18 (Tier B, placement signed): with the viewport as container, in a toast with a timeout of 2500, Enter puts focus in the popup and the toast outlives its timeout with focus in the popup; Escape returns focus to the trigger in the toast', async () => {
    const popup = await openByKeyboard()
    const newer = required('toast-newer')
    await forMilliseconds(PAST_TIMEOUT_MS)
    expect(newer.isConnected, 'the toast is open past its timeout').toBe(true)
    expect(popup.contains(document.activeElement), 'with focus in the popup').toBe(true)
    await userEvent.keyboard('{Escape}')
    const trigger = required('popover-trigger')
    const isBack = await isReachedWithin(() => document.activeElement === trigger, MAX_FRAMES)
    expect(isBack, 'Escape returned focus to the trigger').toBe(true)
    expect(newer.contains(document.activeElement), 'inside the toast').toBe(true)
  }, 40_000)

  it('AC-base-ui-feedback-navigation-18 (Tier B, placement signed): with the viewport as container, in a toast with a timeout of 2500, a Tab out of the popup lands on the next control of the toast, the toast is open 3500ms later and focus was never on the body', async () => {
    await openByKeyboard()
    const newer = required('toast-newer')
    await userEvent.tab()
    await framesLater(5)
    expect(document.activeElement, "Tab landed on the toast's next control").toBe(closeOf('newer'))
    let isBodyFocused = false
    await forMilliseconds(PAST_TIMEOUT_MS, () => {
      isBodyFocused ||= document.activeElement === document.body
    })
    expect(isBodyFocused, 'focus was never on the body').toBe(false)
    expect(newer.isConnected, 'the toast is still open').toBe(true)
  }, 40_000)
})
