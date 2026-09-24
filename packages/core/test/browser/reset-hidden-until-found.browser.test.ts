/**
 * `[hidden]:where(:not([hidden='until-found']))` matches the attribute VALUE
 * case-sensitively, but `hidden` is an HTML enumerated attribute whose keywords are ASCII
 * case-insensitive: a real engine treats `hidden="UNTIL-FOUND"` as the same until-found state
 * as `hidden="until-found"` (content-visibility: hidden, revealable by find-in-page), while
 * the reset's exemption selector, missing the `i` flag, did not recognise that spelling and
 * kept applying `display: none !important` to it — permanently defeating find-in-page reveal
 * for any author who capitalises the attribute value. Only a real engine resolving a real
 * case-insensitive attribute-selector match can prove this: a selector-text assertion
 * (reset-hidden-until-found.test.ts) can see that the `i` flag is present in the source, but
 * not that it actually changes which value the selector treats as until-found.
 */
import { describe, expect, it } from 'vitest'

import CORE_RESET_CSS from '../../dist/reset.css?raw'

function mount(): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  document.body.innerHTML = ''
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = CORE_RESET_CSS
  document.head.append(style)
}

function makeHidden(value: string): HTMLDivElement {
  const div = document.createElement('div')
  div.setAttribute('hidden', value)
  document.body.append(div)
  return div
}

describe('reset [hidden] vs hidden="until-found" (case-insensitivity)', () => {
  it('a plain hidden attribute computes display: none', () => {
    mount()
    const div = makeHidden('')
    expect(getComputedStyle(div).display).toBe('none')
  })

  it('hidden="until-found" is exempt (does not compute display: none)', () => {
    mount()
    const div = makeHidden('until-found')
    expect(getComputedStyle(div).display).not.toBe('none')
  })

  it('hidden="UNTIL-FOUND" is ALSO exempt — the lawful case-insensitive spelling', () => {
    mount()
    const div = makeHidden('UNTIL-FOUND')
    expect(getComputedStyle(div).display).not.toBe('none')
  })
})
