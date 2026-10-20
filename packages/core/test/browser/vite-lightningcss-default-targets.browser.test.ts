/**
 * AC-native-apply-order-44, Tier B: below the floor, under `css.transformer: 'lightningcss'` at
 * Vite's default targets, Lightning CSS moves a rule's content after a directive into later rules
 * before Nave's transform runs, so those shapes already resolve in native order there. The CSS is
 * what a real `vite build` of the project emitted
 * (`scripts/generate-native-order-engine-fixtures.ts`), inlined here with `?raw`: `.c1`
 * `{ @nave hideDesktopUp; display: grid }` computes `display: grid` at 1280px and `.f3`
 * `{ @nave focusRing; &:focus { outline: none } }` computes `outline-style: none` when focused.
 */
import { describe, expect, it } from 'vitest'

import BUILT_CSS from './fixtures/vite-lightningcss-default-targets.css?raw'
import { computed } from './native-order-mount.ts'

describe('AC-native-apply-order-44 - the default-targets Lightning CSS build, in a real engine', () => {
  it('.c1 computes display: grid at 1280px', async () => {
    const placement = {
      focused: false,
      html: '<div class="c1">x</div>',
      selector: '.c1',
      width: 1280,
    }

    expect(await computed(BUILT_CSS, placement, 'display')).toBe('grid')
  })

  it('a keyboard-focused .f3 computes outline-style: none', async () => {
    const placement = {
      focused: true,
      html: '<div class="f3" tabindex="0">x</div>',
      selector: '.f3',
      width: 1280,
    }

    expect(await computed(BUILT_CSS, placement, 'outline-style')).toBe('none')
  })

  it('the build left no @nave in the CSS the page was given', () => {
    expect(BUILT_CSS).not.toContain('@nave')
  })

  it('the build holds the other two rules, which the page can tell apart from a missing sheet', () => {
    expect(BUILT_CSS).toContain('.c2')
    expect(BUILT_CSS).toContain('.d3')
  })
})
