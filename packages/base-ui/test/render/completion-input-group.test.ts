/* eslint-disable unicorn/max-nested-calls -- a tree is written as the nested calls it renders */
import type { ReactElement } from 'react'

import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { cleanup, render } from '../support/react.ts'
import { recordCarried, unrecordedPairs } from '../support/row-pairs.ts'
import { loadNave } from '../support/sources.ts'
import { flattenRules, readStylesheet } from '../support/stylesheet.ts'
import { topName } from '../support/subpaths.ts'
import { INPUT_GROUP_PAIRS, pair } from '../support/vocabulary-pairs.ts'
import { FRUITS, type Kind, KINDS } from '../support/w6-combobox.ts'
import { isInstalled, loadNaveOver, type Minor, MINORS, runMinor } from '../support/w6-minors.ts'
import { el, need } from '../support/w6-render.ts'

const run: Source = await loadNave()
afterEach(cleanup)

const C = 'nave-base-ui-'

/**
The group's invalid selector: the one key of `-input-group` whose declarations set the danger
colour, with `&` read as the class.
 */
const invalidSelector = (css: string): string => {
  const rules = flattenRules(css).filter(
    ({ owner, rule }) =>
      owner === `${C}input-group` &&
      rule.nodes.some(
        (node) => node.type === 'decl' && node.value.includes('--nave-color-feedback-danger'),
      ),
  )
  const selectors = rules.flatMap(({ selectors }) => selectors)
  expect(selectors, 'one key of -input-group sets the danger colour').toHaveLength(1)
  return selectors[0] ?? ''
}

/**
The key the first design used: the group's `data-invalid` alone.
 */
const OLD_KEY = `.${C}input-group[data-invalid]`

interface State {
  readonly fieldDisabled: boolean
  readonly invalid: boolean
  readonly label: string
  readonly rootDisabled: boolean
}

/**
The render steps through these, one after the other, in one mounted tree.
 */
const STATES: readonly State[] = [
  { fieldDisabled: false, invalid: false, label: 'valid', rootDisabled: false },
  { fieldDisabled: false, invalid: true, label: 'Field invalid', rootDisabled: false },
  { fieldDisabled: false, invalid: false, label: 'valid again', rootDisabled: false },
  { fieldDisabled: false, invalid: false, label: 'Root disabled', rootDisabled: true },
  { fieldDisabled: true, invalid: false, label: 'Field disabled', rootDisabled: false },
  {
    fieldDisabled: false,
    invalid: true,
    label: 'Field invalid, Root disabled',
    rootDisabled: true,
  },
  {
    fieldDisabled: true,
    invalid: true,
    label: 'Field invalid, Field disabled',
    rootDisabled: false,
  },
  { fieldDisabled: true, invalid: true, label: 'Field invalid, both disabled', rootDisabled: true },
]

/**
Base UI's three windows in this: 1.3.0 to 1.5.0, 1.6.0, and 1.7.0 onward.
 */
type Window = 'from 1.3.0' | 'from 1.6.0' | 'from 1.7.0'

const windowOf = (version: string): Window => {
  const [, minor] = version.split('.').map(Number)
  if ((minor ?? 0) >= 7) {
    return 'from 1.7.0'
  }
  return (minor ?? 0) === 6 ? 'from 1.6.0' : 'from 1.3.0'
}

interface Expected {
  readonly groupDisabled: boolean
  readonly groupInvalid: boolean
  readonly inputDisabled: boolean
  readonly inputInvalid: boolean
}

/**
The attributes the group and the input carry in a state, in a window (the table of the criterion).
 */
const expectedAt = (state: State, version: Window): Expected => {
  const isDisabled = state.fieldDisabled || state.rootDisabled
  const base = { groupDisabled: isDisabled, inputDisabled: isDisabled }
  if (!state.invalid) {
    return { ...base, groupInvalid: false, inputInvalid: false }
  }
  if (!isDisabled) {
    return { ...base, groupInvalid: true, inputInvalid: true }
  }
  if (version === 'from 1.3.0') {
    return { ...base, groupInvalid: true, inputInvalid: true }
  }
  if (version === 'from 1.7.0') {
    return { ...base, groupInvalid: true, inputInvalid: false }
  }
  // 1.6.0: the Field routes lose the invalid state altogether, the Root route keeps it on the group.
  return state.fieldDisabled
    ? { ...base, groupInvalid: false, inputInvalid: false }
    : { ...base, groupInvalid: true, inputInvalid: false }
}

