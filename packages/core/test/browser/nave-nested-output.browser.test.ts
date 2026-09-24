/**
 * @nave nested output behaves identically in a real engine.
 *
 * postcss-plugin.test.ts (Node) proves the transform emits the syntactically
 * correct wrapped shape (`& { ... }` after a nested rule, per ADR 0001) via
 * string and AST assertions. It cannot prove a real engine actually
 * CASCADES the wrapped declarations and the nested rule the way the fix
 * intended: postcss.parse succeeding on a shape says nothing about how a
 * browser resolves native nesting and :focus-visible against it. This runs
 * the real navePlugin transform, injects the real output CSS into a live
 * page (with the real shipped tokens.css so var() references resolve, the
 * same way a consumer's app would), and drives real interaction to confirm
 * the rendered behaviour matches what the fix corrected.
 */
import postcss from 'postcss'
import { userEvent } from 'vitest/browser'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../../src/postcss.ts'

// Browser-mode test files execute inside the real browser, so the built CSS
// has to be inlined at bundle time (Vite's `?raw` import) rather than read
// with node:fs — this is the real, built tokens.css, not a hand-typed copy.
import TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'

const run = async (css: string): Promise<string> => {
  const result = await postcss([navePlugin()]).process(css, { from: undefined })
  return result.css
}

function mount(css: string, html: string): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  document.body.innerHTML = html
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = `${TOKENS_CSS}\n${css}`
  document.head.append(style)
}

describe('the wrapped declaration cascades correctly in a real engine', () => {
  it('a consumer nested rule and the wrapped @nave declaration both apply', async () => {
    // The directive's authored position is after `&:hover { … }`, so its
    // declarations must be wrapped in `& { … }` rather than inlined bare.
    const css = await run('.card { &:hover { color: red; } @nave interactive; }')
    mount(css, '<div class="card" id="card">card</div>')

    const card = document.querySelector('#card') as HTMLElement

    // The wrapped bare declaration (cursor: pointer from `interactive`)
    // applies at rest.
    expect(getComputedStyle(card).cursor).toBe('pointer')

    // The consumer-authored nested rule still applies too — the two are not
    // fighting each other in the composed output.
    await userEvent.hover(card)
    expect(getComputedStyle(card).color).toBe('rgb(255, 0, 0)')
  })

  it('focusRing still cascades correctly when wrapped after a nested rule', async () => {
    const css = await run('.card { &:hover { color: red; } @nave focusRing; }')
    mount(css, '<button class="card" id="ring" type="button">ring</button>')

    const ring = document.querySelector('#ring') as HTMLElement

    // outline: none is the wrapped base declaration; resting state carries no ring.
    expect(getComputedStyle(ring).outlineStyle).toBe('none')

    // Real keyboard-driven focus is what :focus-visible discriminates on
    // (unlike a plain programmatic .focus(), which some engines do not
    // treat as focus-visible at all) — this is exactly the distinction a
    // Node-side string assertion cannot exercise.
    await userEvent.tab()
    expect(document.activeElement).toBe(ring)
    expect(getComputedStyle(ring).outlineStyle).toBe('solid')
  })
})
