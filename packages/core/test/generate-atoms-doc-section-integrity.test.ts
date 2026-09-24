/**
 * `readSections()` (`scripts/generate-atoms-doc.ts`) learns which section an atom belongs to
 * from source TEXT: a `  name: {` line under the nearest `// ── Section ──` comment. An atom
 * key outside that exact shape (quoted, sharing a line with another key, or written before any
 * section heading) is invisible to the walk, and `atoms-doc-drift.test.ts` cannot catch the
 * result, because it only compares the generator's own output to itself. This test forces the
 * walk to check what it collected against the live atom names and refuse with a named error
 * rather than silently emit a table with fewer rows than atoms shipped.
 */
import { describe, expect, it } from 'vitest'

import { AtomsDocSectionMismatchError, readSections } from '../scripts/generate-atoms-doc.ts'

describe('readSections() refuses a shorter table instead of emitting one', () => {
  it('throws AtomsDocSectionMismatchError when a live atom key is not in the shape the walk parses', () => {
    const source = [
      'export const atoms = {',
      '  // ── Layout ──',
      "  'quoted-key': {",
      "    declarations: { display: 'contents' },",
      '  },',
      '} as const satisfies Record<string, AtomDefinition>',
    ].join('\n')

    expect(() => readSections(source, ['quoted-key'])).toThrow(AtomsDocSectionMismatchError)
  })

  it('does not throw when every live atom name is captured by a section', () => {
    const source = [
      'export const atoms = {',
      '  // ── Layout ──',
      '  block: {',
      '    declarations: { display: "block" },',
      '  },',
      '} as const satisfies Record<string, AtomDefinition>',
    ].join('\n')

    expect(() => readSections(source, ['block'])).not.toThrow()
  })
})
