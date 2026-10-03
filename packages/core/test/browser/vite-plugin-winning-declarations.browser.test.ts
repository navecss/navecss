/**
 * AC-directive-core-32, last clause: at Vite's default targets the plugin's output is judged by
 * what a real engine computes, not by its shape. `.o { display: grid; @nave flex; }` ends `flex`
 * (the directive's declaration comes later) and `.p { @nave flex; display: grid; }` ends `grid`.
 * The CSS is the text a real `vite build` with the plugin emitted
 * (`scripts/generate-vite-plugin-fixtures.ts`), inlined here with `?raw`.
 */
import { describe, expect, it } from 'vitest'

import BUILT_CSS from './fixtures/vite-plugin-default-targets.css?raw'

function computedDisplay(className: string): string {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = BUILT_CSS
  document.head.append(style)
  document.body.innerHTML = `<div class="${className}">x</div>`
  return getComputedStyle(document.querySelector(`.${className}`)!).display
}

describe('the Vite plugin’s output at default targets, in a real engine', () => {
  it('a directive written after a declaration wins the cascade', () => {
    expect(computedDisplay('o')).toBe('flex')
  })

  it('a directive written before a declaration loses it', () => {
    expect(computedDisplay('p')).toBe('grid')
  })

  it('the build left no @nave in the CSS the page was given', () => {
    expect(BUILT_CSS).not.toContain('@nave')
  })
})
