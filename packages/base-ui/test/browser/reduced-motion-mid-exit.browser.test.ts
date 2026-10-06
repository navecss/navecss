/**
 * AC-base-ui-bridge-51, second scenario: a panel that is closing when the user's reduced-motion
 * setting flips still unmounts, and keyboard focus is not left inside it.
 *
 * Base UI at 1.5.0 and 1.6.0 never counts an aborted exit transition as finished. The stylesheet's
 * reduced-motion guard sets `transition-duration` to 0s, which leaves the transition that is
 * already running to finish. The obvious guard, `transition-property: none`, cancels it, and at
 * those two versions the closed panel then stays mounted at height 0 with a Tab stop inside it.
 * That form is run here as the control: a check that the real guard leaves no panel behind proves
 * nothing unless the form it rules out is seen to leave one.
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
const GUARDS = 4

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

describe(`AC-base-ui-bridge-51: a reduced-motion flip during a panel's exit, at Base UI ${BASE_UI}`, () => {
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

  it('AC-base-ui-bridge-51: the Base UI under test is the version this run names', () => {
    expect(baseUiPackage.version).toBe(BASE_UI)
  })

  describe.each(Object.keys(scenes))('%s', (name) => {
    it('AC-base-ui-bridge-51: the guard unmounts the panel and Tab lands on the control after the root', async () => {
      const outcome = await closeThenFlip(name, stylesheet)
      expect(outcome.isMounted, 'the panel is still in the document').toBe(false)
      expect(outcome.active).toBe(required('after'))
    })

    it.runIf(VERSIONS_WITH_THE_HOLE.has(BASE_UI))(
      'AC-base-ui-bridge-51: the property form leaves the panel mounted at height 0 with a Tab stop inside (control)',
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
