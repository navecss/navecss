import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'

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

  it('refuses @nave inside @keyframes at any depth, through onUnknown', () => {
    const { css, diagnostics } = expandText('@keyframes k { to { @nave flex; } }', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([{ code: 'in-keyframes', offset: 20, endOffset: 31 }])
    expect(css).not.toContain('display: flex')
    expect(norm(css)).toBe('@keyframes k { to { } }')
  })

  it('refuses a bare @nave with no atom name, through onUnknown', () => {
    const { css, diagnostics } = expandText('.a { @nave; }', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([{ code: 'no-atom', offset: 5, endOffset: 11 }])
    expect(norm(css)).toBe('.a { }')
  })

  it('reports unknown-atom for an unregistered name', () => {
    const { css, diagnostics } = expandText('.a { @nave toString; }', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      { code: 'unknown-atom', name: 'toString', offset: 11, endOffset: 19 },
    ])
    expect(norm(css)).toBe('.a { }')
  })
})

describe('AC-directive-core-06 — expandText() changes only directive spans', () => {
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

    expect(diagnostics).toEqual([{ code: 'bad-parent', offset: 0, endOffset: 11 }])
  })
})

describe('AC-directive-core-07 — expander-only rows, Syntax 3 recovery', () => {
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
})
