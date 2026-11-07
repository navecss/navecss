/**
 * AC-native-order-migration-removal-06, Tier A: the rows the Chromium test mounts are still the
 * 22 pairs, the 4 focus shapes, the 5 shapes and the 2 more. The list below is the pin: it is
 * written out entry by entry, so adding, dropping, renaming or duplicating a row reds this test.
 */
import { describe, expect, it } from 'vitest'

import { OUTCOME_ROWS } from './helpers/native-order-outcome-rows.ts'

const PINNED_IDS = [
  'pair hidePhoneOnly flex',
  'pair hidePhoneOnly inlineFlex',
  'pair hidePhoneOnly grid',
  'pair hidePhoneOnly block',
  'pair hidePhoneOnly inlineBlock',
  'pair hideTabletPortraitUp flex',
  'pair hideTabletPortraitUp inlineFlex',
  'pair hideTabletPortraitUp grid',
  'pair hideTabletPortraitUp block',
  'pair hideTabletPortraitUp inlineBlock',
  'pair hideTabletLandscapeUp flex',
  'pair hideTabletLandscapeUp inlineFlex',
  'pair hideTabletLandscapeUp grid',
  'pair hideTabletLandscapeUp block',
  'pair hideTabletLandscapeUp inlineBlock',
  'pair hideDesktopUp flex',
  'pair hideDesktopUp inlineFlex',
  'pair hideDesktopUp grid',
  'pair hideDesktopUp block',
  'pair hideDesktopUp inlineBlock',
  'pair wFullPhoneOnly srOnly',
  'pair wFullPhoneOnly srOnlyFocusable',
  '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
  '.x { @nave focusRing; &:focus { outline: none } }',
  '.x { @nave focusRing; &:focus-visible { outline: none } }',
  '.x { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
  '.s1, #x .s2 { @nave hideDesktopUp; color: red } .s1.k { color: blue }',
  '.s1, #x .s2 { @nave hideDesktopUp textLeft } .s1.k { text-align: right }',
  '.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }',
  '.p::before { content: "x"; &:hover {} @nave flex; width: 10px }',
  '.a, .b::before { content: "x"; @nave hideDesktopUp; width: 10px }',
  'extend atoms mA mB',
  'logical variant',
]

/**
 * Orders two strings, for a comparison of lists whose order is not the point.
 */
function byText(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 * What differs between the pinned list and `ids`, or `undefined` when nothing does.
 */
function differenceOf(ids: readonly string[]): string | undefined {
  if (new Set(ids).size !== ids.length) return 'an id is duplicated'
  if (ids.length !== PINNED_IDS.length) return `${ids.length} rows, not ${PINNED_IDS.length}`
  const sorted = ids.toSorted(byText)
  const expected = PINNED_IDS.toSorted(byText)
  const first = sorted.findIndex((id, index) => id !== expected[index])
  return first === -1 ? undefined : `"${sorted[first]}" is not "${expected[first]}"`
}

describe('AC-native-order-migration-removal-06 — the rows are the 33 pinned', () => {
  it('holds 33 rows with unique ids, equal to the literal list', () => {
    const ids = OUTCOME_ROWS.map((row) => row.id)

    expect(ids).toHaveLength(33)
    expect(new Set(ids).size).toBe(33)
    expect(differenceOf(ids)).toBeUndefined()
  })

  it('holds the 22 pairs, the 4 focus shapes, the 5 shapes and the 2 more', () => {
    const pairs = OUTCOME_ROWS.filter((row) => row.id.startsWith('pair '))
    const hiders = [
      'hidePhoneOnly',
      'hideTabletPortraitUp',
      'hideTabletLandscapeUp',
      'hideDesktopUp',
    ]
    const displays = ['flex', 'inlineFlex', 'grid', 'block', 'inlineBlock']
    const expectedPairs = [
      ...hiders.flatMap((hider) => displays.map((atom) => `.x { @nave ${hider} ${atom}; }`)),
      '.x { @nave wFullPhoneOnly srOnly; }',
      '.x { @nave wFullPhoneOnly srOnlyFocusable; }',
    ]
    const focus = OUTCOME_ROWS.filter((row) => row.measure.focused)
    const shapes = OUTCOME_ROWS.filter((row) => /^\.(s1|p|a)\b/.test(row.input))

    expect(pairs.map((row) => row.input)).toEqual(expectedPairs)
    expect(focus.map((row) => row.input)).toEqual([
      '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
      '.x { @nave focusRing; &:focus { outline: none } }',
      '.x { @nave focusRing; &:focus-visible { outline: none } }',
      '.x { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
    ])
    expect(shapes).toHaveLength(5)
    expect(
      OUTCOME_ROWS.filter((row) => row.id === 'extend atoms mA mB' || row.id === 'logical variant'),
    ).toHaveLength(2)
  })

  it('reds on a row missing, duplicated or renamed', () => {
    const ids = OUTCOME_ROWS.map((row) => row.id)

    expect(differenceOf(ids.slice(1))).toBeDefined()
    expect(differenceOf([...ids.slice(1), ids[1]!])).toBeDefined()
    expect(differenceOf([...ids.slice(1), 'renamed'])).toBeDefined()
  })
})
