/**
 * `nave.css-data.json` is generated (`scripts/generate-css-data.ts`) and committed. This test
 * regenerates it in memory and diffs against the committed file, so an `atoms.ts` edit that is
 * not accompanied by regenerating the file reds here rather than shipping a stale editor
 * description (`atoms-doc-drift.test.ts`'s sibling check for `ATOMS.md`).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { readSections } from '../scripts/generate-atoms-doc.ts'
import { generate, OUTPUT_PATH } from '../scripts/generate-css-data.ts'
import { atoms } from '../src/atoms.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

interface CommittedCssData {
  atDirectives: Array<{ description: { value: string } }>
}

describe('AC-consumer-constraints-07: nave.css-data.json stays in sync with src/atoms.ts', () => {
  it('the committed file matches what the generator produces', async () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    expect(committed).toBe(await generate())
  })

  it('the atom names and section order the rendered description lists equal the live atoms, read at test time', () => {
    // Parses the RENDERED description text back into a section → names map, rather than calling
    // the generator's own internal section walk a second time: the earlier version of this test
    // called the same `readSections()` the renderer itself consumes, so a renderer bug (a
    // dropped section, a broken join) could pass here while the shipped description was wrong.
    const committed = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as CommittedCssData
    const value = committed.atDirectives[0]!.description.value
    const listItems = [...value.matchAll(/^- \*\*(.+):\*\* (.+)$/gm)]
    const sections = listItems.map((match) => match[1]!)
    const names = listItems.flatMap((match) =>
      [...match[2]!.matchAll(/`([^`]+)`/g)].map((codeSpan) => codeSpan[1]!),
    )
    expect(new Set(names)).toEqual(new Set(Object.keys(atoms)))
    expect(sections).toEqual([...readSections().keys()])
  })
})

describe('AC-consumer-constraints-01: immune to a package-version change', () => {
  it('embeds neither package.json version string', async () => {
    const output = await generate()
    const corePkg = JSON.parse(readFileSync(path.resolve(HERE, '../package.json'), 'utf8')) as {
      version: string
    }
    const tokensPkg = JSON.parse(
      readFileSync(path.resolve(HERE, '../../tokens/package.json'), 'utf8'),
    ) as { version: string }
    expect(output).not.toContain(corePkg.version)
    expect(output).not.toContain(tokensPkg.version)
  })

  const cssDataSrc = readFileSync(path.resolve(HERE, '../scripts/generate-css-data.ts'), 'utf8')
  const atomsDocSrc = readFileSync(path.resolve(HERE, '../scripts/generate-atoms-doc.ts'), 'utf8')

  /**
   * The `label`s of every source in `sources` whose `text` mentions `package.json`. A real scan
   * function, not a bare regex match on a string literal: calling it is what makes "the widened
   * scan catches the plant" a claim about the scan's own behaviour rather than a fact about the
   * plant string being true by construction.
   */
  function sourcesMentioningPackageJson(sources: Array<{ label: string; text: string }>): string[] {
    return sources
      .filter((source) => /package\.json/.test(source.text))
      .map((source) => source.label)
  }

  // Structural rather than a scratch-copy dual run: `generate()` never reads either package.json,
  // only `src/atoms.ts` (via `readSections`, itself defined in `generate-atoms-doc.ts`), so its
  // output cannot vary with a package version by construction. Scanning BOTH generators' own
  // sources is what makes that claim checkable rather than asserted — scanning only
  // `generate-css-data.ts` proves it for one file, not for the transitive graph the claim is
  // actually about.
  it('neither generator imports from package.json to build its output', () => {
    expect(
      sourcesMentioningPackageJson([
        { label: 'generate-css-data.ts', text: cssDataSrc },
        { label: 'generate-atoms-doc.ts', text: atomsDocSrc },
      ]),
    ).toEqual([])
  })

  it('the widened scan catches a package.json read planted in generate-atoms-doc.ts, which a single-file scan would miss', () => {
    const plantedAtomsDocSrc = `${atomsDocSrc}\nreadFileSync(path.resolve(HERE, '../package.json'), 'utf8')\n`

    // A scan reading only generate-css-data.ts's own source never sees the plant at all.
    expect(
      sourcesMentioningPackageJson([{ label: 'generate-css-data.ts', text: cssDataSrc }]),
    ).toEqual([])

    // The widened scan, given both sources, catches it and names which one.
    expect(
      sourcesMentioningPackageJson([
        { label: 'generate-css-data.ts', text: cssDataSrc },
        { label: 'generate-atoms-doc.ts', text: plantedAtomsDocSrc },
      ]),
    ).toEqual(['generate-atoms-doc.ts'])
  })
})
