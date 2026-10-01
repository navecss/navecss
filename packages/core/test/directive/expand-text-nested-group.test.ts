/**
 * AC-directive-core-12, through `expandText()`: a directive directly inside a group rule nested
 * in a style rule is refused with a `bad-parent` whose text names the `& { @nave ...; }`
 * workaround, and one at the true top level, or inside `@keyframes`, keeps today's text alone.
 */
import { describe, expect, it } from 'vitest'

import { formatDiagnostic } from '../../src/directive/diagnostics-format.ts'
import { expandText } from '../../src/directive/expand-text.ts'

const WORKAROUND = '& { @nave ...; }'

function textOf(css: string): string {
  const { diagnostics } = expandText(css, { onUnknown: 'warn' })
  expect(diagnostics).toHaveLength(1)
  return formatDiagnostic(diagnostics[0]!)
}

describe('AC-directive-core-12 — the bad-parent workaround sentence, through expandText()', () => {
  it.each([
    '@media (width >= 37.5em)',
    '@supports (display: grid)',
    '@container (width > 1px)',
    '@layer x',
    '@scope (.b)',
    '@starting-style',
  ])('%s inside a style rule names the & { } workaround', (group) => {
    expect(textOf(`.a { ${group} { @nave flex; } }`)).toContain(WORKAROUND)
  })

  it('a group rule nested two deep inside a style rule still names it', () => {
    expect(textOf('.a { @media (x) { @supports (y) { @nave flex; } } }')).toContain(WORKAROUND)
  })

  it('a top-level directive keeps today’s text alone', () => {
    expect(textOf('@nave flex;')).toBe(
      '@nave must be the direct child of a CSS rule selector block',
    )
  })

  it('a group rule with no style rule above it keeps today’s text alone', () => {
    expect(textOf('@media (x) { @nave flex; }')).not.toContain(WORKAROUND)
  })

  it('a directive in @keyframes is the keyframes text, never the workaround', () => {
    const { diagnostics } = expandText('.a { @keyframes k { @nave flex; } }', { onUnknown: 'warn' })

    expect(diagnostics.map((d) => formatDiagnostic(d)).join('\n')).not.toContain(WORKAROUND)
  })

  it('an at-rule that is not a group rule keeps today’s text alone', () => {
    expect(textOf('.a { @font-face { @nave flex; } }')).not.toContain(WORKAROUND)
  })
})
