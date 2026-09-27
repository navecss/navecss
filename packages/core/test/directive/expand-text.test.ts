import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { tokenize } from '../../src/directive/tokenizer.ts'

/**
Collapses whitespace runs so assertions don't pin the exact spacing expandText happens to choose.
 */
function norm(css: string): string {
  return css.replaceAll(/\s+/g, ' ').trim()
}

describe('AC-directive-core-04 — the shipped placement semantics, through expandText()', () => {
  const rows: readonly [input: string, expected: string][] = [
    ['.a { color: red; @nave flex; }', '.a { color: red; display: flex; }'],
    [
      '.a { &:hover { color: red } @nave flex; }',
      '.a { &:hover { color: red } & { display: flex } }',
    ],
    ['.a { color: red; @foo; @nave flex; }', '.a { color: red; @foo; & { display: flex } }'],
    [
      '@supports (display: grid) { .a { @nave flex; } }',
      '@supports (display: grid) { .a { display: flex; } }',
    ],
    ['.a { @media (x) { & { @nave flex; } } }', '.a { @media (x) { & { display: flex; } } }'],
  ]

  it.each(rows)('%s', (input, expected) => {
    const { css, diagnostics } = expandText(input, { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(norm(css)).toBe(norm(expected))
  })

  it.each([
    '.a { @NAVE flex; }',
    '.a { @Nave flex; }',
    String.raw`.a { @n\61ve flex; }`,
    String.raw`.a { @n\61 ve flex; }`,
    String.raw`.a { @\6e ave flex; }`,
  ])('AC-directive-core-10: %s expands to display: flex', (input) => {
    const { css, diagnostics } = expandText(input, {})

    expect(diagnostics).toEqual([])
    expect(css).toContain('display: flex')
  })

  it.each(['.a { @navex flex; }', '.a { @nave-x flex; }', '.a { @ｎave flex; }'])(
    'AC-directive-core-10: %s passes through unchanged, no diagnostic',
    (input) => {
      const { css, diagnostics } = expandText(input, {})

      expect(diagnostics).toEqual([])
      expect(css).toBe(input)
    },
  )

  it('refuses @nave inside @keyframes at any depth, through onUnknown', () => {
    const { css, diagnostics } = expandText('@keyframes k { to { @nave flex; } }', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([
      { code: 'in-keyframes', severity: 'warning', line: 1, column: 21, offset: 20, endOffset: 31 },
    ])
    expect(css).not.toContain('display: flex')
    expect(norm(css)).toBe('@keyframes k { to { } }')
  })

  it('refuses a bare @nave with no atom name, through onUnknown', () => {
    const { css, diagnostics } = expandText('.a { @nave; }', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      { code: 'no-atom', severity: 'warning', line: 1, column: 6, offset: 5, endOffset: 11 },
    ])
    expect(norm(css)).toBe('.a { }')
  })

  it('reports unknown-atom for an unregistered name', () => {
    const { css, diagnostics } = expandText('.a { @nave toString; }', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      {
        code: 'unknown-atom',
        name: 'toString',
        severity: 'warning',
        line: 1,
        column: 12,
        offset: 11,
        endOffset: 19,
      },
    ])
    expect(norm(css)).toBe('.a { }')
  })
})

describe('AC-directive-core-06 — expandText() changes only directive spans', () => {
  it('turns a line terminator inside an inserted extend value into one space, keeping every line number', () => {
    const extend = { deep: { declarations: { 'grid-template-areas': '"a b"\n "c d"' } } }
    const input = '.a {\n  color: red;\n  @nave deep;\n  color: blue;\n}\n'

    const { css } = expandText(input, { onUnknown: 'warn', extend })

    expect(css.split('\n')).toHaveLength(input.split('\n').length)
    expect(css).toContain('grid-template-areas: "a b"  "c d";')
  })

  it('returns an object with exactly css, map and diagnostics', () => {
    const result = expandText('.a { @nave flex; }', { onUnknown: 'warn' })

    expect(Object.keys(result).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'css',
      'diagnostics',
      'map',
    ])
  })

  it('never touches @nave inside a comment, a string, a url(), a declaration value or a custom property value', () => {
    const untouched = [
      '/* @nave flex; */',
      '.a { content: "@nave flex"; }',
      '.a { background: url(@nave.png); }',
      '.a { color: @nave flex; }',
      '.a { --x: @nave flex; }',
      '.a { --x: { a: b }; }',
    ]
    for (const css of untouched) {
      const result = expandText(css, { onUnknown: 'warn' })
      expect(result.css).toBe(css)
      expect(result.diagnostics).toEqual([])
    }
  })

  it('puts declarations inline with no wrapper when a custom property {} value precedes the directive', () => {
    const { css, diagnostics } = expandText('.a { --x: { a: b }; @nave flex; }', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([])
    expect(norm(css)).toBe(norm('.a { --x: { a: b }; display: flex; }'))
  })

  it('gives one bad-parent for a top-level directive', () => {
    const { diagnostics } = expandText('@nave flex;', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      { code: 'bad-parent', severity: 'warning', line: 1, column: 1, offset: 0, endOffset: 11 },
    ])
  })
})

