/**
 * AC-base-ui-overlay-completion-19, second scenario (which carries parent AC-base-ui-bridge-51's
 * second scenario for v1's panels): a panel or popup that is closing when the user's reduced-motion
 * setting flips still unmounts, and keyboard focus is not left inside it.
 *
 * Base UI at 1.5.0 and 1.6.0 never counts an aborted exit transition as finished. The stylesheet's
 * reduced-motion guard sets `transition-duration` to 0s, which leaves the transition that is
 * already running to finish. The obvious guard, `transition-property: none`, cancels it, and at
 * those two versions the closed panel then stays mounted at height 0 with a Tab stop inside it, and
 * a closed popup stays mounted. That form is run here as the control: a check that the real guard
 * leaves nothing behind proves nothing unless the form it rules out is seen to leave something.
 *
 * `vitest.browser.config.ts` runs this file at the Base UI the package is developed against and,
 * through the manifest's aliases, at 1.5.0 and 1.6.0.
 *
 * Nothing here is timed by the clock. An exit that has to be running when the setting flips runs
 * for a minute, so no stall of the page can finish it first. The reduced-motion guard leaves a
 * running transition to finish, so the time that would pass is passed by finishing the running
 * animations, and what is waited for after that is counted in animation frames, which a slow
 * machine stretches in time and not in number.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import baseUiPackage from '@base-ui/react/package.json' with { type: 'json' }
import { afterEach, describe, expect, inject, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Accordion } from '../../dist/accordion/index.js'
import { Collapsible } from '../../dist/collapsible/index.js'
import {
  byTestId,
  emulateReducedMotion,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { closeBy, open, required as popupPart } from './support/w8-actions.ts'
import { popupCases } from './support/w8-popups.ts'
import { atRest, isReachedWithin, type Watch, watchPopup } from './support/w8-watch.ts'

/**
The versions at which an exit cancelled mid-way is never treated as finished.
 */
const VERSIONS_WITH_THE_HOLE = new Set(['1.5.0', '1.6.0'])

/**
Long enough that the exit is still running whenever the flip is made, however long the page stalls
before it.
 */
const LONG_EXIT = `@layer overrides { :root { --nave-motion-duration-fast: 60000ms; --nave-motion-duration-base: 60000ms } }`

/**
The most frames waited for the exit to start, which only an exit that never starts runs out.
 */
const MAX_FRAMES = 600

/**
Frames given to Base UI, once an exit has started, to begin waiting for its transition to finish: a
transition cancelled before it does is a transition it has nothing to wait for.
 */
const STARTED_FRAMES = 5

/**
Frames for the page to recalculate its styles under a changed setting.
 */
const STYLE_FRAMES = 3

/**
Frames given to a popup or panel to unmount once its running transition has finished, and to a
panel or popup that does not unmount to show it.
 */
const SETTLE_FRAMES = 10

const GUARD = 'transition-duration: calc(0 * var(--nave-motion-duration-fast))'
const PROPERTY_FORM = 'transition-property: none'
const GUARDS = 9

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

/**
Lets the given number of animation frames pass.
 */
const framesLater = async (count: number): Promise<void> => {
  for (let frame = 0; frame < count; frame += 1) {
    await nextFrame()
  }
}

/**
Finishes the transitions running on an element, which is the time they had left passing.
 */
const letRunFinish = (element: HTMLElement): void => {
  for (const animation of element.getAnimations()) {
    animation.finish()
  }
}

const isReduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
Flips the setting to reduce and waits until the page has taken it and drawn a frame or two under
it, which it does a moment after the command returns: a transition that the new setting cancels is
cancelled by then, and one it leaves running is still running. Finishing the running transitions
before that would finish them under the old setting.
 */
const flipToReduce = async (): Promise<void> => {
  await emulateReducedMotion('reduce')
  expect(await isReachedWithin(isReduced, MAX_FRAMES), 'the page took the setting').toBe(true)
  await framesLater(STYLE_FRAMES)
}

const required = (id: string): HTMLElement => {
  const element = byTestId(id)
  if (element === undefined) {
    throw new Error(`no element with test id ${id}`)
  }
  return element
}

const panelContent = (): ReactNode => h('button', { 'data-testid': 'inside' }, 'Inside')
const after = (): ReactNode => h('button', { 'data-testid': 'after' }, 'After')

