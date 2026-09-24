/**
 * disabledState actually MATCHES in a real engine (follow-up to the change that added it).
 *
 * disabled-state.test.ts (Node) proves the atom's SOURCE gates on both
 * `:disabled` and `[aria-disabled="true"]`, and that the built CSS contains
 * both substrings nested under the class rule. It cannot prove the compiled
 * selector actually MATCHES an element carrying both the class and the
 * attribute: `renderNested` (build-css.ts) turns a pseudo key into a nested
 * rule by naively prepending `&` to the whole key string
 * (`` `&${pseudo}` ``), which is correct for a single-selector key but wrong
 * for a comma-separated one — only the FIRST branch gets `&`. Per CSS
 * Nesting semantics, a branch with no explicit `&` and no leading combinator
 * is an implicit DESCENDANT selector, not a same-element compound match. So
 * the bug this guards against compiles
 * `.nave-disabled-state:disabled, [aria-disabled="true"]` — which resolves
 * to `.nave-disabled-state:disabled, .nave-disabled-state [aria-disabled="true"]`
 * (note the space): an element with BOTH the class and the attribute on
 * itself does not match on the aria-disabled branch at all, silently
 * defeating the entire stated purpose of the class/attribute nesting fix.
 * Only a real engine resolving real nesting semantics against a real element can catch this — a
 * string/substring assertion on the CSS text cannot, and the pre-existing
 * Node-side suite (all six assertions) passed unchanged against the buggy
 * build.
 *
 * This atom's blanket `opacity` was replaced with the two dedicated disabled
 * colour tokens (exit 4), and those two declarations get their real-engine
 * coverage here for the same reason the ones above have it: the Node-side
 * suite can only assert that the strings are present in the built text. It
 * cannot resolve `var()`, `light-dark()`, a relative colour, the reset's
 * `currentcolor` fill rule, or the cascade against a UA border — all of
 * which stand between "the declaration is in the file" and "the element
 * actually paints disabled".
 */
import { describe, expect, it } from 'vitest'

// Browser-mode test files execute inside the real browser, so the built CSS
// has to be inlined at bundle time (Vite's `?raw` import) rather than read
// with node:fs — this is the real, built dist/atomic.css, not a hand-typed
// reproduction of the atom's shape. The tokens and reset stylesheets are
// inlined for the same reason and are not optional scenery: without
// tokens.css the atom's `var(--nave-color-*)` references are invalid at
// computed-value time, and the reset is what carries the `currentcolor`
// fill rule the doc comment claims reaches inline icons.
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

function makeButton(attrs: Record<string, string>): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'nave-disabled-state'
  button.textContent = 'button'
  for (const [name, value] of Object.entries(attrs)) button.setAttribute(name, value)
  document.body.append(button)
  return button
}

function makeTextInput(attrs: Record<string, string>): HTMLInputElement {
  // A <button> is the wrong fixture for border-color: reset.css strips button
  // chrome with `border: none`. A text input keeps its native border (the
  // reset only touches appearance/background-color/border-radius there), so
  // it is an element where the atom's `border-color` has something to colour.
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'nave-disabled-state'
  for (const [name, value] of Object.entries(attrs)) input.setAttribute(name, value)
  document.body.append(input)
  return input
}

/**
 * The engine's own resolved value for a colour token, read off a throwaway
 * probe instead of hard-coded as an `oklch(...)`/`rgb(...)` literal. A
 * literal would pin the assertion to today's palette and go red on every
 * re-tint, which the tokens layer explicitly invites (R34): that is a
 * token-value pin, not a behaviour check. The probe lives in the same
 * inheritance context as the subject, so a relative-colour token
 * (`oklch(from var(--nave-color-tint) ...)`) resolves identically for both.
 */