describe('AC-directive-core-07 — expander-only rows, Syntax 3 recovery', () => {
  it('every row in this criterion genuinely throws in PostCSS’s own parser', () => {
    const rows = [
      '.a { color: red; @nave focusRing',
      '.a { color: red; @nave flex;',
      '.a { b; @nave flex; }',
      '<!-- .a { @nave flex; } -->',
      '.a { @nave flex; /* unclosed',
      '.a { content: "unclosed; @nave flex; }',
    ]
    for (const css of rows) {
      expect(() => postcss.parse(css), `expected PostCSS to reject: ${css}`).toThrow()
    }
  })

  it('expands an unclosed rule at end of input, appending its blocks at end of input', () => {
    const { css, diagnostics } = expandText('.a { color: red; @nave focusRing', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([])
    expect(css).toContain('outline: none')
    expect(css).toContain('&:focus-visible')
    expect(css.indexOf('outline: none')).toBeLessThan(css.indexOf('&:focus-visible'))
  })

  it('expands an unclosed directive with no trailing semicolon', () => {
    const { css } = expandText('.a { color: red; @nave flex;', { onUnknown: 'warn' })

    expect(norm(css)).toBe('.a { color: red; display: flex;')
  })

  it('treats an invalid item as not a nested node', () => {
    const { css } = expandText('.a { b; @nave flex; }', { onUnknown: 'warn' })

    expect(norm(css)).toBe('.a { b; display: flex; }')
  })

  it('expands inside a CDO/CDC pair, keeping the <!-- and --> bytes', () => {
    const { css, diagnostics } = expandText('<!-- .a { @nave flex; } -->', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(css).toBe('<!-- .a { display: flex; } -->')
  })

  it('expands before an unclosed trailing comment, keeping the comment bytes', () => {
    const { css, diagnostics } = expandText('.a { @nave flex; /* unclosed', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(css).toBe('.a { display: flex; /* unclosed')
  })

  it('places an appended block before an unclosed trailing comment, not inside it', () => {
    const { css } = expandText('.a { @nave focusRing; /* c', { onUnknown: 'warn' })

    const tokens = tokenize(css)
    expect(tokens.some((t) => t.type === 'ident-token' && t.raw === 'focus-visible')).toBe(true)
    expect(css.endsWith('/* c')).toBe(true)
  })

  it('leaves a directive inside an unclosed (bad) string untouched', () => {
    const input = '.a { content: "unclosed; @nave flex; }'
    const { css, diagnostics } = expandText(input, { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(css).toBe(input)
  })
})

describe('AC-directive-core-25 — expandText() stays fast on a large stylesheet', () => {
  it('runs a 20000-line stylesheet with no directive in under 2 seconds', () => {
    const css = '.a { color: red; }\n'.repeat(20_000)

    const start = performance.now()
    expandText(css)
    expect(performance.now() - start).toBeLessThan(2000)
  })
})