const scenes: Readonly<Record<string, () => ReactNode>> = {
  Accordion: () =>
    h(
      'div',
      {},
      h(
        Accordion.Root,
        { defaultValue: ['a'] },
        h(
          Accordion.Item,
          { value: 'a' },
          h(Accordion.Header, {}, h(Accordion.Trigger, { 'data-testid': 'trigger' }, 'Question')),
          h(Accordion.Panel, { 'data-testid': 'panel' }, panelContent()),
        ),
      ),
      after(),
    ),
  Collapsible: () =>
    h(
      'div',
      {},
      h(
        Collapsible.Root,
        { defaultOpen: true },
        h(Collapsible.Trigger, { 'data-testid': 'trigger' }, 'Toggle'),
        h(Collapsible.Panel, { 'data-testid': 'panel' }, panelContent()),
      ),
      after(),
    ),
}

interface Outcome {
  readonly active: Element | undefined
  readonly height: number
  readonly isEnding: boolean
  readonly isHidden: boolean
  readonly isMounted: boolean
}

const BASE_UI = inject('baseUi')

describe(`AC-base-ui-overlay-completion-19: a reduced-motion flip during a panel's exit, at Base UI ${BASE_UI}`, () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  afterEach(async () => {
    page?.dispose()
    removeSheets?.()
    page = undefined
    await emulateReducedMotion('no-preference')
  })

  /**
  Closes the open panel, flips to reduce once its exit is running, lets the running transition
  finish, and presses Tab from the trigger when the frames given to unmount have passed.
   */
  const closeThenFlip = async (name: string, stylesheetText: string): Promise<Outcome> => {
    removeSheets = useSheets(tokens, stylesheetText, LONG_EXIT)
    await emulateReducedMotion('no-preference')
    page = mount(scenes[name]?.())
    await settled(() => byTestId('panel'))
    const closing = required('panel')
    await userEvent.click(required('trigger'))
    const isRunning = await isReachedWithin(
      () => Object.hasOwn(closing.dataset, 'endingStyle') && closing.getAnimations().length > 0,
      MAX_FRAMES,
    )
    expect(isRunning, 'the exit is running when the flip is made').toBe(true)
    await framesLater(STARTED_FRAMES)
    await flipToReduce()
    letRunFinish(closing)
    await framesLater(SETTLE_FRAMES)
    required('trigger').focus()
    await userEvent.tab()
    const panel = byTestId('panel')
    return {
      active: document.activeElement ?? undefined,
      height: panel?.getBoundingClientRect().height ?? 0,
      isEnding: panel?.hasAttribute('data-ending-style') ?? false,
      isHidden: panel?.hasAttribute('hidden') ?? false,
      isMounted: panel !== undefined,
    }
  }

  it('AC-base-ui-overlay-completion-19: the Base UI under test is the version this run names', () => {
    expect(baseUiPackage.version).toBe(BASE_UI)
  })

  describe.each(Object.keys(scenes))('%s', (name) => {
    it('AC-base-ui-overlay-completion-19 (parent AC-base-ui-bridge-51): the guard unmounts the panel and Tab lands on the control after the root', async () => {
      const outcome = await closeThenFlip(name, stylesheet)
      expect(outcome.isMounted, 'the panel is still in the document').toBe(false)
      expect(outcome.active).toBe(required('after'))
    })

    it.runIf(VERSIONS_WITH_THE_HOLE.has(BASE_UI))(
      'AC-base-ui-overlay-completion-19 (parent AC-base-ui-bridge-51): the property form leaves the panel mounted at height 0 with a Tab stop inside (control)',
      async () => {
        expect(stylesheet.split(GUARD).length - 1, 'guards in the built stylesheet').toBe(GUARDS)
        const outcome = await closeThenFlip(name, stylesheet.split(GUARD).join(PROPERTY_FORM))
        expect(outcome.isMounted, 'the panel is still in the document').toBe(true)
        expect(outcome.isEnding, 'with data-ending-style').toBe(true)
        expect(outcome.isHidden, 'without hidden').toBe(false)
        expect(outcome.height, 'at height 0').toBe(0)
        expect(outcome.active).toBe(required('inside'))
      },
    )
  })
})

interface PopupOutcome {
  /**
  The transitions running on the popup when the flip was made.
   */
  readonly runningAtFlip: number
  /**
  Whether the popup was still in the document once the frames given to unmount had passed.
   */
  readonly isMounted: boolean
  /**
  Whether it unmounted within those frames, and so how many frames after the flip it did.
   */
  readonly unmountedAfter: number | undefined
  readonly isEnding: boolean
  readonly isFocusOnTrigger: boolean
  readonly layers: number
  /**
  The layers while the popup was open, so that none left means one went.
   */
  readonly layersWhileOpen: number
  readonly isClickReached: boolean
}

