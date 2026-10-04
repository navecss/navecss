/**
 * `renderNested`/`renderAtBlock` (scripts/build-css.ts) are the
 * dist/atomic.css-side wiring to `anchorSelectorList`, and before this file existed nothing
 * exercised them: build-css.ts exported nothing, so no unit test could reach these
 * functions, and the only comma-separated key in the real atoms.ts (`disabledState`'s) was
 * already hand-anchored, so `atomic-css.test.ts` and `disabled-state.browser.test.ts` could
 * not distinguish fixed from unfixed generator behaviour on this shape. These tests drive
 * `renderNested`/`renderAtBlock` directly with a synthetic, already-resolved atom (the shape
 * `resolve()` returns) carrying a PLAIN (not pre-anchored) comma-separated key, so reverting
 * either call site turns this file red.
 *
 * `renderNested` covers the `pseudos` nested-under-the-class-rule path; `renderAtBlock`
 * covers the `@media`/`@container` nested-pseudos path — both were wired to
 * `anchorSelectorList` and neither had a test that could tell.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ConditionalBlock, ResolvedAtom } from '../src/directive/resolve.ts'

import { renderAtBlock, renderNested } from '../scripts/build-css.ts'

describe('renderNested — anchors every branch of a plain comma-separated pseudo key', () => {
  it('anchors both branches, not just the first', () => {
    const atom: ResolvedAtom = {
      declarations: [],
      blocks: [
        {
          kind: 'pseudo',
          selector: ':disabled, [data-inactive="true"]',
          declarations: [{ prop: 'opacity', value: '0.4' }],
        },
      ],
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
    const block: ConditionalBlock = {
      kind: 'media',
      condition: '(width >= 40rem)',
      declarations: [],
      pseudos: [
        {
          kind: 'pseudo',
          selector: ':hover, [data-active="true"]',
          declarations: [{ prop: 'color', value: 'red' }],
        },
      ],
    }

    const rendered = renderAtBlock(block)

    expect(rendered).toContain('&:hover, &[data-active="true"]')
    expect(rendered).not.toMatch(/&:hover,\s*\[data-active="true"\]/)
  })

  it('anchors both branches in a @container block, not just the first', () => {
    const block: ConditionalBlock = {
      kind: 'container',
      condition: '(width >= 28rem)',
      declarations: [],
      pseudos: [
        {
          kind: 'pseudo',
          selector: ':focus, [data-selected="true"]',
          declarations: [{ prop: 'color', value: 'blue' }],
        },
      ],
    }

    const rendered = renderAtBlock(block)

    expect(rendered).toContain('&:focus, &[data-selected="true"]')
    expect(rendered).not.toMatch(/&:focus,\s*\[data-selected="true"\]/)
  })
})

describe('renderStandalone — the whole stylesheet in one file', () => {
  it('is what the build wrote to dist/standalone.css, from dist/layers.css and dist/index.css', async () => {
    const { readFileSync } = await import('node:fs')
    const { renderStandalone } = await import('../scripts/build-css.ts')
    const dist = path.resolve(import.meta.dirname, '../dist')

    expect(renderStandalone()).toBe(readFileSync(path.join(dist, 'standalone.css'), 'utf8'))
  })
})
