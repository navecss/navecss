import { describe, expect, it } from 'vitest'

import { formatDiagnostic } from '../../src/directive/diagnostics-format.ts'

describe('AC-directive-core-14 — the texts, owned by the core', () => {
  it('gives the hint clause for a close typo', () => {
    expect(
      formatDiagnostic({ code: 'unknown-atom', name: 'interactve', offset: 0, endOffset: 0 }),
    ).toBe('@nave: unknown atom "interactve". Did you mean "interactive"?')
  })

  it('gives the extend-option clause plus Available for a far typo, printed once and last', () => {
    const text = formatDiagnostic({
      code: 'unknown-atom',
      name: 'fancyShadow',
      offset: 0,
      endOffset: 0,
    })

    expect(text).toContain(
      '@nave: unknown atom "fancyShadow". If it is an atom of your own, pass it in the extend option.',
    )
    expect(text).toContain('Available: ')
    expect(text.indexOf('Available:')).toBe(text.lastIndexOf('Available:'))
    expect(text.endsWith(text.split('\n').at(-1)!)).toBe(true)
  })

  it('hints an extend atom, and omits Available when a hint is found', () => {
    const text = formatDiagnostic(
      { code: 'unknown-atom', name: 'brandBoxx', offset: 0, endOffset: 0 },
      { extend: { brandBox: { declarations: {} } } },
    )

    expect(text).toBe('@nave: unknown atom "brandBoxx". Did you mean "brandBox"?')
  })

  it('gives the bare-directive text exactly', () => {
    expect(formatDiagnostic({ code: 'no-atom', offset: 0, endOffset: 0 })).toBe(
      '@nave: directive names no atom',
    )
  })

  it('gives the top-level bad-parent text alone, with no workaround sentence', () => {
    expect(formatDiagnostic({ code: 'bad-parent', offset: 0, endOffset: 0 })).toBe(
      '@nave must be the direct child of a CSS rule selector block',
    )
  })

  it('appends the & workaround sentence when nested in a group rule', () => {
    const text = formatDiagnostic({
      code: 'bad-parent',
      offset: 0,
      endOffset: 0,
      detail: 'nested-group',
    })

    expect(text).toContain('@nave must be the direct child of a CSS rule selector block')
    expect(text).toContain('& { @nave')
  })

  it('gives the @keyframes text exactly', () => {
    expect(formatDiagnostic({ code: 'in-keyframes', offset: 0, endOffset: 0 })).toBe(
      '@nave cannot be used inside @keyframes',
    )
  })
})

describe('AC-directive-core-15 — the hint rule, boundaries', () => {
  const hinted: readonly [typed: string, hint: string][] = [
    ['interactve', 'interactive'],
    ['flx', 'flex'],
    ['blxxk', 'block'],
  ]
  const unhinted: readonly string[] = ['gxxd', 'fancyShadow']

  it.each(hinted)('%s -> %s', (typed, hint) => {
    const text = formatDiagnostic({ code: 'unknown-atom', name: typed, offset: 0, endOffset: 0 })
    expect(text).toContain(`Did you mean "${hint}"?`)
  })

  it.each(unhinted)('%s -> no hint', (typed) => {
    const text = formatDiagnostic({ code: 'unknown-atom', name: typed, offset: 0, endOffset: 0 })
    expect(text).not.toContain('Did you mean')
  })

  it('adds the camelCase sentence for a hyphenated input that normalises to one atom', () => {
    const text = formatDiagnostic({
      code: 'unknown-atom',
      name: 'sr-only',
      offset: 0,
      endOffset: 0,
    })

    expect(text).toContain('Did you mean "srOnly"?')
    expect(text).toContain('Atom names are camelCase; "nave-sr-only" is its class.')
  })

  it('does not add the camelCase sentence for a non-hyphenated input', () => {
    const text = formatDiagnostic({
      code: 'unknown-atom',
      name: 'flexcol',
      offset: 0,
      endOffset: 0,
    })

    expect(text).toContain('Did you mean "flexCol"?')
    expect(text).not.toContain('camelCase')
  })

  it('names every tied candidate, in vocabulary order', () => {
    const text = formatDiagnostic({ code: 'unknown-atom', name: 'xFull', offset: 0, endOffset: 0 })

    expect(text).toContain('Did you mean "wFull" or "hFull"?')
  })
})
