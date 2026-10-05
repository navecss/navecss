/**
 * focusRing must still draw a ring when the token layer is missing or wrong, in a real engine.
 *
 * The atom removes the element's default outline at rest and restores one on
 * :focus-visible. If that restored declaration reads a custom property that is
 * undefined, it is invalid at computed-value time and the shorthand collapses
 * to `outline: none`: the element then has no focus indicator at all. That
 * happens whenever the token stylesheet fails to load, when a consumer's own
 * token layer (`@navecss/core/no-tokens`) leaves out the two focus properties,
 * and when a property is defined but holds a value of the wrong type.
 *
 * This mounts the real shipped reset.css + atomic.css, drives a real keyboard
 * tab (the only way to trigger `:focus-visible`), and reads the engine's own
 * computed outline.
 */
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'
import CORE_ATOMIC_CSS from '../../dist/atomic.css?raw'
import CORE_RESET_CSS from '../../dist/reset.css?raw'

function mount(...layers: string[]): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  document.body.replaceChildren()
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = [...layers, CORE_RESET_CSS, CORE_ATOMIC_CSS].join('\n')
  document.head.append(style)
}

async function focusedRing(textColor?: string): Promise<CSSStyleDeclaration> {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'nave-focus-ring'
  button.textContent = 'focus me'
  if (textColor) button.style.color = textColor
  document.body.append(button)

  await userEvent.tab()
  expect(document.activeElement).toBe(button)

  return getComputedStyle(button)
}

// An unlayered custom-property rule wins over the token layer's @layer declarations, whatever the
// order the two are mounted in.
const FOCUS_TOKEN_OVERRIDE =
  ':root { --nave-border-width-focus: 5px; --nave-color-border-focus: rgb(1, 2, 3); }'

describe('focusRing still draws a ring without a complete token layer', () => {
  it('with the shipped tokens, draws a solid 2px ring offset by 2px', async () => {
    mount(TOKENS_CSS)

    const ring = await focusedRing()

    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('2px')
    expect(ring.outlineOffset).toBe('2px')
  })

  it('with the shipped tokens and an override of both focus properties, the ring reads the override', async () => {
    mount(TOKENS_CSS, FOCUS_TOKEN_OVERRIDE)

    const ring = await focusedRing()

    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('5px')
    expect(ring.outlineColor).toBe('rgb(1, 2, 3)')
    expect(ring.outlineOffset).toBe('2px')
  })

  it('with no token layer at all, draws a 2px ring in the element’s own text colour', async () => {
    mount()

    const ring = await focusedRing('rgb(10, 120, 200)')

    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('2px')
    expect(ring.outlineColor).toBe('rgb(10, 120, 200)')
    expect(ring.outlineOffset).toBe('2px')
  })

  it('with a token layer that defines neither focus property, draws the same ring', async () => {
    mount(':root { --nave-color-content-primary: rebeccapurple; }')

    const ring = await focusedRing()

    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('2px')
  })

  it('with a wrong-typed colour, still draws a 2px ring in the element’s own text colour', async () => {
    mount(':root { --nave-color-border-focus: 3px; }')

    const ring = await focusedRing()

    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('2px')
    expect(ring.outlineColor).toBe(ring.color)
  })

  // The shipped tokens register --nave-border-width-focus, and a registered property resets to its
  // registered initial value on a wrong-typed value. This fixture deliberately leaves it
  // unregistered, so the wrong-typed value reaches the outline-width declaration itself.
  it('with a wrong-typed width, still draws a ring, at the outline’s initial width (3px)', async () => {
    mount(':root { --nave-border-width-focus: banana; }')

    const ring = await focusedRing()

    expect(ring.outlineStyle).toBe('solid')
    expect(ring.outlineWidth).toBe('3px')
  })
})
