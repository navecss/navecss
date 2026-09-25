/**
 * AC-consumer-constraints-10: `ATOMS.md`'s Variants column used to list a pseudo/media/container
 * selector alone (`focusRing` showed `` `:focus-visible` `` with nothing beside it, so its
 * Declarations column's resting `outline: none;` was the only declaration a reader ever saw — the
 * exact shape a copy-pasting reader was misled by). `generate-atoms-doc.ts`'s `renderVariants`
 * now renders each variant's own declarations beside its selector; this pins that on the atoms
 * whose variants are the sharpest regression case. `atoms-doc-drift.test.ts` covers the file
 * staying in sync; this test covers its CONTENT actually carrying the fix.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ATOMS_MD = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ATOMS.md'),
  'utf8',
)

function rowFor(atomName: string): string {
  const row = ATOMS_MD.split('\n').find((line) => line.startsWith(`| \`${atomName}\``))
  expect(row, `expected a row for \`${atomName}\` in ATOMS.md`).toBeDefined()
  return row!
}

describe('AC-consumer-constraints-10: ATOMS.md renders each variant’s own declarations', () => {
  it('focusRing shows the :focus-visible variant’s declarations, not `outline: none;` alone', () => {
    const row = rowFor('focusRing')
    expect(row).toContain(':focus-visible')
    expect(row).toContain(
      'outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus);',
    )
    expect(row).toContain('outline-offset: 2px;')
  })

  it('disabledState shows its pseudo variant’s declarations', () => {
    const row = rowFor('disabledState')
    expect(row).toContain(':disabled, [aria-disabled="true"]')
    expect(row).toContain('color: var(--nave-color-content-disabled);')
    expect(row).toContain('border-color: var(--nave-color-border-disabled);')
    expect(row).toContain('pointer-events: none;')
  })

  it('srOnlyFocusable shows both variants’ revealed declarations', () => {
    const row = rowFor('srOnlyFocusable')
    expect(row).toContain(':focus-visible')
    expect(row).toContain(':focus-within')
    expect(row).toContain('position: static;')
    expect(row).toContain('white-space: normal;')
  })

  it('a variant-selector-only row (the pre-fix shape) would fail this criterion', () => {
    const preFixRow = '| `focusRing` | `nave-focus-ring` | `outline: none;` | `:focus-visible` |'
    expect(preFixRow).not.toContain('outline-offset: 2px;')
  })
})
