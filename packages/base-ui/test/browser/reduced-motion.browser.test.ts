/**
 * AC-base-ui-overlay-completion-19, first scenario (which carries parent AC-base-ui-bridge-51's
 * first scenario for v1's parts): under `prefers-reduced-motion: reduce` every transition the
 * stylesheet declares runs for 0s, and still does when a consumer re-tunes the motion tokens in a
 * later layer. The tokens' own reduced-motion rule sets the duration TOKENS, which a re-tune
 * overrides; the stylesheet's guards set the duration property itself, which it does not. The page
 * holds v1's guarded parts and one part for each motion class that ships, each with and without
 * `data-instant`.
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

/**
 * The motion classes the package ships, each as a part with and without `data-instant`, and what
 * its duration reads under no preference with the tokens as shipped and with the re-tune: the
 * fades are the fast duration and the indicator the base one, the re-tune sets both to 300ms, and
 * `data-instant` on `-popup-motion` and `-tooltip-motion` is the instant duration, which the
 * re-tune leaves alone.
 */
const MOTION_CLASSES = [
  { instant: '0s', name: 'popup-motion', rest: '0.1s' },
  { instant: '0.1s', name: 'popup-fade', rest: '0.1s' },
  { instant: '0s', name: 'tooltip-motion', rest: '0.1s' },
  { instant: '0.1s', name: 'backdrop', rest: '0.1s' },
  { instant: '0.2s', name: 'tab-indicator-motion', rest: '0.2s' },
] as const

const motionPart = (name: string, isInstant: boolean): ReactNode =>
  h('div', {
    className: `nave-base-ui-${name}`,
    'data-testid': `${name}${isInstant ? '-instant' : ''}`,
    ...(isInstant && { 'data-instant': 'dismiss' }),
  })

const motionParts = (): ReactNode[] =>
  MOTION_CLASSES.flatMap(({ name }) => [motionPart(name, false), motionPart(name, true)])

/**
The duration a motion part reads under no preference: the tokens' or the re-tune's.
 */
const motionDuration = (id: string, isRetuned: boolean): string | undefined => {
  const part = MOTION_CLASSES.find(({ name }) => id === name || id === `${name}-instant`)
  if (part === undefined) {
    return undefined
  }
  const isInstant = id.endsWith('-instant')
  if (isInstant) {
    return isRetuned && part.instant !== '0s' ? '0.3s' : part.instant
  }
  return isRetuned ? '0.3s' : part.rest
}

const scene = (): ReactNode =>
  h(
    'div',
    {},
    ...motionParts(),
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

const MOTION_IDS = MOTION_CLASSES.flatMap(({ name }) => [name, `${name}-instant`])

const readAll = (): Record<string, Reading> =>
  Object.fromEntries(
    [...Object.keys(TRANSITIONING), ...MOTION_IDS, WRAPPED].map((id) => [id, reading(id)]),
  )

describe('AC-base-ui-overlay-completion-19: reduced motion turns every Nave transition off, against a late re-tune', () => {
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
      expected: (id: string) => motionDuration(id, false) ?? TRANSITIONING[id],
      label: 'the tokens as shipped',
      sheets: [],
    },
    {
      expected: (id: string) => motionDuration(id, true) ?? '0.3s',
      label: 'a consumer re-tune in the overrides layer',
      sheets: [RE_TUNE],
    },
  ])('with $label', ({ expected, sheets }) => {
    it('AC-base-ui-overlay-completion-19: under no-preference the durations are the tokens (positive control)', async () => {
      open(...sheets)
      await emulateReducedMotion('no-preference')
      const readings = readAll()
      for (const id of [...Object.keys(TRANSITIONING), ...MOTION_IDS]) {
        expect(readings[id]?.duration, id).toBe(expected(id))
      }
      expect(readings[WRAPPED], 'the icon inside a wrapper').toEqual({
        duration: '0s',
        property: 'all',
      })
    })

    it('AC-base-ui-overlay-completion-19: under reduce every duration is 0s and every property is what no-preference reads', async () => {
      open(...sheets)
      await emulateReducedMotion('no-preference')
      const motion = readAll()
      await emulateReducedMotion('reduce')
      const reduced = readAll()
      for (const id of [...Object.keys(TRANSITIONING), ...MOTION_IDS]) {
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
