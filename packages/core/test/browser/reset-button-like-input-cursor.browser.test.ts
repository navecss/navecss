/**
 * Adding `input[type='button'|'reset'|'submit']` to the reset's `button` rule gave those
 * branches specificity (0,1,1). The reset's own `[disabled], [aria-disabled='true'] { cursor:
 * not-allowed }` rule is (0,1,0), same layer — so specificity decided and the button rule's
 * `cursor: pointer` won on a disabled button-like input, even though the Disabled rule runs
 * later in the source. A disabled `<button>` was unaffected, because a bare `button` selector
 * is (0,0,1) and already loses to (0,1,0).
 *
 * The fix wraps the three input types in `:where()`, which contributes zero specificity, so
 * the branch matches at (0,0,1) — same as `button` — and the Disabled rule's cursor wins
 * again. Only a real engine resolving real cascade specificity against a real element can
 * prove this: a selector-text assertion (reset-button-like-inputs.test.ts) can see that
 * `:where()` is present, but not that it actually changes which declaration wins.
 */
import { describe, expect, it } from 'vitest'

import TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'
import CORE_RESET_CSS from '../../dist/reset.css?raw'
import CORE_ATOMIC_CSS from '../../dist/atomic.css?raw'

function mount(): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  document.body.innerHTML = ''
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = `${TOKENS_CSS}\n${CORE_RESET_CSS}\n${CORE_ATOMIC_CSS}`
  document.head.append(style)
}

function makeButtonLikeInput(type: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const input = document.createElement('input')
  input.type = type
  for (const [name, value] of Object.entries(attrs)) input.setAttribute(name, value)
  document.body.append(input)
  return input
}

function makeButton(attrs: Record<string, string> = {}): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = 'button'
  for (const [name, value] of Object.entries(attrs)) button.setAttribute(name, value)
  document.body.append(button)
  return button
}

const cursorOf = (el: HTMLElement): string => getComputedStyle(el).cursor

describe('disabled cursor on button-like inputs survives the button-chrome fix', () => {
  for (const type of ['submit', 'reset', 'button']) {
    describe(`input[type='${type}']`, () => {
      it('a disabled one computes not-allowed', () => {
        mount()
        const input = makeButtonLikeInput(type, { disabled: '' })
        expect(cursorOf(input)).toBe('not-allowed')
      })

      it('an aria-disabled="true" one computes not-allowed', () => {
        mount()
        const input = makeButtonLikeInput(type, { 'aria-disabled': 'true' })
        expect(cursorOf(input)).toBe('not-allowed')
      })

      it('an enabled one still computes pointer', () => {
        mount()
        const input = makeButtonLikeInput(type)
        expect(cursorOf(input)).toBe('pointer')
      })
    })
  }

  // Control: a disabled <button> was never affected by the defect (a bare `button` selector
  // is (0,0,1), which already loses to the Disabled rule's (0,1,0)), so this must hold both
  // before and after the fix.
  describe('<button> (control, unaffected by the defect either way)', () => {
    it('a disabled one computes not-allowed', () => {
      mount()
      const button = makeButton({ disabled: '' })
      expect(cursorOf(button)).toBe('not-allowed')
    })

    it('an aria-disabled="true" one computes not-allowed', () => {
      mount()
      const button = makeButton({ 'aria-disabled': 'true' })
      expect(cursorOf(button)).toBe('not-allowed')
    })

    it('an enabled one still computes pointer', () => {
      mount()
      const button = makeButton()
      expect(cursorOf(button)).toBe('pointer')
    })
  })
})
