/**
 * focusRing must not mutate border-radius on :focus-visible, in a real engine.
 *
 * focus-ring-forced-colors.test.ts (Node) reads dist/atomic.css as text and
 * cannot resolve what an element actually computes: it would pass unchanged
 * whether or not `border-radius` inside the `:focus-visible` block actually
 * repaints a rounded element's corners. This mounts the real shipped
 * tokens.css + reset.css + atomic.css, drives a real keyboard tab (the only
 * way to trigger `:focus-visible` rather than a bare `.focus()`, per the
 * nave-nested-output.browser.test.ts precedent), and reads the engine's own
 * computed `border-radius` before and after.
 */
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

// Browser-mode test files execute inside the real browser, so the built CSS
// has to be inlined at bundle time (Vite's `?raw` import) rather than read
// with node:fs — this is the real, built dist/atomic.css, not a hand-typed
// reproduction of the atom's shape.
import TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'
import CORE_RESET_CSS from '../../dist/reset.css?raw'
import CORE_ATOMIC_CSS from '../../dist/atomic.css?raw'

function mount(): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  document.body.innerHTML = ''
  // Each of the three files self-declares the same @layer order, so
  // concatenating them here reproduces the shipped cascade rather than a
  // fixture-specific one.
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = `${TOKENS_CSS}\n${CORE_RESET_CSS}\n${CORE_ATOMIC_CSS}`
  document.head.append(style)
}

/**
 * The engine's own resolved value for a token, read off a throwaway probe
 * instead of hard-coded as a px literal — a literal would pin the assertion
 * to today's radius scale and go red on any re-tint, which is a token-value
 * pin, not a behaviour check (the resolvedTokenColor precedent in
 * disabled-state.browser.test.ts, applied to border-radius).
 */
function resolvedTokenRadius(token: string): string {
  const probe = document.createElement('span')
  probe.style.borderRadius = `var(${token})`
  document.body.append(probe)
  const value = getComputedStyle(probe).borderRadius
  probe.remove()
  return value
}

describe('focusRing does not deform an element on keyboard focus', () => {
  it('the fixture really has the tokens layer mounted (guards a false green)', () => {
    mount()
    expect(resolvedTokenRadius('--nave-radius-full')).not.toBe('0px')
  })

  it('a pill (roundedFull) keeps its resting border-radius through :focus-visible', async () => {
    mount()
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'nave-rounded-full nave-focus-ring'
    button.textContent = 'pill'
    document.body.append(button)

    const resting = getComputedStyle(button).borderRadius
    expect(resting).toBe(resolvedTokenRadius('--nave-radius-full'))

    // Real keyboard-driven focus is what :focus-visible discriminates on
    // (unlike a plain programmatic .focus(), which some engines do not treat
    // as focus-visible at all).
    await userEvent.tab()
    expect(document.activeElement).toBe(button)

    expect(getComputedStyle(button).borderRadius).toBe(resting)
  })

  it('a control with no rounding atom keeps its square corners through :focus-visible', async () => {
    mount()
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'nave-focus-ring'
    button.textContent = 'square'
    document.body.append(button)

    // 0px is the CSS initial value: the reset strips button chrome with
    // `appearance: none` and declares no radius, so nothing rounds this
    // element. Not a design-token literal, so it carries none of the
    // re-tint brittleness resolvedTokenRadius exists to avoid.
    const resting = getComputedStyle(button).borderRadius
    expect(resting).toBe('0px')

    await userEvent.tab()
    expect(document.activeElement).toBe(button)

    expect(getComputedStyle(button).borderRadius).toBe(resting)
  })
})
