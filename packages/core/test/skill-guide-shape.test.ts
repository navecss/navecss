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

/**
 * Whether `firstLineValue` (the text of `frontmatter`'s `description:` field on its own line)
 * is a valid YAML scalar. A value opening with a quote is taken as a YAML quoted scalar (this
 * check does not itself parse quoted-scalar escaping — the generator's own drift test pins its
 * exact bytes). An unquoted (plain) value is valid only if neither it nor any of its block
 * continuation lines (each starting with two literal spaces, YAML's own line-folding shape)
 * contains ": " (colon-space) — the one sequence a plain scalar cannot carry, because YAML
 * parses it as a nested mapping key rather than as more of this value.
 */
function isValidYamlDescriptionValue(frontmatter: string, firstLineValue: string): boolean {
  if (/^['"]/.test(firstLineValue)) return true
  const continuationLines = [...frontmatter.matchAll(/\n {2}(.*)/g)].map((m) => m[1]!)
  const fullValue = [firstLineValue, ...continuationLines].join(' ')
  return !fullValue.includes(': ')
}

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

    const descriptionMatch = /^description: (.*)$/m.exec(frontmatter![1]!)
    expect(descriptionMatch, 'expected a description: field').not.toBeNull()
    expect(isValidYamlDescriptionValue(frontmatter![1]!, descriptionMatch![1]!)).toBe(true)

    expect(tarball.files.some((f) => path.basename(f) === 'AGENTS.md')).toBe(false)
  })

  it('reds on a description shaped like the generator’s own warning: unquoted, containing ": "', () => {
    // A plain (unquoted) YAML scalar cannot contain ": " (colon-space): that sequence starts a
    // nested mapping key rather than continuing this field's own value — the exact shape
    // generate-skill.ts's own comment names, and why its `description` is double-quoted. A
    // check that only probed the first line for a leading quote (the pre-fix shape) would miss
    // this fixture, since a plain scalar's FIRST character is not a quote either way.
    const block = 'name: navecss\ndescription: Reference for Nave: something'
    expect(isValidYamlDescriptionValue(block, 'Reference for Nave: something')).toBe(false)
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
  const BYTE_CEILING = 32_768

  /** The one guard both tests below exercise, so the padded-copy "control" runs through the
   * SAME code path as the real-file check — not a bare `Buffer.byteLength` call that would stay
   * green even if this function's own logic were stubbed to always pass. */
  function exceedsByteCeiling(content: string): boolean {
    return Buffer.byteLength(content, 'utf8') > BYTE_CEILING
  }

  it('the committed guide is at most 32,768 bytes', () => {
    expect(exceedsByteCeiling(readFileSync(OUTPUT_PATH, 'utf8'))).toBe(false)
  })

  it('fails on a copy padded one byte past the ceiling, through the same helper', () => {
    const oneByteOver = 'x'.repeat(BYTE_CEILING + 1)
    expect(exceedsByteCeiling(oneByteOver)).toBe(true)
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
  // `[^.#|]`, never bare `[^.]`: removing SKILL.md's `## Notes` section shortened
  // the gap between the Responsive table's last `width: 100%;` cell and the following
  // `## Custom properties` heading (which itself contains the word "properties") to under 40
  // characters — a false positive across a table cell's own `|` delimiter and into an unrelated
  // heading, never a composed count statement. Excluding `#` and `|` keeps the scan inside one
  // sentence, never across a table row or into a heading.
  const COUNT_NEAR_VOCAB =
    /\b(?:[2-9]|[1-9]\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|dozens?)\b[^.#|]{0,40}\b(?:atoms?|tokens?|custom propert(?:y|ies)|propert(?:y|ies)|rules?)\b/i

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

  it('the scan reports a planted copy carrying only an AC id, with nothing else', () => {
    const planted = 'See AC-consumer-constraints-39 for the requirement.'
    expect(() => scanForBrainReferences(planted, 'planted')).toThrow()
  })

  it('a hex colour inside a code span passes clean; a bare tracker reference beside it still reds', () => {
    // The digits are composed at runtime (HASH + a literal number), never written as a bare
    // hash-digit run in this file's own tracked source: that exact shape is what this
    // repository's own bare-issue-ref guard exists to catch, on any file under packages/core/,
    // this one included.
    const clean = `The token resolves to \`${HASH}123\` in this example.`
    expect(() => scanForBrainReferences(clean, 'planted')).not.toThrow()
    const stillDirty = `See ${HASH}123 for context.`
    expect(() => scanForBrainReferences(stillDirty, 'planted')).toThrow()
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