function resolvedTokenColor(token: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  document.body.append(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return value
}

// pointer-events: none is the atom's gated declaration — checking it (rather
// than opacity, which some engines report identically at 1 either way) is
// the clearest single-property proxy for "did the gated selector match".
const isGated = (el: HTMLElement): boolean => getComputedStyle(el).pointerEvents === 'none'

describe('disabledState matches in a real engine, not just in built CSS text', () => {
  it('an element with the class AND the native disabled attribute matches', () => {
    mount()
    const button = makeButton({ disabled: '' })
    expect(isGated(button)).toBe(true)
  })

  it('an element with the class AND aria-disabled="true" (no native disabled) ALSO matches', () => {
    // This is the branch the naive `&` prepend silently breaks: without an
    // explicit `&` on this branch, the compiled selector requires the
    // attribute on a DESCENDANT, never on the element itself.
    mount()
    const button = makeButton({ 'aria-disabled': 'true' })
    expect(isGated(button)).toBe(true)
  })

  it('an element with aria-disabled="true" but WITHOUT the class does not match (no global leak)', () => {
    mount()
    const button = document.createElement('button')
    button.setAttribute('aria-disabled', 'true')
    document.body.append(button)
    expect(isGated(button)).toBe(false)
  })

  it('an element with the class but neither attribute does not match (the negative/gating case)', () => {
    mount()
    const button = makeButton({})
    expect(isGated(button)).toBe(false)
  })
})

describe('the disabled colour declarations resolve against a real engine', () => {
  it('the fixture really has the tokens layer mounted (guards a false green)', () => {
    // Without tokens.css the atom's var() references are invalid at
    // computed-value time and `color` silently falls back to the inherited
    // value — which is exactly what an undisabled sibling computes, so every
    // colour assertion below would compare two identical fallbacks and pass
    // while proving nothing. Pin the fixture, not the palette: assert the
    // token resolves to something OTHER than the default text colour.
    mount()
    const plain = makeButton({})
    expect(resolvedTokenColor('--nave-color-content-disabled')).not.toBe(
      getComputedStyle(plain).color,
    )
    expect(resolvedTokenColor('--nave-color-border-disabled')).not.toBe(
      getComputedStyle(plain).color,
    )
  })

  it('computes `color` from --nave-color-content-disabled when the gate matches', () => {
    mount()
    const button = makeButton({ 'aria-disabled': 'true' })
    expect(getComputedStyle(button).color).toBe(resolvedTokenColor('--nave-color-content-disabled'))
  })

  it('does NOT compute that colour when the gate does not match', () => {
    mount()
    const button = makeButton({})
    expect(getComputedStyle(button).color).not.toBe(
      resolvedTokenColor('--nave-color-content-disabled'),
    )
  })

  it('computes `border-color` from --nave-color-border-disabled on an element that has a border', () => {
    mount()
    const input = makeTextInput({ 'aria-disabled': 'true' })
    const computed = getComputedStyle(input)
    // Fixture guard: if the reset (or a UA change) ever leaves this input
    // borderless, the border-color assertion below becomes vacuous rather
    // than wrong, and would keep passing. Fail on the fixture instead.
    expect(computed.borderTopStyle).not.toBe('none')
    expect(computed.borderTopColor).toBe(resolvedTokenColor('--nave-color-border-disabled'))
  })

  it("carries the disabled colour into an inline icon via the reset's currentcolor fill rule", () => {
    // The shipped doc comment (and dist/atoms.d.ts, which consumers read)
    // claims `color` also carries inline icons through reset.css's
    // `svg:not([fill]) { fill: currentcolor }`. Asserted here because a
    // claim that ships to consumers in a comment is otherwise checked by
    // nothing at all (content, not a marker).
    mount()
    const button = makeButton({ 'aria-disabled': 'true' })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    // Deliberately NO fill attribute — that is the reset rule's own gate.
    button.append(svg)

    const disabled = resolvedTokenColor('--nave-color-content-disabled')
    expect(getComputedStyle(button).color).toBe(disabled)
    expect(getComputedStyle(svg).fill).toBe(disabled)
  })
})
