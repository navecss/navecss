/**
 * A rule whose last declaration has no `;` keeps that declaration and the keyboard focus ring in a
 * real engine. `directive/unterminated-last-declaration.test.ts` proves the text the expanders
 * print; this proves what a browser does with it, because dropping the ring and the declaration
 * is a parsing outcome that only an engine decides. The CSS is what `expandText()` prints, with
 * the shipped `tokens.css` so the ring's `var()` references resolve as they do in an app.
 */
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'
import { expandText } from '../../src/directive/expand-text.ts'

function mount(source: string): HTMLElement {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = `${TOKENS_CSS}\n${expandText(source, {}).css}`
  document.head.append(style)
  document.body.innerHTML = '<button class="x" type="button">x</button>'
  return document.querySelector<HTMLElement>('.x')!
}

describe.each([
  ['a declaration with no semicolon', '.x { @nave focusRing; color: red }'],
  ['focusRing after another directive', '.x { @nave hideDesktopUp focusRing; color: red }'],
  ['focusRing before another directive', '.x { @nave focusRing hideDesktopUp; color: red }'],
  ['a comment after the declaration', '.x { @nave focusRing; color: red /* c */ }'],
  ['!important on the declaration', '.x { @nave focusRing; color: red !important }'],
  ['no space before the closing brace', '.x{@nave focusRing;color:red}'],
  ['a semicolon after the declaration (control)', '.x { @nave focusRing; color: red; }'],
])('%s', (_name, source) => {
  it('keeps the declaration', () => {
    expect(getComputedStyle(mount(source)).color).toBe('rgb(255, 0, 0)')
  })

  it('draws the focus ring under keyboard focus', async () => {
    const element = mount(source)

    await userEvent.tab()

    expect(document.activeElement).toBe(element)
    expect(getComputedStyle(element).outlineStyle).toBe('solid')
  })
})
