/**
 * AC-directive-core-41, last clause of its Chromium half: after the Lightning CSS adapter and
 * `transform()`, `.o { display: grid; @nave flex; }` computes `display: flex` (the directive's
 * declaration comes later) and `.p { @nave flex; display: grid; }` computes `grid`, on the oldest
 * supported release and the newest installed one. The CSS is what Lightning CSS printed
 * (`scripts/generate-lightningcss-fixtures.ts`), inlined here with `?raw`.
 */
import { describe, expect, it } from 'vitest'

import OLDEST_CSS from './fixtures/lightningcss-1-22.css?raw'
import NEWEST_CSS from './fixtures/lightningcss.css?raw'

function computedDisplay(css: string, className: string): string {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
  document.body.innerHTML = `<div class="${className}">x</div>`
  return getComputedStyle(document.querySelector(`.${className}`)!).display
}

describe.each([
  ['the oldest supported release', OLDEST_CSS],
  ['the newest installed release', NEWEST_CSS],
])('the Lightning CSS adapter’s output on %s, in a real engine', (_label, css) => {
  it('a directive written after a declaration wins the cascade', () => {
    expect(computedDisplay(css, 'o')).toBe('flex')
  })

  it('a directive written before a declaration loses it', () => {
    expect(computedDisplay(css, 'p')).toBe('grid')
  })

  it('Lightning CSS was never handed a directive, and left none in the CSS the page was given', () => {
    expect(css).not.toContain('@nave')
  })
})
