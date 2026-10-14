/**
 * What a popup's style attributes do over time, read at the moment each one changes. A transition
 * starts on the style recalculation after an attribute flips, and `getAnimations()` forces that
 * recalculation, so reading it inside the observer's callback sees the transition the flip began.
 */
import { MAX_FRAMES, nextFrame } from './frames.ts'
import { byTestId } from './page.ts'

export interface Seen {
  /**
  Milliseconds, as the `CSSTransition` reports its timing (`getTiming().duration`).
   */
  readonly duration: number
  readonly easing: string
  readonly kind: 'CSSAnimation' | 'CSSTransition' | 'other'
  readonly property: string
}

/**
An animation that was running, and the frame at which it finished.
 */
export interface Running {
  /**
  The frame at which the animation finished, or `undefined` while it has not, or if it was cancelled.
   */
  readonly finishedFrame: () => number | undefined
}

export interface Moment {
  readonly animations: readonly Seen[]
  readonly attribute: string
  /**
  The animations running at that moment, each to be asked at which frame it finished.
   */
  readonly running: readonly Running[]
  /**
  How many animation frames had passed since the watch began, so that a gap can be told in frames,
  which a slow machine does not stretch, as well as in milliseconds.
   */
  readonly frame: number
  /**
  The computed `transition-duration` at that moment.
   */
  readonly duration: string
  /**
  The computed `transition-timing-function` at that moment.
   */
  readonly easing: string
  /**
  The value of `data-instant` at that moment, if the popup has one.
   */
  readonly instant: string | undefined
  /**
  Whether the attribute is on the popup after the change.
   */
  readonly isPresent: boolean
  readonly time: number
}

/**
The moment a popup is added to the page, whatever attributes it arrives with.
 */
export const MOUNT = 'mount'

const kindOf = (animation: Animation): Seen['kind'] => {
  if (animation instanceof CSSTransition) {
    return 'CSSTransition'
  }
  return animation instanceof CSSAnimation ? 'CSSAnimation' : 'other'
}

const describeAnimation = (animation: Animation): Seen => {
  const timing = animation.effect?.getTiming()
  return {
    duration: Number(timing?.duration ?? NaN),
    easing: timing?.easing ?? '',
    kind: kindOf(animation),
    property: animation instanceof CSSTransition ? animation.transitionProperty : '',
  }
}

const ATTRIBUTES = ['data-starting-style', 'data-ending-style', 'data-instant']

/**
 * Whether a popup is out of the rendering tree: removed, or kept in the document by Base UI but
 * without a box (the Select keeps its positioner mounted, hidden).
 */
export const isGone = (popup: Element): boolean =>
  !popup.isConnected || popup.getClientRects().length === 0

/**
A popup followed frame by frame, to find the frame at which it left the page.
 */
export interface Tracked {
  /**
  The frame at which the popup was first seen gone, or `undefined` while it is not.
   */
  readonly goneFrame: () => number | undefined
}

export interface Watch {
  /**
  The number of animation frames since the watch began.
   */
  readonly frames: () => number
  readonly moments: Moment[]
  readonly stop: () => void
  /**
  Follows a popup frame by frame from now on.
   */
  readonly track: (popup: Element) => Tracked
  /**
  The moments of one attribute, in order.
   */
  readonly of: (attribute: string, isPresent: boolean) => Moment[]
}

const finishedAt = (animation: Animation, frames: () => number): Running => {
  let finished: number | undefined
  animation.addEventListener(
    'finish',
    () => {
      finished = frames()
    },
    { once: true },
  )
  return { finishedFrame: () => finished }
}

/**
 * Counts animation frames from now on, and notes the frame at which each popup it is asked to
 * follow is first seen gone.
 */
