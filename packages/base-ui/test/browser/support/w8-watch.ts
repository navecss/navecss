/**
 * What a popup's style attributes do over time, read at the moment each one changes. A transition
 * starts on the style recalculation after an attribute flips, and `getAnimations()` forces that
 * recalculation, so reading it inside the observer's callback sees the transition the flip began.
 */
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

export interface Moment {
  readonly animations: readonly Seen[]
  readonly attribute: string
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

export interface Watch {
  readonly moments: Moment[]
  readonly stop: () => void
  /**
  The moments of one attribute, in order.
   */
  readonly of: (attribute: string, isPresent: boolean) => Moment[]
}

/**
 * Records every change of the popup's transient attributes, for the element with a test id,
 * wherever the document puts it.
 */
export const watchPopup = (testId = 'popup'): Watch => {
  const moments: Moment[] = []
  const record = (target: HTMLElement, attribute: string): void => {
    const style = getComputedStyle(target)
    moments.push({
      animations: target.getAnimations().map((animation) => describeAnimation(animation)),
      attribute,
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
    moments,
    of: (attribute, isPresent) =>
      moments.filter((moment) => moment.attribute === attribute && moment.isPresent === isPresent),
    stop: () => {
      observer.disconnect()
    },
  }
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

/**
 * Whether a popup is out of the rendering tree: removed, or kept in the document by Base UI but
 * without a box (the Select keeps its positioner mounted, hidden).
 */
export const isGone = (popup: Element): boolean =>
  !popup.isConnected || popup.getClientRects().length === 0

/**
 * Waits frame by frame until the popup is gone and returns the time that was seen, or `undefined`
 * after `limit` milliseconds.
 */
export const goneAt = async (popup: Element, limit: number): Promise<number | undefined> => {
  const deadline = performance.now() + limit
  while (!isGone(popup)) {
    if (performance.now() > deadline) {
      return undefined
    }
    await nextFrame()
  }
  return performance.now()
}

/**
 * Waits for the popup of a scene to exist and to have no running animation or transition, so what is
 * read afterwards is the popup at rest.
 */
export const atRest = async (testId = 'popup'): Promise<HTMLElement> => {
  const deadline = performance.now() + 5000
  let popup = byTestId(testId)
  while (
    popup === undefined ||
    popup.getAnimations().length > 0 ||
    Object.hasOwn(popup.dataset, 'startingStyle')
  ) {
    if (performance.now() > deadline) {
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
export const appears = async (testId = 'popup', limit = 3000): Promise<HTMLElement> => {
  const deadline = performance.now() + limit
  let popup = byTestId(testId)
  while (popup === undefined) {
    if (performance.now() > deadline) {
      throw new Error(`the element ${testId} never appeared`)
    }
    await nextFrame()
    popup = byTestId(testId)
  }
  return popup
}
