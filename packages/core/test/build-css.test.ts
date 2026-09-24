/**
 * `renderNested`/`renderAtBlock` (scripts/build-css.ts) are the
 * dist/atomic.css-side wiring to `anchorSelectorList`, and before this file existed nothing
 * exercised them: build-css.ts exported nothing, so no unit test could reach these
 * functions, and the only comma-separated key in the real atoms.ts (`disabledState`'s) was
 * already hand-anchored, so `atomic-css.test.ts` and `disabled-state.browser.test.ts` could
 * not distinguish fixed from unfixed generator behaviour on this shape. These tests drive
 * `renderNested`/`renderAtBlock` directly with a synthetic atom carrying a PLAIN (not
 * pre-anchored) comma-separated key, so reverting either call site turns this file red.
 *
 * `renderNested` covers the `pseudos` nested-under-the-class-rule path; `renderAtBlock`
 * covers the `@media`/`@container` nested-pseudos path — both were wired to
 * `anchorSelectorList` and neither had a test that could tell.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../src/atoms.ts'

import { renderAtBlock, renderNested } from '../scripts/build-css.ts'

describe('renderNested — anchors every branch of a plain comma-separated pseudo key', () => {
  it('anchors both branches, not just the first', () => {
    const atom: AtomDefinition = {
      declarations: {},
      pseudos: {
        ':disabled, [data-inactive="true"]': { opacity: '0.4' },
      },
    }

    const [rendered] = renderNested(atom)

    expect(rendered).toContain('&:disabled, &[data-inactive="true"]')
    // The pre-fix shape: only the first branch anchored, the second an implicit
    // descendant selector (a bare space before the bracket).
    expect(rendered).not.toMatch(/&:disabled,\s*\[data-inactive="true"\]/)
  })
})

describe('renderAtBlock — anchors every branch of a plain comma-separated pseudo key inside @media/@container', () => {
  it('anchors both branches in a @media block, not just the first', () => {
    const rendered = renderAtBlock('media', '(width >= 40rem)', {
      pseudos: {
        ':hover, [data-active="true"]': { color: 'red' },
      },
    })

    expect(rendered).toContain('&:hover, &[data-active="true"]')
    expect(rendered).not.toMatch(/&:hover,\s*\[data-active="true"\]/)
  })

  it('anchors both branches in a @container block, not just the first', () => {
    const rendered = renderAtBlock('container', '(width >= 28rem)', {
      pseudos: {
        ':focus, [data-selected="true"]': { color: 'blue' },
      },
    })

    expect(rendered).toContain('&:focus, &[data-selected="true"]')
    expect(rendered).not.toMatch(/&:focus,\s*\[data-selected="true"\]/)
  })
})
