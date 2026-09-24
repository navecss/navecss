/**
 * The text-input rule excludes only checkbox/radio/range, so `input[type=submit]` (and
 * `type=reset`/`type=button`) fell through it with `appearance: none` and a transparent
 * background but no `border: none` — only `<button>` elements got the full button-chrome
 * strip, so a submit input kept a surviving 2px UA outset border and looked like no other
 * button-shaped element in the system.
 *
 * The three input types are wrapped in `:where()` so the branch stays at zero specificity,
 * same as the bare `button` selector: without it, `input[type='submit']` etc. sit at (0,1,1),
 * which beats the Disabled rule's `[disabled], [aria-disabled='true']` at (0,1,0) and makes
 * this rule's `cursor: pointer` win on a disabled button-like input.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const resetCssSrc = readFileSync(path.resolve(HERE, '../src/reset.css'), 'utf8')

describe('reset button-like inputs', () => {
  it('strips button chrome from input[type=submit|reset|button], not just <button>', () => {
    const root = postcss.parse(resetCssSrc)
    let buttonLikeRule: postcss.Rule | undefined
    root.walkRules((rule) => {
      const selectors = rule.selectors
      if (selectors.includes('button') && selectors.some((s) => s.startsWith('input:where('))) {
        buttonLikeRule = rule
      }
    })
    expect(buttonLikeRule).toBeDefined()
    const inputSelector = buttonLikeRule!.selectors.find((s) => s.startsWith('input:where('))
    expect(inputSelector).toContain("[type='submit']")
    expect(inputSelector).toContain("[type='reset']")
    expect(inputSelector).toContain("[type='button']")
    const border = buttonLikeRule!.nodes.find(
      (n): n is postcss.Declaration => n.type === 'decl' && n.prop === 'border',
    )
    expect(border?.value).toBe('none')
  })

  it('wraps the three input types in :where() so the branch carries zero specificity', () => {
    const root = postcss.parse(resetCssSrc)
    let buttonLikeRule: postcss.Rule | undefined
    root.walkRules((rule) => {
      // Identify the Buttons rule by a declaration only it carries. Selecting on
      // "includes('button') and mentions input" also matches the Forms rule
      // (`input, button, textarea, select, optgroup`), and a last-match wins scan would
      // then assert against its bare `input` selector if the two were ever reordered —
      // a false red on a behaviour-neutral edit.
      const declaresCursor = rule.nodes.some((n) => n.type === 'decl' && n.prop === 'cursor')
      if (rule.selectors.includes('button') && declaresCursor) {
        buttonLikeRule = rule
      }
    })
    expect(buttonLikeRule).toBeDefined()
    // Not a bare `input[type='submit']` (which would carry specificity (0,1,1) and beat the
    // Disabled rule's `[disabled], [aria-disabled='true']` at (0,1,0)) — must be wrapped.
    const inputSelector = buttonLikeRule!.selectors.find((s) => s.startsWith('input'))
    expect(inputSelector).toMatch(
      /^input:where\(\[type='button'\], \[type='reset'\], \[type='submit'\]\)$/,
    )
  })
})
