/**
 * AC-consumer-constraints-10: `ATOMS.md`'s Variants column used to list a pseudo/media/container
 * selector alone (`focusRing` showed `` `:focus-visible` `` with nothing beside it, so its
 * Declarations column's resting `outline: none;` was the only declaration a reader ever saw — the
 * exact shape a copy-pasting reader was misled by). `generate-atoms-doc.ts`'s `renderVariants`
 * now renders each variant's own declarations beside its selector; this pins that on EVERY atom
 * that declares a variant, not a hand-picked few, and covers pseudos nested inside a `@media` or
 * `@container` block, which `renderVariants` also has to render. `atoms-doc-drift.test.ts` covers
 * the file staying in sync; this test covers its CONTENT actually carrying the fix.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { AtomDefinition, AtomName } from '../src/atoms.ts'

import { renderVariants } from '../scripts/generate-atoms-doc.ts'
import { atoms } from '../src/atoms.ts'

const ATOMS_MD = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ATOMS.md'),
  'utf8',
)

function rowFor(atomName: string): string {
  const row = ATOMS_MD.split('\n').find((line) => line.startsWith(`| \`${atomName}\``))
  expect(row, `expected a row for \`${atomName}\` in ATOMS.md`).toBeDefined()
  return row!
}

/**
 * Every `prop: value;` declaration string every variant of `atomName` applies — top-level
 * pseudos, and each `media`/`container` block's own declarations plus its nested pseudos — that
 * does NOT appear in `row` (a rendered `ATOMS.md` table row). An atom with no variants returns
 * `[]` trivially: it has no declarations to look for.
 */
function missingVariantDeclarations(row: string, atomName: AtomName): string[] {
  const atom: AtomDefinition = atoms[atomName]
  const expected: string[] = []
  const collect = (declarations: Record<string, string>) => {
    for (const [prop, value] of Object.entries(declarations)) {
      expected.push(`${prop}: ${value};`)
    }
  }
  if (atom.pseudos) {
    for (const declarations of Object.values(atom.pseudos)) collect(declarations)
  }
  for (const blocks of [atom.media, atom.container]) {
    if (!blocks) continue
    for (const block of Object.values(blocks)) {
      if (block.declarations) collect(block.declarations)
      if (block.pseudos) {
        for (const declarations of Object.values(block.pseudos)) collect(declarations)
      }
    }
  }
  return expected.filter((declaration) => !row.includes(declaration))
}

describe('AC-consumer-constraints-10: ATOMS.md renders each variant’s own declarations', () => {
  const atomsWithVariants = (Object.keys(atoms) as AtomName[]).filter((name) => {
    const atom: AtomDefinition = atoms[name]
    return Boolean(atom.pseudos ?? atom.media ?? atom.container)
  })

  it('at least one built-in atom declares a variant, so the loop below exercises something', () => {
    expect(atomsWithVariants.length).toBeGreaterThan(0)
  })

  for (const name of atomsWithVariants) {
    it(`${name} shows every variant declaration beside its selector`, () => {
      expect(missingVariantDeclarations(rowFor(name), name)).toEqual([])
    })
  }

  it('a variant-selector-only row (the pre-fix shape) fails this criterion', () => {
    const preFixRow = '| `focusRing` | `nave-focus-ring` | `outline: none;` | `:focus-visible` |'
    expect(missingVariantDeclarations(preFixRow, 'focusRing')).not.toEqual([])
  })
})

describe('renderVariants renders pseudos nested inside a media or container block', () => {
  it('a synthetic atom with a nested media pseudo renders its selector and declarations', () => {
    const synthetic: AtomDefinition = {
      declarations: {},
      media: {
        '(width < 1px)': {
          pseudos: { ':hover': { color: 'red' } },
        },
      },
    }
    const rendered = renderVariants(synthetic)
    expect(rendered).toContain('@media (width < 1px) :hover')
    expect(rendered).toContain('color: red;')
  })
})
