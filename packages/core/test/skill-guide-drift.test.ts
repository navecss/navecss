/**
 * `skills/navecss/SKILL.md` is generated (`scripts/generate-skill.ts`) and committed. This test
 * regenerates it in memory and diffs against the committed file, so an `atoms.ts` edit that is
 * not accompanied by regenerating the guide reds here rather than shipping a stale reference
 * (the same shape `atoms-doc-drift.test.ts` and `css-data-drift.test.ts` already guard).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import type { AtomDefinition, AtomName } from '../src/atoms.ts'

import { readSections } from '../scripts/generate-atoms-doc.ts'
import { generate, OUTPUT_PATH, readDeclaredPropertyNames } from '../scripts/generate-skill.ts'
import { atoms } from '../src/atoms.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

/**
 * The part of `scripts/readme-sections.mjs` this test reads, typed because the module is plain JavaScript.
 */
interface ReadmeSections {
  bodyOf: (lines: string[], range: SectionRange) => string
  headingLines: (lines: string[]) => Set<number>
  readReadme: () => string
  sectionRange: (
    lines: string[],
    headings: Set<number>,
    headingPattern: RegExp,
    depth: number,
  ) => SectionRange
}

interface SectionRange {
  end: number
  start: number
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ATOMS_SRC_PATH = path.resolve(HERE, '../src/atoms.ts')

/**
 * The markdown table row that names atom `name`.
 */
function rowFor(markdown: string, name: string): string {
  const row = markdown.split('\n').find((line) => new RegExp(`^\\| \`${name}\` +\\|`).test(line))
  if (row === undefined) throw new Error(`no row found for atom "${name}"`)
  return row
}

describe('AC-consumer-constraints-32: SKILL.md stays in sync with src/atoms.ts', () => {
  // The real generator run (a full @navecss/tokens build under the hood) takes the better part
  // of a second on a quiet machine and comfortably longer under load — well past vitest's 5s
  // default if it ran once per `it()`. Run it once, in `beforeAll`, with an explicit timeout
  // room to spare, and assert on the already-produced string in the `it()` below (the same
  // shape `css-data-shape.test.ts` and `skill-guide-shape.test.ts` use for their own real build).
  let generated: string

  beforeAll(async () => {
    generated = await generate()
  }, 120_000)

  it('the committed file matches what the generator produces', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    expect(committed).toBe(generated)
  })

  it('fails after one atom declaration in atoms.ts is edited on disk without regenerating — a real file mutation flowing through the real drift comparison, not an in-memory object that differs by construction', async () => {
    // The pre-fix control built a plain object literal carrying a string ('PLANTED-EDIT') that
    // could not possibly already be in the committed guide, so the two sides differed by
    // construction — it never reproduced "someone edited atoms.ts and forgot to regenerate".
    // This mutates the real FILE TEXT and imports the result, so the mutated
    // value flows through the same `atoms` shape a real contributor's edit would produce.
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const realSource = readFileSync(ATOMS_SRC_PATH, 'utf8')
    const mutatedSource = realSource.replace(
      "declarations: { display: 'flex' }",
      "declarations: { display: 'planted-mutation' }",
    )
    expect(mutatedSource, 'the mutation target text was not found in atoms.ts').not.toBe(realSource)

    const dir = mkdtempSync(path.join(HERE, '.atoms-mutation-'))
    try {
      const file = path.join(dir, 'atoms.ts')
      writeFileSync(file, mutatedSource)
      const mutatedModule = (await import(pathToFileURL(file).href)) as {
        atoms: Record<string, AtomDefinition>
      }
      const mutated = await generate(baseSkillGuideSources({ atomTable: mutatedModule.atoms }))
      expect(mutated).not.toBe(committed)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the set of atom names it renders equals the key set of atoms, under the same headings and order as ATOMS.md', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const atomsSection = committed.slice(
      committed.indexOf('## Atoms'),
      committed.indexOf('## Custom properties'),
    )
    const headings = atomsSection
      .matchAll(/^### (.+)$/gm)
      .map((m) => m[1]!)
      .toArray()
    const names = atomsSection
      .matchAll(/^\| `([a-zA-Z0-9]+)` +\|/gm)
      .map((m) => m[1]!)
      .toArray()
    expect(new Set(names)).toEqual(new Set(Object.keys(atoms)))
    expect(headings).toEqual(readSections().keys().toArray())
  })

  it('each atom entry is identical in content to that atom row in the regenerated ATOMS.md', async () => {
    const atomsDoc = await import('../scripts/generate-atoms-doc.ts')
    const atomsMd = await atomsDoc.generate()
    const committed = readFileSync(OUTPUT_PATH, 'utf8')

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
    const names = section
      .matchAll(/^- `(--nave-[\w-]+)`/gm)
      .map((m) => m[1]!)
      .toArray()
    expect(new Set(names)).toEqual(new Set(readDeclaredPropertyNames()))
    // no primitive
    expect(names.every((n) => !n.includes('_'))).toBe(true)
  })

  it('the layer order it renders equals the @layer statement in @navecss/core/layers, and names components.consumer as where consumer CSS goes', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const layersSrc = readFileSync(path.resolve(HERE, '../src/layers.css'), 'utf8')
    const real = /^@layer [^;]+;/m.exec(layersSrc)![0]
    expect(committed).toContain(real)
    expect(committed).toContain('`@layer components.consumer`')
  })

  it('contains no rung of the root README customization ladder', async () => {
    const { readReadme, headingLines, sectionRange, bodyOf } = (await import(
      path.resolve(HERE, '../../../scripts/readme-sections.mjs')
    )) as ReadmeSections
    const readme = readReadme()
    const lines = readme.split('\n')
    const headings = headingLines(lines)
    const themingRange = sectionRange(lines, headings, /^## Theming\b/, 2)
    const ladder = bodyOf(lines, themingRange)
    const rungHeadings = ladder
      .matchAll(/^### (Rung .+)$/gm)
      .map((m) => m[1]!)
      .toArray()
    expect(rungHeadings.length).toBeGreaterThan(0)

    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    for (const rung of rungHeadings) {
      expect(committed, `contains ladder rung heading "${rung}"`).not.toContain(rung)
    }
  })

  it('points at where theming is documented in one sentence, with a link carrying no package version', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const themingLinks = committed.matchAll(/\[Theming\]\(([^)]+)\)/g).toArray()
    expect(themingLinks).toHaveLength(1)
    expect(themingLinks[0]![1]).not.toMatch(/@navecss\/(core|tokens)@|\/v\d/)
  })
})
