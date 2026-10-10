/**
 * AC-base-ui-bridge-51, first scenario: under `prefers-reduced-motion: reduce` every transition the
 * stylesheet declares runs for 0s, and still does when a consumer re-tunes the motion tokens in a
 * later layer. The tokens' own reduced-motion rule sets the duration TOKENS, which a re-tune
 * overrides; the stylesheet's guards set the duration property itself, which it does not.
 *
 * Read in a real engine, since only one computes which declaration wins. The positive control
 * comes first in each pair of tests: the durations under no preference are the ones the tokens
 * give, so a reading of 0s under reduce is the guard's doing and not an element that never
 * transitioned.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, describe, expect, it } from 'vitest'

import { Accordion } from '../../dist/accordion/index.js'
import { Collapsible } from '../../dist/collapsible/index.js'
import { Switch } from '../../dist/switch/index.js'
import {
  byTestId,
  emulateReducedMotion,
  el as h,
  mount,
  type Page,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'

const RE_TUNE = `@layer overrides { :root { --nave-motion-duration-fast: 300ms; --nave-motion-duration-base: 300ms } }`

const icon = (testId: string): ReactNode =>
  h('svg', { 'aria-hidden': true, 'data-testid': testId, height: 12, width: 12 })

/**
 * The children a disclosure trigger is given, by how its icon sits in it: after the title, before
 * it, or inside a wrapper (the form the stylesheet does not reach).
 */
const triggerChildren = (placement: 'after' | 'before' | 'wrapped', id: string): ReactNode[] =>
  ({
    after: ['Title', icon(id)],
    before: [icon(id), 'Title'],
    wrapped: [h('span', {}, icon(id)), 'Title'],
  })[placement]

const item = (value: string, placement: 'after' | 'before' | 'wrapped', id: string): ReactNode =>
  h(
    Accordion.Item,
    { key: value, value },
    h(Accordion.Header, {}, h(Accordion.Trigger, {}, ...triggerChildren(placement, id))),
    h(Accordion.Panel, { 'data-testid': `panel-${value}` }, 'Panel'),
  )

const scene = (): ReactNode =>
  h(
    'div',
    {},
    h(
      Accordion.Root,
      { defaultValue: ['open'] },
      item('open', 'after', 'icon-after-open'),
      item('closed', 'after', 'icon-after-closed'),
      item('before', 'before', 'icon-before'),
      item('wrapped', 'wrapped', 'icon-wrapped'),
    ),
    h(
      Collapsible.Root,
      { defaultOpen: true },
      h(Collapsible.Trigger, {}, 'Title', icon('icon-collapsible')),
      h(Collapsible.Panel, { 'data-testid': 'panel-collapsible' }, 'Panel'),
    ),
    h(
      Switch.Root,
      { 'aria-label': 'Checked', defaultChecked: true },
      h(Switch.Thumb, { 'data-testid': 'thumb-checked' }),
    ),
    h(
      Switch.Root,
      { 'aria-label': 'Unchecked' },
      h(Switch.Thumb, { 'data-testid': 'thumb-unchecked' }),
    ),
  )

/**
The elements the guard is for, by test id and the duration each has under no preference.
 */
const TRANSITIONING: Readonly<Record<string, string>> = {
  'icon-after-closed': '0.1s',
  'icon-after-open': '0.1s',
  'icon-before': '0.1s',
  'icon-collapsible': '0.1s',
  'panel-collapsible': '0.2s',
  'panel-open': '0.2s',
  'thumb-checked': '0.1s',
  'thumb-unchecked': '0.1s',
}

/**
 * The wrapped icon is not a direct child of the trigger, so no rule reaches it: it carries no
 * transition in any reading.
 */
const WRAPPED = 'icon-wrapped'

interface Reading {
  readonly duration: string
  readonly property: string
}

const reading = (testId: string): Reading => {
  const element = byTestId(testId)
  if (element === undefined) {
    throw new Error(`no element with test id ${testId}`)
  }
  const style = getComputedStyle(element)
  // A list of properties may carry one duration: what is compared is the set of distinct values.
  const duration = [...new Set(style.transitionDuration.split(', '))].join(', ')
  return { duration, property: style.transitionProperty }
}

const readAll = (): Record<string, Reading> =>
  Object.fromEntries([...Object.keys(TRANSITIONING), WRAPPED].map((id) => [id, reading(id)]))

describe('AC-base-ui-bridge-51: reduced motion turns every transition off, against a late re-tune', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  const open = (...consumerSheets: string[]): void => {
    removeSheets = useSheets(tokens, stylesheet, ...consumerSheets)
    page = mount(scene())
  }

  afterEach(async () => {
    page?.dispose()
    removeSheets?.()
    page = undefined
    await emulateReducedMotion('no-preference')
  })

  describe.each([
    {
      expected: (id: string) => TRANSITIONING[id],
      label: 'the tokens as shipped',
      sheets: [],
    },
    {
      expected: () => '0.3s',
      label: 'a consumer re-tune in the overrides layer',
      sheets: [RE_TUNE],
    },
  ])('with $label', ({ expected, sheets }) => {
    it('AC-base-ui-bridge-51: under no-preference the durations are the tokens (positive control)', async () => {
      open(...sheets)
      await emulateReducedMotion('no-preference')
      const readings = readAll()
      for (const id of Object.keys(TRANSITIONING)) {
        expect(readings[id]?.duration, id).toBe(expected(id))
      }
      expect(readings[WRAPPED], 'the icon inside a wrapper').toEqual({
        duration: '0s',
        property: 'all',
      })
    })

    it('AC-base-ui-bridge-51: under reduce every duration is 0s and every property is what no-preference reads', async () => {
      open(...sheets)
      await emulateReducedMotion('no-preference')
      const motion = readAll()
      await emulateReducedMotion('reduce')
      const reduced = readAll()
      for (const id of Object.keys(TRANSITIONING)) {
        expect(reduced[id]?.duration, `${id} duration`).toBe('0s')
        expect(reduced[id]?.property, `${id} property`).toBe(motion[id]?.property)
      }
      expect(reduced[WRAPPED], 'the icon inside a wrapper').toEqual({
        duration: '0s',
        property: 'all',
      })
    })
  })
})