interface Observed extends Expected {
  readonly groupAria: readonly string[]
  readonly groupClass: boolean
  readonly inputClass: boolean
  readonly matchesNew: boolean
  readonly matchesOld: boolean
}

const tree = (source: Source, kind: Kind, state: State): ReactElement =>
  el(
    source,
    'field',
    'Root',
    { disabled: state.fieldDisabled, invalid: state.invalid },
    el(
      source,
      kind,
      'Root',
      { disabled: state.rootDisabled, items: FRUITS },
      el(
        source,
        kind,
        'InputGroup',
        {},
        el(source, kind, 'Input', { 'aria-label': 'Fruit' }),
        el(source, kind, 'Trigger', {}, 'v'),
      ),
    ),
  )

const observe = (kind: Kind, key: string): Observed => {
  const group = need(`${topName(kind)}.InputGroup`)
  const input = need(`${topName(kind)}.Input`) as HTMLInputElement
  return {
    groupAria: ['aria-invalid', 'aria-disabled'].filter((name) => group.hasAttribute(name)),
    groupClass: group.classList.contains(`${C}input-group`),
    groupDisabled: Object.hasOwn(group.dataset, 'disabled'),
    groupInvalid: Object.hasOwn(group.dataset, 'invalid'),
    inputClass: input.classList.contains(`${C}number-field-input`),
    inputDisabled: input.disabled,
    inputInvalid: input.getAttribute('aria-invalid') === 'true',
    matchesNew: group.matches(key),
    matchesOld: group.matches(OLD_KEY),
  }
}

/**
Steps the tree through the states in one mount and reads the group and the input after each.
 */
const stepThrough = async (source: Source, kind: Kind): Promise<Map<string, Observed>> => {
  const key = invalidSelector(readStylesheet())
  const mounted = await render(tree(source, kind, STATES[0]!))
  const seen = new Map<string, Observed>()
  for (const state of STATES) {
    await mounted.rerender(tree(source, kind, state))
    seen.set(state.label, observe(kind, key))
  }
  return seen
}

const shape = ({
  groupDisabled,
  groupInvalid,
  inputDisabled,
  inputInvalid,
}: Observed): Expected => ({
  groupDisabled,
  groupInvalid,
  inputDisabled,
  inputInvalid,
})

/**
The states in which the group should paint invalid: the input reports invalid and the group is enabled.
 */
const shouldPaint = (observed: Observed): boolean =>
  observed.inputInvalid && !observed.groupDisabled

const minorsOfRun = (): readonly Minor[] =>
  runMinor().version === '1.3.0'
    ? [runMinor()]
    : MINORS.filter(({ version }) => version !== '1.3.0')

const sourceFor = async (minor: Minor): Promise<Source> =>
  minor.version === runMinor().version ? run : loadNaveOver(minor.alias)

