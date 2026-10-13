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
import { atRest, type Watch, watchPopup } from './support/w8-watch.ts'
import { sleep } from './support/wait.ts'

/**
The versions at which an exit cancelled mid-way is never treated as finished.
 */
const VERSIONS_WITH_THE_HOLE = new Set(['1.5.0', '1.6.0'])

/**
Long enough that the flip, 100ms in, lands in the middle of the exit.
 */
const SLOW = `@layer overrides { :root { --nave-motion-duration-fast: 600ms; --nave-motion-duration-base: 600ms } }`

const GUARD = 'transition-duration: calc(0 * var(--nave-motion-duration-fast))'
const PROPERTY_FORM = 'transition-property: none'
const GUARDS = 9

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
  Closes the open panel, flips to reduce 100ms later, and 1.5s after that presses Tab from the
  trigger.
   */
  const closeThenFlip = async (name: string, stylesheetText: string): Promise<Outcome> => {
    removeSheets = useSheets(tokens, stylesheetText, SLOW)
    await emulateReducedMotion('no-preference')
    page = mount(scenes[name]?.())
    await settled(() => byTestId('panel'))
    await userEvent.click(required('trigger'))
    await sleep(100)
    await emulateReducedMotion('reduce')
    await sleep(1500)
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

/**
Slow enough that the flip, within 50ms of the close starting, lands in the middle of the exit.
 */
const MID_EXIT = `@layer overrides { :root { --nave-motion-duration-fast: 300ms; --nave-motion-duration-base: 300ms } }`

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

interface PopupOutcome {
  /**
  The transitions running on the popup when the flip was made.
   */
  readonly runningAtFlip: number
  /**
  Whether the popup was still in the document 500ms after the flip.
   */
  readonly isMounted: boolean
  /**
  Whether it unmounted within the 500ms, and so how long after the flip it did.
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
     * Closes the open popup, waits for `data-ending-style`, flips to reduce at once (well inside
     * 50ms), and reads what is left 500ms after the flip.
     */
    const closeThenFlip = async (stylesheetText: string): Promise<PopupOutcome> => {
      removeSheets = useSheets(tokens, stylesheetText, MID_EXIT)
      await emulateReducedMotion('no-preference')
      watch = watchPopup()
      page = mount(popupCase.scene())
      await open(popupCase.opening)
      const popup = await atRest()
      const layersWhileOpen = internalLayers()
      await closeBy(popupCase.closes)
      const deadline = performance.now() + 1000
      while (!Object.hasOwn(popup.dataset, 'endingStyle')) {
        if (performance.now() > deadline) {
          throw new Error('the popup never started closing')
        }
        await nextFrame()
      }
      const runningAtFlip = popup.getAnimations().length
      await emulateReducedMotion('reduce')
      const flipped = performance.now()
      let unmountedAfter: number | undefined
      while (performance.now() < flipped + 500) {
        if (!popup.isConnected) {
          unmountedAfter = performance.now() - flipped
          break
        }
        await nextFrame()
      }
      await sleep(Math.max(0, flipped + 500 - performance.now()))
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
      expect(outcome.unmountedAfter, 'unmounted within 500ms of the flip').toBeLessThan(500)
      expect(outcome.isFocusOnTrigger, 'focus is on the trigger').toBe(true)
      expect(outcome.layersWhileOpen, "Base UI's internal layer while open").toBeGreaterThanOrEqual(
        name === 'Dialog' ? 1 : 0,
      )
      expect(outcome.layers, "Base UI's internal layers").toBe(0)
      expect(outcome.isClickReached, 'a click on page content reaches it').toBe(true)
    })

    it.runIf(VERSIONS_WITH_THE_HOLE.has(BASE_UI))(
      'AC-base-ui-overlay-completion-19: the property form leaves the popup mounted after 500ms (control)',
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
