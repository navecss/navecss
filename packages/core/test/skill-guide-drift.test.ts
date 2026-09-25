/**
 * `skills/navecss/SKILL.md` is generated (`scripts/generate-skill.ts`) and committed. This test
 * regenerates it in memory and diffs against the committed file, so an `atoms.ts` edit that is
 * not accompanied by regenerating the guide reds here rather than shipping a stale reference
 * (the same shape `atoms-doc-drift.test.ts` and `css-data-drift.test.ts` already guard).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { AtomDefinition, AtomName } from '../src/atoms.ts'

import { readSections } from '../scripts/generate-atoms-doc.ts'
import {
  generate,
  OUTPUT_PATH,
  readDeclaredPropertyNames,
  readTokenDescriptions,
} from '../scripts/generate-skill.ts'
import { atoms } from '../src/atoms.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('AC-consumer-constraints-32: SKILL.md stays in sync with src/atoms.ts', () => {
  it('the committed file matches what the generator produces', async () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    expect(committed).toBe(await generate())
  })

  it('fails after one atom declaration in atoms.ts is edited without regenerating', async () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const sections = readSections()
    const mutatedAtoms: Record<string, AtomDefinition> = {
      ...atoms,
      flex: { declarations: { display: 'PLANTED-EDIT' } },
    }
    const mutated = await generate({
      sections,
      atomTable: mutatedAtoms,
      tokenDescriptions: readTokenDescriptions(),
      declaredPropertyNames: readDeclaredPropertyNames(),
      paletteDescriptions: new Map(),
      layerStatement:
        '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;',
    })
    expect(mutated).not.toBe(committed)
  })

  it('the set of atom names it renders equals the key set of atoms, under the same headings and order as ATOMS.md', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const atomsSection = committed.slice(
      committed.indexOf('## Atoms'),
      committed.indexOf('## Notes'),
    )
    const headings = [...atomsSection.matchAll(/^### (.+)$/gm)].map((m) => m[1]!)
    const names = [...atomsSection.matchAll(/^\| `([a-zA-Z0-9]+)` +\|/gm)].map((m) => m[1]!)
    expect(new Set(names)).toEqual(new Set(Object.keys(atoms)))
    expect(headings).toEqual([...readSections().keys()])
  })

  it('each atom entry is identical in content to that atom row in the regenerated ATOMS.md', async () => {
    const atomsDoc = await import('../scripts/generate-atoms-doc.ts')
    const atomsMd = await atomsDoc.generate()
    const committed = readFileSync(OUTPUT_PATH, 'utf8')

    function rowFor(markdown: string, name: string): string {
      const row = markdown
        .split('\n')
        .find((line) => new RegExp(`^\\| \`${name}\` +\\|`).test(line))
      if (row === undefined) throw new Error(`no row found for atom "${name}"`)
      return row
    }

    let checked = 0
    for (const name of Object.keys(atoms) as AtomName[]) {
      // ATOMS.md row shape: | name | class | declarations | variants |
      const atomsDocCells = rowFor(atomsMd, name)
        .split('|')
        .map((c) => c.trim())
      // SKILL.md row shape: | name | declarations | variants |
      const skillCells = rowFor(committed, name)
        .split('|')
        .map((c) => c.trim())
      expect(skillCells[2], `${name} declarations`).toBe(atomsDocCells[3])
      expect(skillCells[3], `${name} variants`).toBe(atomsDocCells[4])
      checked += 1
    }
    expect(checked).toBe(Object.keys(atoms).length)
  })

  it('the set of --nave-* names it renders equals the set of custom properties in the @navecss/tokens/css build output', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const section = committed.slice(
      committed.indexOf('## Custom properties'),
      committed.indexOf('## Layers'),
    )
    const names = [...section.matchAll(/^- `(--nave-[\w-]+)`/gm)].map((m) => m[1]!)
    expect(new Set(names)).toEqual(new Set(readDeclaredPropertyNames()))
    // no primitive
    expect(names.every((n) => !n.includes('_'))).toBe(true)
  })

  it('the layer order it renders equals the @layer statement in @navecss/core/layers, and names components.consumer as where consumer CSS goes', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const layersSrc = readFileSync(path.resolve(HERE, '../src/layers.css'), 'utf8')
    const real = /^@layer\s+[^;]+;/m.exec(layersSrc)![0]
    expect(committed).toContain(real)
    expect(committed).toContain('`@layer components.consumer`')
  })

  it('contains no rung of the root README customization ladder', async () => {
    const { readReadme, headingLines, sectionRange, bodyOf } = await import(
      path.resolve(HERE, '../../../scripts/readme-sections.mjs')
    )
    const readme = readReadme()
    const lines = readme.split('\n')
    const headings = headingLines(lines)
    const themingRange = sectionRange(lines, headings, /^## Theming\b/, 2)
    const ladder = bodyOf(lines, themingRange)
    const rungHeadings = [...ladder.matchAll(/^### (Rung .+)$/gm)].map((m) => m[1]!)
    expect(rungHeadings.length).toBeGreaterThan(0)

    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    for (const rung of rungHeadings) {
      expect(committed, `contains ladder rung heading "${rung}"`).not.toContain(rung)
    }
  })

  it('points at where theming is documented in one sentence, with a link carrying no package version', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const themingLinks = [...committed.matchAll(/\[Theming\]\(([^)]+)\)/g)]
    expect(themingLinks).toHaveLength(1)
    expect(themingLinks[0]![1]).not.toMatch(/@navecss\/(core|tokens)@|\/v\d/)
  })
})
