/**
 * Regression guard: the reset formerly removed the
 * user-agent focus indicator document-wide (`:focus { outline: none }`),
 * unconditionally, while only elements carrying the opt-in `focusRing` atom
 * got a `:focus-visible` replacement. Cédric ruled the rule deleted outright
 * with no replacement shipped — the reset falls back to user-agent focus
 * indicators.
 *
 * This defect was invisible for the life of the project and was found by
 * reading, not by running anything. Test the class, not the instance: assert
 * that no rule in the reset strips focus visibility from a selector that is
 * not itself gated on :focus-visible. A future "let's clean up the focus
 * styles" commit that reintroduces it fails here.
 *
 * Widened later: the deletion above is only HALF of that
 * ruling ("no rule strips outline"); the other half is "and nothing
 * replaces it". A global `:focus-visible { outline: ...; outline-offset: ...
 * }` fallback shipped in reset.css despite never removing anything, so the
 * two tests above both passed while the ruling's second half did not hold,
 * caught by the project's accessibility steward. A ruling whose content is "and we ship nothing
 * here" needs an assertion of ABSENCE, not just of non-removal — the third
 * test below is that assertion, against the class of author-styled
 * document-scope focus indicators, not the one instance found.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const RESET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/reset.css')
const css = readFileSync(RESET, 'utf8')

/** The value KEYWORDS that remove an outline. Scanned over the WHOLE value, functions
 * included, because a keyword cannot turn up inside a colour function by coincidence the way
 * a bare `0` can: `color-mix(in srgb, transparent, red)` still counts. */
const REMOVING_KEYWORD = /^(none|hidden|transparent)$/i

/**
 * A zero length in any unit. Scanned at the TOP LEVEL of the value only (see `topLevel`).
 */
const ZERO_LENGTH = /^0(?:\.0+)?(?:[a-z]+|%)?$/i

/**
 * A colour function with a literal zero alpha channel: `rgb(0 0 0 / 0)` is `transparent`
 * written the long way, and the top-level scan cannot see inside the function.
 */
const ZERO_ALPHA = /\/\s*(?:0|0?\.0+)%?\s*\)/

/** The outline shorthand and its three removing longhands. `outline-offset` is deliberately
 * absent: it MOVES an indicator, it does not remove one. Widened: the
 * shorthand-only predicate this replaces read the whole class in its docblock and asserted
 * only `outline: none|0`, so `a:focus { outline-width: 0 }` passed all three tests here while
 * the README publishes that no reset rule strips the indicator outside a :focus-visible gate. */
const OUTLINE_PROPERTY = /^outline(-(width|style|color))?$/i

function tokensOf(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean)
}

/** The value with every function call's arguments removed, to a fixed point. Without this a
 * zero CHANNEL of modern space-separated colour syntax reads as a zero outline WIDTH, so
 * `outline: 2px solid rgb(0 0 0)` and the house `light-dark(oklch(...), oklch(...))` idiom are
 * fully visible outlines classified as removals (found in review). */
function topLevel(value: string): string {
  let out = value
  for (;;) {
    const next = out.replaceAll(/[\w-]*\([^()]*\)/g, ' ')
    if (next === out) return out
    out = next
  }
}

function removesOutline(declaration: { prop: string; value: string }): boolean {
  if (!OUTLINE_PROPERTY.test(declaration.prop)) return false
  const value = declaration.value.replace(/\s*!\s*important\s*$/i, '').trim()
  return (
    tokensOf(value).some((token) => REMOVING_KEYWORD.test(token)) ||
    tokensOf(topLevel(value)).some((token) => ZERO_LENGTH.test(token)) ||
    ZERO_ALPHA.test(value)
  )
}

/** A selector that is exactly a bare, document-scope `:focus` / `:focus-visible`
 * (optionally prefixed with the universal selector), not scoped further by an
 * element, class, id or attribute — e.g. `:focus-visible` or `*:focus`, but
 * not `.focusRing:focus-visible` or `input:focus-visible`. */
const BARE_DOCUMENT_SCOPE_FOCUS_SELECTOR = /^\*?:focus(-visible)?$/i

/** Properties that constitute an author-styled focus indicator, per the
 * ruling's second option it named and rejected ("ship a global
 * :focus-visible fallback"): outline, box-shadow, border and background,
 * including their longhands (outline-color, border-width, background-color,
 * and so on). */
const DECLARES_FOCUS_INDICATOR = /^(outline|box-shadow|border|background)(-[\w-]+)?$/i

describe('reset.css focus visibility', () => {
  it('never strips outline on a selector that is not gated on :focus-visible', () => {
    const root = postcss.parse(css)
    const offenders: string[] = []

    root.walkRules((rule) => {
      // Only bare declarations of this rule's own body count; nested rules
      // (e.g. a :focus-visible child) are walked separately by walkRules.
      const ownsOutlineRemoval = rule.nodes.some(
        (node) => node.type === 'decl' && removesOutline(node),
      )
      if (!ownsOutlineRemoval) return

      const gatedOnFocusVisible = rule.selectors.every((selector) =>
        selector.includes(':focus-visible'),
      )
      if (!gatedOnFocusVisible) offenders.push(rule.selector)
    })

    expect(
      offenders,
      `selectors removing focus visibility outside :focus-visible: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('does not set a document-wide :focus { outline: none } rule', () => {
    const root = postcss.parse(css)
    let found = false

    root.walkRules(/(^|,)\s*:focus\s*(,|$)/, () => {
      found = true
    })

    expect(found).toBe(false)
  })

  it('declares no author-styled focus indicator at document scope', () => {
    const root = postcss.parse(css)
    const offenders: string[] = []

    root.walkRules((rule) => {
      const declaresIndicator = rule.nodes.some(
        (node) => node.type === 'decl' && DECLARES_FOCUS_INDICATOR.test(node.prop),
      )
      if (!declaresIndicator) return

      const isBareDocumentScope = rule.selectors.some((selector) =>
        BARE_DOCUMENT_SCOPE_FOCUS_SELECTOR.test(selector.trim()),
      )
      if (isBareDocumentScope) offenders.push(rule.selector)
    })

    expect(
      offenders,
      `bare :focus/:focus-visible rules declaring an author-styled indicator: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
