/**
 * AC-base-ui-overlay-completion-17, second scenario: each of the ten popups that take a motion class
 * fades out over `motion.duration.fast` on the accelerate easing and unmounts when that transition
 * finishes, an Escape close of a Menu, Context Menu or Popover popup is instant, and at rest a popup
 * carries no opacity, transform, scale or translate. The control is the same close with the
 * `-popup-motion` and `-popup-fade` rules taken out of the stylesheet, as a build without the
 * signature would have it: nothing animates and the popup is gone on the next frame.
 *
 * Read in a real engine, since only one runs a transition and reports it through `getAnimations()`.
 */
import { type ReactNode, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import type { Scene } from './support/w8-scenes.ts'

import {
  emulateReducedMotion,
  el as h,
  mount,
  type Page,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { closeBy, open, required } from './support/w8-actions.ts'
import { popupCases } from './support/w8-popups.ts'
import { tokenEasing, tokenMilliseconds } from './support/w8-tokens.ts'
import {
  appears,
  atRest,
  goneAt,
  isReachedWithin,
  type Watch,
  watchPopup,
} from './support/w8-watch.ts'

/**
 * A scene whose Root is controlled by a button that is not its trigger, so the popup opens from
 * state and not from a click on its trigger.
 */
const Controlled = ({ scene }: { readonly scene: Scene }): ReactNode => {
  const [isOpen, setIsOpen] = useState(false)
  return h(
    'div',
    {},
    h(
      'button',
      {
        'data-testid': 'toggle',
        onClick: () => {
          setIsOpen((current) => !current)
        },
      },
      'Toggle',
    ),
    scene({ onOpenChange: setIsOpen, open: isOpen }),
  )
}

const FADE_CLASSES = ['.nave-base-ui-popup-motion', '.nave-base-ui-popup-fade']

/**
 * The stylesheet of a build without the signature: the two selectors name nothing any more, so no
 * popup class sets a transition. Each selector is checked to have been there to remove.
 */
const withoutPopupFade = (): string => {
  let sheet = stylesheet
  for (const selector of FADE_CLASSES) {
    expect(sheet.split(selector).length - 1, `${selector} in the built stylesheet`).toBeGreaterThan(
      0,
    )
    sheet = sheet.split(selector).join(`${selector}-removed`)
  }
  return sheet
}

/**
Frames are about 16ms: the margin by which a measured time may differ from a transition's length.
 */
const FRAME = 20

/**
With nothing to wait for, an unmounting popup is gone within this many frames of its close starting.
 */
const FEW_FRAMES = 4

/**
The most frames waited for a popup to leave the page, which only a popup that does not leave runs out.
 */
const MAX_FRAMES = 120

describe.each(popupCases)('AC-base-ui-overlay-completion-17: the $name popup', (popupCase) => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let watch: Watch | undefined

  afterEach(async () => {
    watch?.stop()
    page?.dispose()
    removeSheets?.()
    page = undefined
    removeSheets = undefined
    watch = undefined
    await emulateReducedMotion('no-preference')
  })

  const start = (sheet: string, isFromState = false): Watch => {
    removeSheets = useSheets(tokens, sheet)
    watch = watchPopup()
    page = mount(isFromState ? h(Controlled, { scene: popupCase.scene }) : popupCase.scene())
    return watch
  }

  it('AC-base-ui-overlay-completion-17: it carries its motion class', async () => {
    start(stylesheet)
    const popup = await open(popupCase.opening)
    expect(popup.classList.contains(`nave-base-ui-${popupCase.motion}`)).toBe(true)
  })

  it('AC-base-ui-overlay-completion-17: it opens on the decelerate easing, and fades out in one opacity transition of the fast duration on the accelerate easing', async () => {
    const seen = start(stylesheet)
    const fast = tokenMilliseconds('--nave-motion-duration-fast')
    await open(popupCase.opening)
    const popup = await atRest()
    await closeBy(popupCase.closes)
    const [ending] = seen.of('data-ending-style', true)
    expect(ending, 'data-ending-style was set').toBeDefined()
    expect(ending?.animations).toEqual([
      {
        duration: fast,
        easing: tokenEasing('--nave-motion-easing-accelerate'),
        kind: 'CSSTransition',
        property: 'opacity',
      },
    ])
    const [starting] = seen.of('data-starting-style', false)
    expect(starting, 'data-starting-style was removed').toBeDefined()
    expect(starting?.easing, 'the easing while opening').toBe(
      tokenEasing('--nave-motion-easing-decelerate'),
    )
    const isOpensInstantly = popupCase.motion === 'popup-motion' && starting?.instant !== undefined
    expect(starting?.animations, 'the transitions that open runs').toEqual(
      isOpensInstantly
        ? []
        : [
            {
              duration: fast,
              easing: tokenEasing('--nave-motion-easing-decelerate'),
              kind: 'CSSTransition',
              property: 'opacity',
            },
          ],
    )
    const gone = await goneAt(popup, fast + 200 + 1000)
    expect(gone, 'the popup left the page').toBeDefined()
    const elapsed = gone! - ending!.time
    expect(elapsed, 'not before the transition ended').toBeGreaterThanOrEqual(fast - FRAME)
    expect(elapsed, 'within its duration plus 200ms').toBeLessThanOrEqual(fast + 200)
  })

  it.runIf(popupCase.motion === 'popup-motion')(
    'AC-base-ui-overlay-completion-17: opened without a click it fades in on the decelerate easing, in one opacity transition of the fast duration',
    async () => {
      const seen = start(stylesheet, true)
      const fast = tokenMilliseconds('--nave-motion-duration-fast')
      await userEvent.click(required('toggle'))
      await appears()
      await atRest()
      const [starting] = seen.of('data-starting-style', false)
      expect(starting, 'data-starting-style was removed').toBeDefined()
      expect(starting?.instant, 'no data-instant on a popup opened from state').toBeUndefined()
      expect(starting?.animations).toEqual([
        {
          duration: fast,
          easing: tokenEasing('--nave-motion-easing-decelerate'),
          kind: 'CSSTransition',
          property: 'opacity',
        },
      ])
    },
  )

  it.runIf(popupCase.dismissesInstantly)(
    'AC-base-ui-overlay-completion-17: an Escape close has data-instant "dismiss" and computes a transition-duration of 0s',
    async () => {
      const seen = start(stylesheet)
      await open(popupCase.opening)
      const popup = await atRest()
      await userEvent.keyboard('{Escape}')
      const dismissed = seen.moments.find((moment) => moment.instant === 'dismiss')
      expect(dismissed, 'data-instant was set to dismiss').toBeDefined()
      expect(dismissed?.duration).toBe('0s')
      expect(dismissed?.animations, 'the close runs no transition').toEqual([])
      expect(await goneAt(popup, 200), 'the popup left the page').toBeDefined()
    },
  )

  it('AC-base-ui-overlay-completion-17: at rest it computes opacity 1 and no transform, scale or translate', async () => {
    start(stylesheet)
    await open(popupCase.opening)
    const popup = await atRest()
    const style = getComputedStyle(popup)
    expect({
      opacity: style.opacity,
      scale: style.scale,
      transform: style.transform,
      translate: style.translate,
    }).toEqual({ opacity: '1', scale: 'none', transform: 'none', translate: 'none' })
  })

  it('AC-base-ui-overlay-completion-17: without the signature the same close runs no animation and unmounts on the next frame (control)', async () => {
    const seen = start(withoutPopupFade())
    await open(popupCase.opening)
    const popup = await atRest()
    const followed = seen.track(popup)
    await closeBy(popupCase.closes)
    const [ending] = seen.of('data-ending-style', true)
    expect(ending, 'data-ending-style was set').toBeDefined()
    expect(ending?.animations, 'no animation runs').toEqual([])
    expect(ending?.duration).toBe('0s')
    const isGone = await isReachedWithin(() => followed.goneFrame() !== undefined, MAX_FRAMES)
    expect(isGone, 'the popup left the page').toBe(true)
    // Counted in frames: how long a frame takes is the machine's, how many pass is the page's.
    expect(followed.goneFrame()! - ending!.frame, 'within a few frames').toBeLessThanOrEqual(
      FEW_FRAMES,
    )
  })
})
