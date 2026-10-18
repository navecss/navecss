/**
 * The Navigation Menu scene of the browser files, built through the wrapper the way the README
 * builds one, and what a test reads out of it frame by frame. Every part that is measured carries a
 * test id: `nav`, `list`, `trigger-guides`, `trigger-reference`, `icon-guides`, `icon-reference`,
 * `top-link`, `panel-link-<n>` (the Guides panel's links, in a grid of two columns), `reference-link-<n>`,
 * `positioner` and `popup`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { NavigationMenu } from '../../../dist/navigation-menu/index.js'
import { nextFrame } from './frames.ts'
import { byTestId, el as h } from './page.ts'

export interface NavSceneOptions {
  /**
  The index of the Guides link given `active`, if any.
   */
  readonly activeIndex?: number
  /**
  A class on the Root and on the Popup, which a reader's rule reaches the links through.
   */
  readonly probeClass?: string
  /**
  Disables the Reference trigger.
   */
  readonly isReferenceDisabled?: boolean
  /**
  Wraps each Icon in a `span`, so it is no longer a direct child of its trigger.
   */
  readonly isIconWrapped?: boolean
  /**
  How many links the Guides panel holds.
   */
  readonly linkCount?: number
}

const arrow = (): ReactNode =>
  h(
    'svg',
    { 'aria-hidden': true, height: 16, viewBox: '0 0 16 16', width: 16 },
    h('path', { d: 'M3 6l5 5 5-5', fill: 'none', stroke: 'currentColor' }),
  )

const icon = (name: string, isWrapped: boolean): ReactNode => {
  const part = h(NavigationMenu.Icon, { 'data-testid': `icon-${name}` }, arrow())
  return isWrapped ? h('span', {}, part) : part
}

const links = (prefix: string, count: number, activeIndex: number | undefined): ReactNode[] =>
  Array.from({ length: count }, (_, index) =>
    h(
      NavigationMenu.Link,
      {
        key: index,
        'data-testid': `${prefix}-link-${String(index)}`,
        href: `#${prefix}-${String(index)}`,
        ...(index === activeIndex && { active: true }),
      },
      `${prefix} ${String(index)}`,
    ),
  )

/**
 * An item of the list: a trigger with the panel it opens.
 */
const itemWithPanel = (
  value: string,
  label: string,
  panel: ReactNode,
  options: {
    readonly isIconWrapped: boolean
    readonly trigger?: Readonly<Record<string, unknown>>
  },
): ReactNode =>
  h(
    NavigationMenu.Item,
    { value },
    h(
      NavigationMenu.Trigger,
      { 'data-testid': `trigger-${value}`, ...options.trigger },
      label,
      icon(value, options.isIconWrapped),
    ),
    h(NavigationMenu.Content, {}, panel),
  )

/**
 * The popup the open item's panel appears in, rendered once after the list, as the README has it.
 */
const popupOf = (probeClass: string | undefined): ReactNode =>
  h(
    NavigationMenu.Portal,
    {},
    h(
      NavigationMenu.Positioner,
      { 'data-testid': 'positioner', sideOffset: 8 },
      h(
        NavigationMenu.Popup,
        {
          'data-testid': 'popup',
          ...(probeClass !== undefined && { className: probeClass }),
        },
        h(NavigationMenu.Viewport, {}),
      ),
    ),
  )

export const navScene = ({
  activeIndex,
  isIconWrapped = false,
  isReferenceDisabled = false,
  linkCount = 6,
  probeClass,
}: NavSceneOptions = {}): ReactNode =>
  h(
    NavigationMenu.Root,
    { 'data-testid': 'nav', ...(probeClass !== undefined && { className: probeClass }) },
    h(
      NavigationMenu.List,
      { 'data-testid': 'list' },
      itemWithPanel(
        'guides',
        'Guides',
        h(
          'div',
          { style: { display: 'grid', gap: 0, gridTemplateColumns: '1fr 1fr' } },
          ...links('panel', linkCount, activeIndex),
        ),
        { isIconWrapped },
      ),
      itemWithPanel('reference', 'Reference', h('div', {}, ...links('reference', 2, undefined)), {
        isIconWrapped,
        trigger: isReferenceDisabled ? { disabled: true } : {},
      }),
      h(
        NavigationMenu.Item,
        {},
        h(NavigationMenu.Link, { 'data-testid': 'top-link', href: '#blog' }, 'Blog'),
      ),
    ),
    popupOf(probeClass),
  )

