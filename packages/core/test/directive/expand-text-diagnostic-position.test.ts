/**
 * AC-directive-core-13: each of expandText()'s returned diagnostics carries
 * a code, severity, file (the name the host passed via options.from), a
 * 1-based line and column (UTF-16 code units), and offset/endOffset —
 * unknown-atom also carries name and, when there is one, hint. Positions
 * hold across every line-break style CSS Syntax Level 3 recognises (LF,
 * CRLF, a lone CR, a lone form feed), not only LF.
 */
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'

describe('AC-directive-core-13 — a diagnostic carries severity, file, line and column', () => {
  it('gives severity, file and a 1-based line/column alongside offset/endOffset', () => {
    const { diagnostics } = expandText('.x {\n  color: blue;\n  @nave nope;\n}', {
      onUnknown: 'warn',
      from: 'a.css',
    })

    expect(diagnostics).toEqual([
      {
        code: 'unknown-atom',
        name: 'nope',
        severity: 'warning',
        file: 'a.css',
        line: 3,
        column: 9,
        offset: 28,
        endOffset: 32,
      },
    ])
  })

  it.each([
    ['LF', '.x {\n  color: blue;\n  @nave nope;\n}'],
    ['CRLF', '.x {\r\n  color: blue;\r\n  @nave nope;\r\n}'],
    ['a lone CR', '.x {\r  color: blue;\r  @nave nope;\r}'],
    ['a form feed', '.x {\f  color: blue;\f  @nave nope;\f}'],
  ])('holds with %s line breaks', (_label, css) => {
    const { diagnostics } = expandText(css, { onUnknown: 'warn' })

    expect(diagnostics).toEqual([expect.objectContaining({ line: 3, column: 9 })])
  })

  it('counts a surrogate pair as two UTF-16 code units, matching plain string indexing', () => {
    const css = '.a😀{@nave nope;}'
    const { diagnostics } = expandText(css, { onUnknown: 'warn' })

    expect(diagnostics).toEqual([expect.objectContaining({ line: 1, column: 12 })])
    const [diagnostic] = diagnostics
    expect(css.slice(diagnostic!.offset, diagnostic!.endOffset)).toBe('nope')
  })

  it('omits every diagnostic under onUnknown: ignore', () => {
    const { diagnostics } = expandText('.a { @nave nope; }', { onUnknown: 'ignore' })

    expect(diagnostics).toEqual([])
  })

  it('gives severity "error" under onUnknown: error', () => {
    const { diagnostics } = expandText('.a { @nave nope; }', { onUnknown: 'error' })

    expect(diagnostics).toEqual([expect.objectContaining({ severity: 'error' })])
  })

  it('omits file when options.from is not given', () => {
    const { diagnostics } = expandText('.a { @nave nope; }', { onUnknown: 'warn' })

    expect(diagnostics[0]).not.toHaveProperty('file')
  })
})