/**
 * Base UI's internal full-viewport layer of a modal popup: a `div` with `role="presentation"` whose
 * inline style has `position: fixed`.
 */
const internalLayers = (): number =>
  [...document.querySelectorAll<HTMLElement>('div[role="presentation"]')].filter(
    (layer) => layer.style.position === 'fixed',
  ).length

describe.each(['Menu', 'Dialog'])(
  `AC-base-ui-overlay-completion-19: a reduced-motion flip during the %s popup's exit, at Base UI ${BASE_UI}`,
  (name) => {
    const popupCase = popupCases.find((candidate) => candidate.name === name)!
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

    /**
     * Closes the open popup, waits for `data-ending-style`, flips to reduce at once, lets the running
     * transition finish, and reads what is left once the frames given to unmount have passed.
     */
    const closeThenFlip = async (stylesheetText: string): Promise<PopupOutcome> => {
      const removeBase = useSheets(tokens, stylesheetText)
      removeSheets = removeBase
      await emulateReducedMotion('no-preference')
      watch = watchPopup()
      page = mount(popupCase.scene())
      await open(popupCase.opening)
      const popup = await atRest()
      const layersWhileOpen = internalLayers()
      // Only the exit is made long: the popup came in at the usual speed.
      const removeLong = useSheets(LONG_EXIT)
      removeSheets = () => {
        removeBase()
        removeLong()
      }
      await closeBy(popupCase.closes)
      const isEnding = await isReachedWithin(
        () => Object.hasOwn(popup.dataset, 'endingStyle'),
        MAX_FRAMES,
      )
      if (!isEnding) {
        throw new Error('the popup never started closing')
      }
      await framesLater(STARTED_FRAMES)
      const runningAtFlip = popup.getAnimations().length
      await flipToReduce()
      letRunFinish(popup)
      let unmountedAfter: number | undefined
      for (let frame = 1; frame <= SETTLE_FRAMES; frame += 1) {
        await nextFrame()
        if (unmountedAfter === undefined && !popup.isConnected) {
          unmountedAfter = frame
        }
      }
      const isFocusOnTrigger = document.activeElement === popupPart('trigger')
      const layers = internalLayers()
      let isClickReached = false
      const outside = popupPart('outside')
      outside.addEventListener('click', () => {
        isClickReached = true
      })
      if (unmountedAfter !== undefined) {
        await userEvent.click(outside)
      }
      return {
        isClickReached,
        isEnding: Object.hasOwn(popup.dataset, 'endingStyle'),
        isFocusOnTrigger,
        isMounted: popup.isConnected,
        layers,
        layersWhileOpen,
        runningAtFlip,
        unmountedAfter,
      }
    }

    it('AC-base-ui-overlay-completion-19: the exit is running when the flip is made, and the guard unmounts the popup, focus is on the trigger and a click on the page reaches it', async () => {
      const outcome = await closeThenFlip(stylesheet)
      expect(outcome.runningAtFlip, 'transitions running at the flip').toBe(1)
      expect(outcome.isMounted, 'the popup is still in the document').toBe(false)
      expect(outcome.unmountedAfter, 'unmounted within the frames given').toBeDefined()
      expect(outcome.isFocusOnTrigger, 'focus is on the trigger').toBe(true)
      expect(outcome.layersWhileOpen, "Base UI's internal layer while open").toBeGreaterThanOrEqual(
        name === 'Dialog' ? 1 : 0,
      )
      expect(outcome.layers, "Base UI's internal layers").toBe(0)
      expect(outcome.isClickReached, 'a click on page content reaches it').toBe(true)
    })

    it.runIf(VERSIONS_WITH_THE_HOLE.has(BASE_UI))(
      'AC-base-ui-overlay-completion-19: the property form leaves the popup mounted after the frames given to unmount (control)',
      async () => {
        expect(stylesheet.split(GUARD).length - 1, 'guards in the built stylesheet').toBe(GUARDS)
        const outcome = await closeThenFlip(stylesheet.split(GUARD).join(PROPERTY_FORM))
        expect(outcome.runningAtFlip, 'transitions running at the flip').toBe(1)
        expect(outcome.isMounted, 'the popup is still in the document').toBe(true)
        expect(outcome.isEnding, 'with data-ending-style').toBe(true)
      },
    )
  },
)
