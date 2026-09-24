/**
 * `anchorSelectorList` is the shared fix for the generator's naive
 * `` `&${pseudo}` `` prepend, which anchored only the FIRST branch of a comma-separated
 * pseudo key (`disabledState`'s own `aria-disabled` branch silently matched a DESCENDANT
 * rather than the element itself, per CSS Nesting semantics). These are the direct unit
 * tests of the pure string transform. `postcss-plugin.test.ts` exercises it through the
 * `src/postcss.ts` emitter with a plain (not pre-anchored) comma-separated key, so it can
 * distinguish fixed from unfixed generator behaviour; `build-css.test.ts` does the same for
 * the `scripts/build-css.ts` emitter. `disabled-state.browser.test.ts` proves the shipped
 * `disabledState` atom matches in a real browser engine, and since a follow-up
 * fix dropped that atom's embedded `&`, its key is now plain, making it the only
 * shipped atom that exercises `anchorSelectorList` end to end through `scripts/build-css.ts`;
 * it now distinguishes fixed from unfixed generator behaviour for real, not just for a
 * synthetic key, and is coverage of this transform, not only a regression guard.
 */
import { describe, expect, it } from 'vitest'

import { anchorSelectorList } from '../src/selector-utils.ts'

describe('anchorSelectorList', () => {
  it('anchors a single selector unchanged in shape', () => {
    expect(anchorSelectorList(':focus-visible')).toBe('&:focus-visible')
  })

  it('anchors EVERY branch of a comma-separated selector list, not only the first', () => {
    expect(anchorSelectorList(':disabled, [aria-disabled="true"]')).toBe(
      '&:disabled, &[aria-disabled="true"]',
    )
  })

  it('leaves a branch that already starts with & untouched (the disabledState-style embedded anchor)', () => {
    expect(anchorSelectorList(':disabled, &[aria-disabled="true"]')).toBe(
      '&:disabled, &[aria-disabled="true"]',
    )
  })

  it('is idempotent: running it twice on its own output is a no-op', () => {
    const once = anchorSelectorList(':disabled, [aria-disabled="true"]')
    expect(anchorSelectorList(once)).toBe(once)
  })

  it('handles three or more branches', () => {
    expect(anchorSelectorList(':hover, :focus, [data-active]')).toBe(
      '&:hover, &:focus, &[data-active]',
    )
  })

  it('trims incidental whitespace around each branch', () => {
    expect(anchorSelectorList(':hover,   :focus  ,[data-active]')).toBe(
      '&:hover, &:focus, &[data-active]',
    )
  })

  it('does not split on a comma nested inside parentheses (:is(), :where(), :not())', () => {
    expect(anchorSelectorList(':is(:hover, :focus)')).toBe('&:is(:hover, :focus)')
  })

  it('does not split on a comma nested inside an attribute selector bracket', () => {
    expect(anchorSelectorList('[data-list="a,b"]')).toBe('&[data-list="a,b"]')
  })

  it('does not split on a comma inside a single-quoted attribute value', () => {
    expect(anchorSelectorList("[data-list='a,b']")).toBe("&[data-list='a,b']")
  })

  it('correctly anchors a comma-separated list where one branch itself contains a nested-paren comma', () => {
    expect(anchorSelectorList(':is(:hover, :focus), [aria-disabled="true"]')).toBe(
      '&:is(:hover, :focus), &[aria-disabled="true"]',
    )
  })
})

describe('anchorSelectorList — the anchoring predicate is "contains &", not "starts with &"', () => {
  it('leaves a branch that contains & anywhere (not just leading) untouched, instead of corrupting it', () => {
    // '.foo &' is already a complete, valid, relative-to-parent selector. Prepending &
    // (the pre-fix `startsWith('&')` predicate would produce '&.foo &') demands the element
    // match .foo AND have a descendant matching the parent, which is not what was authored.
    expect(anchorSelectorList(':hover, .foo &')).toBe('&:hover, .foo &')
  })

  it('does not mistake a literal & inside a quoted attribute value for an already-present anchor', () => {
    expect(anchorSelectorList('[data-label="A & B"]')).toBe('&[data-label="A & B"]')
  })

  it('does not mistake a literal & inside a single-quoted attribute value for an already-present anchor', () => {
    expect(anchorSelectorList("[data-label='A & B']")).toBe("&[data-label='A & B']")
  })

  it('stays idempotent on the disabledState-style key (first branch anchored, second left alone)', () => {
    expect(anchorSelectorList(':disabled, &[aria-disabled="true"]')).toBe(
      '&:disabled, &[aria-disabled="true"]',
    )
  })
})

describe('anchorSelectorList — escaped quotes do not break the top-level-comma split', () => {
  it('does not close the quoted string early on an escaped quote, leaving a later branch unanchored', () => {
    // Without escape-awareness the splitter's quote tracker sees the \" as closing the
    // string immediately, so the following ], stops being "inside a quote" and the comma
    // after it is read as a branch separator mid-string — reproducing the same unanchored-branch
    // failure mode one level down, in the splitter rather than the emitter that first exhibited it.
    expect(anchorSelectorList('[data-x="a\\"b"], :hover')).toBe('&[data-x="a\\"b"], &:hover')
  })
})

describe('anchorSelectorList — an empty branch is a fail-loud author error, not a silent bare &', () => {
  it('throws, naming the offending key, on a trailing comma', () => {
    expect(() => anchorSelectorList(':hover,')).toThrow(/:hover,/)
  })

  it('throws, naming the offending key, on an empty branch between two real ones', () => {
    expect(() => anchorSelectorList(':hover, ,:focus')).toThrow(/:hover, ,:focus/)
  })
})
