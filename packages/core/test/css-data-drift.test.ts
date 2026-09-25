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

import { atoms } from '../src/atoms.ts'
import { generate, listedAtomNames, OUTPUT_PATH } from '../scripts/generate-css-data.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('AC-consumer-constraints-07: nave.css-data.json stays in sync with src/atoms.ts', () => {
  it('the committed file matches what the generator produces', async () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    expect(committed).toBe(await generate())
  })

  it('the atom names it lists equal the live key set of atoms, read at test time', () => {
    expect(new Set(listedAtomNames())).toEqual(new Set(Object.keys(atoms)))
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

  // Structural rather than a scratch-copy dual run: `generate()` never reads either package.json,
  // only `src/atoms.ts` (via `readSections`), so its output cannot vary with a package version by
  // construction. Grepping the generator's own imports is what makes that claim checkable rather
  // than asserted.
  it('imports nothing from package.json to build its output', () => {
    const src = readFileSync(path.resolve(HERE, '../scripts/generate-css-data.ts'), 'utf8')
    expect(src).not.toMatch(/package\.json/)
  })
})
