/**
 * Shape and claim checks on `skills/navecss/SKILL.md` and its generator, over what THIS slice
 * ships — the file itself and this slice's own changeset. The shared ACs (01, 02, 03, 04) were
 * already scoped to slice 1's own artifacts in `css-data-shape.test.ts` and to slice 2's when it
 * lands; this file extends the same scans to this slice's own artifacts, mirroring that file's
 * pattern rather than re-deriving it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import type { PackedCoreTarball } from './helpers/pack-core.ts'

import { generate, OUTPUT_PATH } from '../scripts/generate-skill.ts'
import { HASH, scanForBrainReferences, syntheticDatedId } from './helpers/brain-reference-scan.ts'
import { packCoreTarball } from './helpers/pack-core.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '../dist')
const CHANGESET_PATH = path.resolve(HERE, '../../../.changeset/ship-agent-skill-guide.md')
const GENERATOR_SRC = readFileSync(path.resolve(HERE, '../scripts/generate-skill.ts'), 'utf8')

describe('AC-consumer-constraints-31: the guide packs at the documented path', () => {
  let tarball: PackedCoreTarball

  beforeAll(() => {
    tarball = packCoreTarball()
  }, 120_000)

  it('is present in the tarball, with valid frontmatter and no AGENTS.md file anywhere', async () => {
    expect(tarball.files).toContain('package/skills/navecss/SKILL.md')
    const content = tarball.read('package/skills/navecss/SKILL.md')
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)
    expect(frontmatter).not.toBeNull()
    expect(frontmatter![1]).toMatch(/^name: navecss$/m)
    expect(frontmatter![1]).toMatch(/^description: ["']?\S/m)

    expect(tarball.files.some((f) => path.basename(f) === 'AGENTS.md')).toBe(false)
  })

  it('every relative Markdown link resolves to a file inside the tarball', () => {
    const content = tarball.read('package/skills/navecss/SKILL.md')
    const links = [...content.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!)
    const relativeLinks = links.filter((link) => !/^https?:\/\//.test(link))
    expect(relativeLinks.length).toBeGreaterThan(0)
    for (const link of relativeLinks) {
      const resolved = path.posix.normalize(
        path.posix.join('package/skills/navecss', link.split('#')[0]!),
      )
      expect(tarball.files, `link "${link}" resolves to ${resolved}`).toContain(resolved)
    }
  })

  it('is not named by any key of the packed exports map', () => {
    const pkg = JSON.parse(tarball.read('package/package.json')) as {
      exports: Record<string, string | Record<string, string>>
    }
    const targets = Object.values(pkg.exports).flatMap((value) =>
      typeof value === 'string' ? [value] : Object.values(value),
    )
    expect(targets.some((t) => t.includes('skills/'))).toBe(false)
  })
})

describe('AC-consumer-constraints-34: byte ceiling', () => {
  it('the committed guide is at most 32,768 bytes', () => {
    const bytes = Buffer.byteLength(readFileSync(OUTPUT_PATH, 'utf8'), 'utf8')
    expect(bytes).toBeLessThanOrEqual(32_768)
  })

  it('fails on a copy padded one byte past the ceiling', () => {
    const oneByteOver = 'x'.repeat(32_769)
    expect(Buffer.byteLength(oneByteOver, 'utf8')).toBeGreaterThan(32_768)
  })
})

describe('AC-consumer-constraints-03 (scoped to this slice): the guide is build-inert', () => {
  function listFilesRecursive(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? listFilesRecursive(full) : [full]
    })
  }

  it('no built .css or .js file references skills/ or SKILL.md', () => {
    const offenders = listFilesRecursive(DIST)
      .filter((file) => file.endsWith('.css') || file.endsWith('.js'))
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return text.includes('SKILL.md') || text.includes('skills/navecss')
      })
    expect(offenders).toEqual([])
  })
})

describe('AC-consumer-constraints-02 (scoped to this slice): no prose count', () => {
  const COUNT_NEAR_VOCAB =
    /\b(?:[2-9]|[1-9]\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|dozens?)\b[^.]{0,40}\b(?:atoms?|tokens?|custom propert(?:y|ies)|propert(?:y|ies)|rules?)\b/i

  it('the guide and this slice’s changeset carry no numeral or number word near the vocabulary', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf8')).not.toMatch(COUNT_NEAR_VOCAB)
    expect(readFileSync(CHANGESET_PATH, 'utf8')).not.toMatch(COUNT_NEAR_VOCAB)
  })

  it('the scan reports a planted count', () => {
    expect(COUNT_NEAR_VOCAB.test('Nave ships ' + '48' + ' atoms today.')).toBe(true)
    expect(COUNT_NEAR_VOCAB.test('Nave ships ' + 'twenty' + ' tokens today.')).toBe(true)
  })
})

describe('AC-consumer-constraints-04 (scoped to this slice): no brain reference', () => {
  it('SKILL.md carries no tracker, persona, dated-id or brain-path reference', () => {
    scanForBrainReferences(readFileSync(OUTPUT_PATH, 'utf8'), 'SKILL.md')
  })

  it('this slice’s changeset carries none either', () => {
    scanForBrainReferences(readFileSync(CHANGESET_PATH, 'utf8'), 'the changeset')
  })

  it('the scan reports a planted copy carrying a tracker ref, a persona id and a dated id', () => {
    const plantedPersonaId = ['O', 'R', 'C', 'H'].join('')
    const planted = `See ${HASH}1, cleared by ${plantedPersonaId} per ${syntheticDatedId()}.`
    expect(() => scanForBrainReferences(planted, 'planted')).toThrow()
  })
})

describe('AC-consumer-constraints-01 (scoped to this slice): immune to a package-version change', () => {
  it('the generator embeds neither package.json version string', async () => {
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

  it('the generator source never reads package.json to build its output', () => {
    expect(GENERATOR_SRC).not.toMatch(/package\.json/)
  })
})
