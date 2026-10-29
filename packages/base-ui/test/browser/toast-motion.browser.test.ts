/**
 * AC-base-ui-feedback-navigation-15 (the open and exit transitions, and the swiped toast): the
 * Toast fade in a real engine, with the built tokens and stylesheet, through the built wrappers.
 *
 * A toast opens on one `opacity` transition on the decelerate easing and is closed by its
 * `Toast.Close` on one `opacity` transition of the fast duration on the accelerate easing, and is
 * removed within that duration plus 200ms. At rest it computes no opacity, transform, scale or
 * translate. A toast dismissed by a swipe carries `data-swipe-direction` when its ending style
 * lands, runs no `opacity` transition and is removed within 50ms of the release, never fading. The
 * control is the same close in a build without the fade (`toast fade` unsigned): no animation runs and
 * the root is gone on the next frame.
 *
 * The reduced-motion flip in the middle of the exit is `toast-reduced-motion.browser.test.ts`,
 * which runs at 1.6.0 as well.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import {
  FEW_FRAMES,
  framesLater,
  isReachedWithin,
  MAX_FRAMES,
  nextFrame,
} from './support/frames.ts'
import {
  byTestId,
  emulateReducedMotion,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { tokenEasing, tokenMilliseconds } from './support/w8-tokens.ts'
import { atRest } from './support/w8-watch.ts'
import { withoutClass } from './support/w10-sheets.ts'
import {
  closeOf,
  createManager,
  raise,
  type ToastManager,
  toastRoot,
  toastScene,
} from './support/w10-toast.ts'

interface Moment {
  readonly animations: readonly {
    readonly duration: number
    readonly easing: string
    readonly kind: string
    readonly property: string
  }[]
  readonly attribute: string
  readonly hasSwipeDirection: boolean
  readonly isPresent: boolean
  readonly time: number
}

interface RootWatch {
  readonly moments: Moment[]
  /**
  When the root left the document, noted by an observer at the moment it did, or `undefined` while it is there.
   */
  readonly removedAt: () => number | undefined
  readonly root: HTMLElement
  readonly stop: () => void
}

/**
 * Raises a toast and watches its root from the moment it is inserted: every change of its
 * starting and ending styles, with the transitions running when the change was made. A transition
 * starts on the style recalculation after an attribute flips, and `getAnimations()` forces that
 * recalculation, so reading it inside the observer's callback sees the transition the change began.
 * The observer is on the document, since the root is inserted with its starting style and loses it
 * before any observer of the root itself could be attached.
 */
const raiseWatched = async (
  manager: ToastManager,
  name: string,
  options: Readonly<Record<string, unknown>> = {},
): Promise<RootWatch> => {
  const id = `toast-${name}`
  const moments: Moment[] = []
  let watched: HTMLElement | undefined
  let removedAt: number | undefined
  const attributes = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target
      const attribute = record.attributeName
      if (attribute === null || !(target instanceof HTMLElement) || target.dataset.testid !== id) {
        continue
      }
      moments.push({
        animations: target.getAnimations().map((animation) => {
          const timing = animation.effect?.getTiming()
          return {
            duration: Number(timing?.duration ?? NaN),
            easing: timing?.easing ?? '',
            kind: animation instanceof CSSTransition ? 'CSSTransition' : 'other',
            property: animation instanceof CSSTransition ? animation.transitionProperty : '',
          }
        }),
        attribute,
        hasSwipeDirection: Object.hasOwn(target.dataset, 'swipeDirection'),
        isPresent: target.hasAttribute(attribute),
        time: performance.now(),
      })
    }
  })
  attributes.observe(document.body, {
    attributeFilter: ['data-starting-style', 'data-ending-style', 'data-swipe-direction'],
    attributes: true,
    subtree: true,
  })
  const presence = new MutationObserver(() => {
    watched ??= byTestId(id)
    if (removedAt === undefined && watched !== undefined && !watched.isConnected) {
      removedAt = performance.now()
    }
  })
  presence.observe(document.body, { childList: true, subtree: true })
  raise(manager, name, options)
  const root = (await settled(() => byTestId(id))) as HTMLElement
  return {
    moments,
    removedAt: () => removedAt,
    root,
    stop: () => {
      attributes.disconnect()
      presence.disconnect()
    },
  }
}

