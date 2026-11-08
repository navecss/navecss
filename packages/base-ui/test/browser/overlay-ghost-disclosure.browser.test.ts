/**
 * AC-base-ui-overlay-completion-52, second scenario: a ghost trigger on an open disclosure shows
 * no fill, read in a real engine with the built tokens and stylesheet, in light and in dark. Three
 * ghost triggers share one page, each Nave's `Button` as the `render` of Base UI's own trigger
 * part: a `Collapsible`, an `Accordion` item and, as the positive control, a `Popover`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { Accordion } from '@base-ui/react/accordion'
import { Collapsible } from '@base-ui/react/collapsible'
import { Popover } from '@base-ui/react/popover'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Button } from '../../dist/button/index.js'
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
import { colorOf, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w7-lists.ts'

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

const ghost = (testId: string): ReturnType<typeof h> =>
  h(Button, { 'data-testid': testId, variant: 'ghost' })

const scene = (): ReturnType<typeof h> =>
  h(
    'div',
    { style: { display: 'grid', gap: 24, justifyItems: 'start', padding: 48 } },
    h(
      Collapsible.Root,
      {},
      h(Collapsible.Trigger, { render: ghost('collapsible') }, 'Details'),
      h(Collapsible.Panel, {}, 'Panel'),
    ),
    h(
      Accordion.Root,
      {},
      h(
        Accordion.Item,
        { value: 'a' },
        h(Accordion.Header, {}, h(Accordion.Trigger, { render: ghost('accordion') }, 'Section')),
        h(Accordion.Panel, {}, 'Panel'),
      ),
    ),
    h(
      Popover.Root,
      {},
      h(Popover.Trigger, { render: ghost('popover') }, 'Open'),
      h(
        Popover.Portal,
        {},
        h(
          Popover.Positioner,
          { side: 'right' },
          h(Popover.Popup, { 'data-testid': 'popup' }, 'Popup'),
        ),
      ),
    ),
    h('div', {
      'data-testid': 'away',
      style: { bottom: 0, height: 40, position: 'fixed', right: 0, width: 40 },
    }),
  )

describe('AC-base-ui-overlay-completion-52: a ghost trigger on an open disclosure shows no fill', () => {
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

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-overlay-completion-52: the open Collapsible and Accordion triggers compute transparent, the open Popover trigger the highlight fill, and the Collapsible trigger fills again on hover', async () => {
      removeScheme = useScheme(scheme)
      page = mount(scene())
      const collapsible = (await settled(() => byTestId('collapsible'))) as HTMLElement
      const accordion = required('accordion')
      const popover = required('popover')
      await userEvent.click(collapsible)
      await userEvent.click(accordion)
      await userEvent.click(popover)
      await settled(() => byTestId('popup'))
      await userEvent.hover(required('away'))

      for (const trigger of [collapsible, accordion, popover]) {
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(trigger.matches(':hover'), 'the pointer is off it').toBe(false)
        expect(trigger.matches(':active'), 'it is not pressed').toBe(false)
      }
      expect(getComputedStyle(collapsible).backgroundColor).toBe(TRANSPARENT)
      expect(getComputedStyle(accordion).backgroundColor).toBe(TRANSPARENT)
      expect(getComputedStyle(popover).backgroundColor).toBe(
        colorOf('var(--nave-color-action-highlight)'),
      )

      await userEvent.hover(collapsible)
      expect(getComputedStyle(collapsible).backgroundColor).toBe(
        colorOf('var(--nave-color-action-highlight)'),
      )
    })
  })
})
