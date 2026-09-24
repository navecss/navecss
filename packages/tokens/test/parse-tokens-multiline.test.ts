/**
 * `parseTokens()` (`generate-tokens-doc.ts`) is the mechanism that decides which `--nave-*`
 * custom properties are "listed" in `TOKENS.md`. Its regex used to require the whole
 * `--nave-*: value;` declaration on one physical line, so a value wrapped across two lines (a
 * multi-layer `box-shadow`, for one) was silently dropped, with no signal from
 * `tokens-doc-drift.test.ts`, which only compares the generator's own output to itself. This
 * contradicts the tokens README's "every custom property ... is listed in TOKENS.md."
 */
import { describe, expect, it } from 'vitest'

import { parseTokens } from '../generate-tokens-doc.ts'

describe('parseTokens() reads a declaration whose value spans more than one line', () => {
  it('lists a --nave-* custom property wrapped across two physical lines', () => {
    const css = `
      .theme {
        --nave-shadow-modal: 0 1px 2px oklch(0 0 0 / 0.1),
          0 8px 24px oklch(0 0 0 / 0.2);
      }
    `
    const rows = parseTokens(css)
    expect(rows.some((row) => row.name === '--nave-shadow-modal')).toBe(true)
  })

  it('still lists an ordinary single-line declaration (no regression)', () => {
    const css = `.theme { --nave-color-tint: oklch(0.6 0.1 250); }`
    expect(parseTokens(css)).toEqual([
      { name: '--nave-color-tint', group: 'color', followsTint: false },
    ])
  })

  it('still marks a colour that references the tint as following it', () => {
    const css = `.theme { --nave-color-surface: light-dark(oklch(from var(--nave-color-tint) 0.98 0.005 h), black); }`
    expect(parseTokens(css)).toEqual([
      { name: '--nave-color-surface', group: 'color', followsTint: true },
    ])
  })
})

describe('parseTokens() ignores --nave-* mentions inside CSS comments', () => {
  it('does not let a semicolon-less comment swallow the real declaration that follows it', () => {
    const css = `
      .theme {
        /* --nave-color-decoy: light-dark(oklch(from var(--nave-color-tint) 0.9 0.01 h), black) */
        --nave-color-real: oklch(0.5 0.1 200);
      }
    `
    const rows = parseTokens(css)
    expect(rows).toEqual([{ name: '--nave-color-real', group: 'color', followsTint: false }])
  })

  it('does not let an earlier comment mention stand in for the real declaration', () => {
    const css = `
      .theme {
        /* legacy alias, see --nave-color-legacy: black; for historical value */
        --nave-color-legacy: light-dark(oklch(from var(--nave-color-tint) 0.98 0.005 h), black);
      }
    `
    const rows = parseTokens(css)
    expect(rows).toEqual([{ name: '--nave-color-legacy', group: 'color', followsTint: true }])
  })
})