/**
 * Every link of the menu that is on the page: the top-level link and the open panel's. The panel's
 * links are in the document only while the panel is open.
 */
export const allLinks = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-testid="top-link"], [data-testid*="-link-"]'),
]

/**
What a frame of the popup looked like, sampled once for each animation frame.
 */
export interface Frame {
  readonly index: number
  /**
  Whether `document.body` held focus (nothing was focused).
   */
  readonly isBodyFocused: boolean
  /**
  Whether the popup carried `data-ending-style`.
   */
  readonly isEnding: boolean
  readonly isMounted: boolean
  /**
  Whether a link inside the popup had a box: something to see on the panel.
   */
  readonly hasPaintedChild: boolean
  /**
  The popup's computed opacity, or 0 while it is not mounted.
   */
  readonly opacity: number
  /**
  The animation frame's own time (the `requestAnimationFrame` timestamp), the instant `opacity` is
  read at, and not the time the callback got to run: a callback that runs late (something ahead of
  it in the same frame blocked) reports the frame's time, not a later one.
   */
  readonly time: number
}

export interface Sampler {
  readonly frames: Frame[]
  readonly stop: () => void
}

const sampleOnce = (index: number, time: number): Frame => {
  const popup = byTestId('popup')
  const isMounted = popup?.isConnected === true
  const active = document.activeElement
  return {
    hasPaintedChild:
      isMounted &&
      [...popup.querySelectorAll('a')].some((link) => {
        const box = link.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      }),
    index,
    isBodyFocused: active === null || active === document.body,
    isEnding: isMounted && Object.hasOwn(popup.dataset, 'endingStyle'),
    isMounted,
    opacity: isMounted ? Number(getComputedStyle(popup).opacity) : 0,
    time,
  }
}

/**
Samples the popup in every animation frame from now on, each frame stamped with the animation
frame's own time, which is the time its opacity is read at. `beforeSample`, when given, runs first
in each frame, before the popup is read, and is told the frame's time and the index its sample
will have: whatever it does (a stall of the page) lands in that frame ahead of the sample, by
construction and not by the order two callbacks were registered in.
 */
export const sampleFrames = (beforeSample?: (time: number, index: number) => void): Sampler => {
  const frames: Frame[] = []
  let handle = 0
  const tick = (time: number): void => {
    beforeSample?.(time, frames.length)
    frames.push(sampleOnce(frames.length, time))
    handle = requestAnimationFrame(tick)
  }
  handle = requestAnimationFrame(tick)
  return {
    frames,
    stop: () => {
      cancelAnimationFrame(handle)
    },
  }
}

/**
A frame where the popup is mounted, visible and has nothing painted in it.
 */
export const isEmptyFrame = (frame: Frame): boolean =>
  frame.isMounted && frame.opacity > 0.01 && !frame.hasPaintedChild

/**
Waits, frame by frame, until the given number of milliseconds have passed since the time.
 */
export const waitUntilSince = async (since: number, milliseconds: number): Promise<void> => {
  while (performance.now() - since < milliseconds) {
    await nextFrame()
  }
}

/**
Waits for real time to pass, in whole animation frames, and calls the callback in each one.
 */
export const forMilliseconds = async (
  milliseconds: number,
  inEachFrame?: () => void,
): Promise<void> => {
  const start = performance.now()
  while (performance.now() - start < milliseconds) {
    await nextFrame()
    inEachFrame?.()
  }
}