const countFrames = (): Pick<Watch, 'frames' | 'stop' | 'track'> => {
  let frames = 0
  const followed: { goneFrame: number | undefined; popup: Element }[] = []
  const tick = (): void => {
    frames += 1
    for (const entry of followed) {
      if (entry.goneFrame === undefined && isGone(entry.popup)) {
        entry.goneFrame = frames
      }
    }
    handle = requestAnimationFrame(tick)
  }
  let handle = requestAnimationFrame(tick)
  return {
    frames: () => frames,
    stop: () => {
      cancelAnimationFrame(handle)
    },
    track: (popup) => {
      const entry = { goneFrame: undefined as number | undefined, popup }
      followed.push(entry)
      return { goneFrame: () => entry.goneFrame }
    },
  }
}

/**
 * Records every change of the popup's transient attributes, for the element with a test id,
 * wherever the document puts it.
 */
export const watchPopup = (testId = 'popup'): Watch => {
  const moments: Moment[] = []
  const counter = countFrames()
  const record = (target: HTMLElement, attribute: string): void => {
    const style = getComputedStyle(target)
    moments.push({
      animations: target.getAnimations().map((animation) => describeAnimation(animation)),
      attribute,
      running: target.getAnimations().map((animation) => finishedAt(animation, counter.frames)),
      frame: counter.frames(),
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
      instant: target.dataset.instant,
      isPresent: attribute === MOUNT || target.hasAttribute(attribute),
      time: performance.now(),
    })
  }
  const observer = new MutationObserver((records) => {
    for (const change of records) {
      const target = change.target as HTMLElement
      if (change.attributeName !== null && target.dataset.testid === testId) {
        record(target, change.attributeName)
      }
      for (const added of change.addedNodes) {
        const found =
          added instanceof HTMLElement
            ? [added, ...added.querySelectorAll<HTMLElement>('[data-testid]')].find(
                (candidate) => candidate.dataset.testid === testId,
              )
            : undefined
        if (found !== undefined) {
          record(found, MOUNT)
        }
      }
    }
  })
  observer.observe(document.body, {
    attributeFilter: ATTRIBUTES,
    attributes: true,
    childList: true,
    subtree: true,
  })
  return {
    frames: counter.frames,
    moments,
    of: (attribute, isPresent) =>
      moments.filter((moment) => moment.attribute === attribute && moment.isPresent === isPresent),
    stop: () => {
      observer.disconnect()
      counter.stop()
    },
    track: counter.track,
  }
}

/**
 * How many frames after its first running transition finished a followed popup left the page: below
 * zero if it left first, and `undefined` if the transition did not finish or the popup did not leave.
 */
export const framesAfterFinish = (closing: Moment, followed: Tracked): number | undefined => {
  const left = followed.goneFrame()
  const finished = closing.running[0]?.finishedFrame()
  return left === undefined || finished === undefined ? undefined : left - finished
}

/**
 * Waits for the popup of a scene to exist and to have no running animation or transition, so what is
 * read afterwards is the popup at rest.
 */
export const atRest = async (testId = 'popup'): Promise<HTMLElement> => {
  let popup = byTestId(testId)
  for (
    let frame = 0;
    popup === undefined ||
    popup.getAnimations().length > 0 ||
    Object.hasOwn(popup.dataset, 'startingStyle');
    frame += 1
  ) {
    if (frame >= MAX_FRAMES) {
      throw new Error(`the popup ${testId} never came to rest`)
    }
    await nextFrame()
    popup = byTestId(testId)
  }
  // The box of a positioned popup settles a frame or two after it stops fading.
  for (let frame = 0; frame < 3; frame += 1) {
    await nextFrame()
  }
  return popup
}

/**
 * Waits for an element the popup's scene opens, polling each frame, and returns it. A Preview Card
 * opens after a delay.
 */
export const appears = async (testId = 'popup'): Promise<HTMLElement> => {
  let popup = byTestId(testId)
  for (let frame = 0; popup === undefined; frame += 1) {
    if (frame >= MAX_FRAMES) {
      throw new Error(`the element ${testId} never appeared`)
    }
    await nextFrame()
    popup = byTestId(testId)
  }
  return popup
}