describe('AC-base-ui-overlay-completion-23: the group paints invalid exactly where the input reports invalid and the group is enabled', () => {
  for (const kind of KINDS) {
    for (const minor of minorsOfRun()) {
      it(`${kind} at ${minor.version}: in every state the group matches the invalid key exactly when the input is aria-invalid and the group is enabled, and carries the table's attributes`, async () => {
        const source = await sourceFor(minor)
        const seen = await stepThrough(source, kind)
        const window = windowOf(minor.version)
        expect(seen.keys().toArray()).toEqual(STATES.map(({ label }) => label))
        for (const state of STATES) {
          const observed = seen.get(state.label)!
          // The first clause: the new key against the input.
          expect({ matches: observed.matchesNew, state: state.label }).toEqual({
            matches: shouldPaint(observed),
            state: state.label,
          })
          // The second clause: the group is disabled exactly when the input is natively disabled.
          expect({ disabled: observed.groupDisabled, state: state.label }).toEqual({
            disabled: observed.inputDisabled,
            state: state.label,
          })
          // The table of attributes for the minor's window.
          expect({ shape: shape(observed), state: state.label }).toEqual({
            shape: expectedAt(state, window),
            state: state.label,
          })
          // The group never carries the ARIA counterparts, and the classes are the table's.
          expect({ aria: observed.groupAria, state: state.label }).toEqual({
            aria: [],
            state: state.label,
          })
          expect(observed.groupClass).toBe(true)
          expect(observed.inputClass).toBe(true)
        }
      })

      it(`${kind} at ${minor.version}: control, the first design's key (data-invalid alone) reds the first clause in the invalid-and-disabled states the table marks`, async () => {
        const source = await sourceFor(minor)
        const seen = await stepThrough(source, kind)
        const red = STATES.filter(({ label }) => {
          const observed = seen.get(label)!
          return observed.matchesOld !== shouldPaint(observed)
        }).map(({ label }) => label)
        const window = windowOf(minor.version)
        const expected = {
          'from 1.3.0': [
            'Field invalid, Root disabled',
            'Field invalid, Field disabled',
            'Field invalid, both disabled',
          ],
          'from 1.6.0': ['Field invalid, Root disabled'],
          'from 1.7.0': [
            'Field invalid, Root disabled',
            'Field invalid, Field disabled',
            'Field invalid, both disabled',
          ],
        }[window]
        expect(red).toEqual(expected)
      })
    }
  }

  it('reads the invalid key out of the stylesheet, and it differs from the first design key in excluding a disabled group', () => {
    const key = invalidSelector(readStylesheet())
    expect(key).toBe(`.${C}input-group[data-invalid]:not([data-disabled])`)
    expect(key).not.toBe(OLD_KEY)
  })

  it('names the six minors of the criterion, and runs each one that is installed', () => {
    expect(MINORS.map(({ version }) => version)).toEqual([
      '1.3.0',
      '1.4.0',
      '1.5.0',
      '1.6.0',
      '1.7.0',
      '1.8.0',
    ])
    expect(minorsOfRun().every(isInstalled)).toBe(true)
  })
})

describe('AC-base-ui-overlay-completion-29: the group carries no ARIA counterpart of its data attributes', () => {
  for (const kind of KINDS) {
    it(`${kind}: an invalid group has data-invalid and no aria-invalid, a disabled group data-disabled and no aria-disabled, and the input aria-invalid`, async () => {
      await render(
        el(
          run,
          'field',
          'Root',
          { invalid: true },
          el(
            run,
            kind,
            'Root',
            { items: FRUITS },
            el(
              run,
              kind,
              'InputGroup',
              {},
              el(run, kind, 'Input', { 'aria-label': 'Fruit' }),
              el(run, kind, 'Trigger', {}, 'v'),
            ),
          ),
        ),
      )
      const group = need(`${topName(kind)}.InputGroup`)
      expect(Object.hasOwn(group.dataset, 'invalid')).toBe(true)
      expect(group.hasAttribute('aria-invalid')).toBe(false)
      expect(group.classList.contains(`${C}input-group`)).toBe(true)
      expect(need(`${topName(kind)}.Input`).getAttribute('aria-invalid')).toBe('true')
      recordCarried(group, 'data-invalid')
    })

    it(`${kind}: a disabled group has data-disabled and no aria-disabled`, async () => {
      await render(
        el(
          run,
          kind,
          'Root',
          { disabled: true, items: FRUITS },
          el(
            run,
            kind,
            'InputGroup',
            {},
            el(run, kind, 'Input', { 'aria-label': 'Fruit' }),
            el(run, kind, 'Trigger', {}, 'v'),
          ),
        ),
      )
      const group = need(`${topName(kind)}.InputGroup`)
      expect(Object.hasOwn(group.dataset, 'disabled')).toBe(true)
      expect(group.hasAttribute('aria-disabled')).toBe(false)
      recordCarried(group, 'data-disabled')
    })
  }
})

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the field box rows cover every pair they own', () => {
  it('has recorded every pair of the input group table', () => {
    expect(unrecordedPairs(INPUT_GROUP_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('input-group', 'data-planted')] })).toEqual([
      'nave-base-ui-input-group data-planted',
    ])
  })
})