const momentsOf = (watch: RootWatch, attribute: string, isPresent: boolean): Moment[] =>
  watch.moments.filter((moment) => moment.attribute === attribute && moment.isPresent === isPresent)

/**
 * Reads the root's computed opacity in every animation frame while it is in the document. A frame
 * that lands after the root left reads a detached element, whose opacity is empty and so reads 0,
 * and one can land between the removal and the sampler being stopped when the callbacks of a frame
 * run in another order than usual.
 */
const sampleOpacity = (
  root: HTMLElement,
): { readonly opacities: number[]; readonly stop: () => void } => {
  const opacities: number[] = []
  let handle = requestAnimationFrame(function tick() {
    if (root.isConnected) {
      opacities.push(Number(getComputedStyle(root).opacity))
    }
    handle = requestAnimationFrame(tick)
  })
  return {
    opacities,
    stop: () => {
      cancelAnimationFrame(handle)
    },
  }
}

/**
The time at which the root left the document, waiting frame by frame for it to.
 */
const goneAt = async (watch: RootWatch): Promise<number | undefined> => {
  await isReachedWithin(() => watch.removedAt() !== undefined, MAX_FRAMES)
  return watch.removedAt()
}

describe('AC-base-ui-feedback-navigation-15: the toast fade', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let watch: RootWatch | undefined

  const show = async (
    sheet = stylesheet,
    rootProps: Record<string, unknown> = {},
  ): Promise<ToastManager> => {
    removeSheets = useSheets(tokens, sheet)
    const manager = createManager()
    page = mount(toastScene({ manager, rootProps }))
    await settled(() => byTestId('viewport'))
    return manager
  }

  afterEach(async () => {
    watch?.stop()
    page?.dispose()
    removeSheets?.()
    page = undefined
    watch = undefined
    await emulateReducedMotion('no-preference')
  })

  describe.each([
    { name: 'timed', options: { timeout: 60_000 } },
    { name: 'kept', options: { timeout: 0 } },
  ])('the $name toast', ({ name, options }) => {
    it('AC-base-ui-feedback-navigation-15 (Tier B): on open one opacity transition runs on the decelerate easing', async () => {
      const manager = await show()
      const fast = tokenMilliseconds('--nave-motion-duration-fast')
      watch = await raiseWatched(manager, name, options)
      const [opening] = momentsOf(watch, 'data-starting-style', false)
      expect(opening, 'data-starting-style was removed').toBeDefined()
      expect(opening?.animations, 'one opacity transition runs on open').toEqual([
        {
          duration: fast,
          easing: tokenEasing('--nave-motion-easing-decelerate'),
          kind: 'CSSTransition',
          property: 'opacity',
        },
      ])
    })

    it('AC-base-ui-feedback-navigation-15 (Tier B): closed by its Toast.Close one opacity transition of the fast duration runs on the accelerate easing, and the root is removed within that duration plus 200ms', async () => {
      const manager = await show()
      const fast = tokenMilliseconds('--nave-motion-duration-fast')
      expect(fast, 'the fast duration token').toBe(100)
      watch = await raiseWatched(manager, name, options)
      await atRest(`toast-${name}`)
      await userEvent.click(closeOf(name))
      const [ending] = momentsOf(watch, 'data-ending-style', true)
      expect(ending, 'data-ending-style was set').toBeDefined()
      expect(ending?.hasSwipeDirection, 'a button close is no swipe').toBe(false)
      expect(ending?.animations, 'one opacity transition runs on close').toEqual([
        {
          duration: fast,
          easing: tokenEasing('--nave-motion-easing-accelerate'),
          kind: 'CSSTransition',
          property: 'opacity',
        },
      ])
      const gone = await goneAt(watch)
      expect(gone, 'the root left the page').toBeDefined()
      expect(gone! - ending!.time, 'within the duration plus 200ms').toBeLessThanOrEqual(fast + 200)
    })

    it('AC-base-ui-feedback-navigation-15 (Tier B): at rest the root computes opacity 1, transform none, scale none and translate none', async () => {
      const manager = await show()
      watch = await raiseWatched(manager, name, options)
      await atRest(`toast-${name}`)
      const style = getComputedStyle(toastRoot(name))
      expect({
        opacity: style.opacity,
        scale: style.scale,
        transform: style.transform,
        translate: style.translate,
      }).toEqual({ opacity: '1', scale: 'none', transform: 'none', translate: 'none' })
    })
  })

  it('AC-base-ui-feedback-navigation-15 (Tier B): a toast dismissed by a swipe carries data-swipe-direction when its ending style lands, runs no opacity transition, never fades and is removed within 50ms of the release', async () => {
    // The toast sits against the inline-end edge, so it is swiped toward the inline-start edge.
    const manager = await show(stylesheet, { swipeDirection: 'left' })
    watch = await raiseWatched(manager, 'swiped')
    const root = watch.root
    await atRest('toast-swiped')
    const sampler = sampleOpacity(root)
    const { height, width } = root.getBoundingClientRect()
    // A press on the toast's top padding, away from its buttons, dragged across the toast.
    const y = Math.min(8, height / 4)
    await userEvent.dragAndDrop(root, root, {
      sourcePosition: { x: width - 16, y },
      steps: 12,
      targetPosition: { x: 16, y },
    })
    const gone = await goneAt(watch)
    sampler.stop()
    expect(gone, 'the swiped toast left the page').toBeDefined()
    const [ending] = momentsOf(watch, 'data-ending-style', true)
    expect(ending, 'data-ending-style was set').toBeDefined()
    expect(ending?.hasSwipeDirection, 'with data-swipe-direction').toBe(true)
    expect(ending?.animations, 'no opacity transition runs').toEqual([])
    expect(gone! - ending!.time, 'removed within 50ms of the release').toBeLessThanOrEqual(50)
    expect(Math.min(...sampler.opacities), 'the opacity never fell below 1').toBe(1)
  }, 30_000)

  it('AC-base-ui-feedback-navigation-15 (Tier B, control): the opacity sampler reads nothing once its root has left the page', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const sampler = sampleOpacity(root)
    await framesLater(2)
    root.remove()
    // The frames after the removal: in the swipe row one of them can land before the sampler is
    // stopped when a frame's callbacks run in another order, and here both do. A detached element
    // has no opacity.
    await framesLater(2)
    sampler.stop()
    // The sampler's frame callback is registered before each of `framesLater`'s, so it runs once in
    // each of the two frames the root is there, and records nothing in the two after.
    expect(
      sampler.opacities.length,
      'it read the two frames the root was there and none after',
    ).toBe(2)
    expect(Math.min(...sampler.opacities), 'no frame after the removal read 0').toBe(1)
  })

  it('AC-base-ui-feedback-navigation-15 (Tier B, toast fade unsigned): the same close runs no animation and removes the root on the next frame (control)', async () => {
    const manager = await show(withoutClass(stylesheet, 'toast-fade'))
    watch = await raiseWatched(manager, 'plain')
    await atRest('toast-plain')
    expect(
      watch.root.classList.contains('nave-base-ui-toast-fade'),
      'the wrapper still adds the class',
    ).toBe(true)
    await userEvent.click(closeOf('plain'))
    const [ending] = momentsOf(watch, 'data-ending-style', true)
    expect(ending, 'data-ending-style was set').toBeDefined()
    expect(ending?.animations, 'no animation runs').toEqual([])
    let frames = 0
    while (watch.root.isConnected && frames < MAX_FRAMES) {
      await nextFrame()
      frames += 1
    }
    expect(watch.root.isConnected, 'the root left the page').toBe(false)
    expect(frames, 'within a few frames').toBeLessThanOrEqual(FEW_FRAMES)
  })
})
