/**
 * Shape and claim checks on `nave.css-data.json` and its generator, over what THIS slice ships:
 * the file itself and this slice's own changeset. The shared ACs (02, 04, 09) also name the
 * generated agent guide and the stylelint-config package's surfaces; those do not exist yet
 * (later slices land each in its own pull request per R4/R25), so their own slices extend these
 * scans to their own artifacts when they land — nothing here claims to cover a file that is not
 * yet part of the tree.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import type { PackedCoreTarball } from './helpers/pack-core.ts'

import { HASH, scanForBrainReferences, syntheticDatedId } from './helpers/brain-reference-scan.ts'
import { exportTargets, packCoreTarball } from './helpers/pack-core.ts'
import { shippedChangesetProse } from './helpers/released-changeset.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/**
 * This slice's changeset while pending, the CHANGELOG entry that carries its text once released.
 */
const shippedChangeset = (): string =>
  shippedChangesetProse(
    path.resolve(HERE, '../../../.changeset/ship-editor-custom-data.md'),
    path.resolve(HERE, '../CHANGELOG.md'),
    'Ships `nave.css-data.json`',
  )
const GENERATOR_SRC = readFileSync(path.resolve(HERE, '../scripts/generate-css-data.ts'), 'utf8')
const ATOMS_DOC_SRC = readFileSync(path.resolve(HERE, '../scripts/generate-atoms-doc.ts'), 'utf8')

interface CssCustomData {
  version: number
  atDirectives?: {
    description?: { kind: string; value: string }
    name: string
    references?: unknown
  }[]
}

function readCommittedCssData(): CssCustomData {
  return JSON.parse(
    readFileSync(path.resolve(HERE, '../nave.css-data.json'), 'utf8'),
  ) as CssCustomData
}

/**
 * Every module specifier `src` imports, static or dynamic, single- or double-quoted: covers
 * `from '...'`, `from "..."`, `import('...')` and `import("...")`. The prior regex
 * (`/from '([^']+)'/g`) matched only single-quoted static imports, so a double-quoted static
 * import or a dynamic `import(...)` of a disallowed package would pass unseen.
 */
function importSpecifiers(src: string): string[] {
  return src
    .matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g)
    .map((m) => m[2]!)
    .toArray()
}

describe('AC-consumer-constraints-06: the packed tarball ships the file at the package root only', () => {
  // Packing and extracting is one real `npm pack` plus two `tar` spawns; every test in this
  // describe wants the SAME tarball, so it is packed once here rather than once per `it()`
  // (which is what pushed `ci:check` past vitest's 5s default under load).
  let tarball: PackedCoreTarball

  beforeAll(() => {
    tarball = packCoreTarball()
  }, 120_000)

  it('lists package/nave.css-data.json, and it parses declaring @nave', () => {
    expect(tarball.files).toContain('package/nave.css-data.json')
    expect(
      tarball.files.some(
        (f) => f !== 'package/nave.css-data.json' && f.endsWith('nave.css-data.json'),
      ),
    ).toBe(false)

    const parsed = JSON.parse(tarball.read('package/nave.css-data.json')) as CssCustomData
    expect(parsed.version).toBe(1.1)
    expect(parsed.atDirectives?.[0]?.name).toBe('@nave')
  })

  it('is not named by any key of the packed exports map', () => {
    const pkg = JSON.parse(tarball.read('package/package.json')) as {
      exports: Record<string, unknown>
    }
    const targets = exportTargets(pkg.exports)
    expect(targets.some((t) => t.includes('nave.css-data.json'))).toBe(false)
    expect(targets.some((t) => t.includes('skills/'))).toBe(false)
  })
})

function entry(): NonNullable<CssCustomData['atDirectives']>[number] {
  return readCommittedCssData().atDirectives![0]!
}

describe('AC-consumer-constraints-08: the @nave entry claims only what it delivers', () => {
  it('has no references entry', () => {
    const value = entry().references
    expect(
      value === undefined || (Array.isArray(value) && value.length === 0),
      `references was: ${JSON.stringify(value)}`,
    ).toBe(true)
  })

  it('contains no URL', () => {
    expect(entry().description!.value).not.toMatch(/https?:\/\//)
  })

  it('lists no atom declaration in property: value form', () => {
    // A declaration line always ends `;` right after the value (renderDeclarations' own
    // shape in generate-atoms-doc.ts); the description never emits that shape.
    expect(entry().description!.value).not.toMatch(/[a-z-]+:\s*[^:]+;/)
  })

  it('mentions extend exactly once, saying extend-registered atoms are valid and unlisted', () => {
    const matches = entry()
      .description!.value.split('\n')
      .filter((line) => line.includes('extend'))
    expect(matches).toHaveLength(1)
    expect(matches[0]).toContain('valid')
    expect(matches[0]).toContain('not listed')
  })

  it('the generator imports no third-party CSS/browser data package', () => {
    const specifiers = importSpecifiers(GENERATOR_SRC)
    const allowed = new Set([
      '../src/atoms.ts',
      './generate-atoms-doc.ts',
      'node:fs',
      'node:path',
      'node:url',
      'prettier',
    ])
    for (const specifier of specifiers) {
      expect(allowed.has(specifier), `unexpected import: ${specifier}`).toBe(true)
    }
    expect(GENERATOR_SRC).not.toMatch(/mdn-data|@vscode\/web-custom-data|@mdn\/browser-compat-data/)
  })

  it('importSpecifiers catches both quote styles and a dynamic import', () => {
    const planted = `import x from "mdn-data"\nawait import('evil-pkg')\n`
    expect(importSpecifiers(planted)).toEqual(['mdn-data', 'evil-pkg'])
  })
})

function sentencesNaming(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /nave\.css-data\.json|css\.customData|custom data|data file/i.test(s))
}

describe('AC-consumer-constraints-09: no README/changeset sentence overclaims completion', () => {
  it('no sentence naming the file or css.customData claims completion or IntelliSense', () => {
    for (const sentence of sentencesNaming(shippedChangeset())) {
      expect(sentence, `changeset: "${sentence}"`).not.toMatch(/complet/i)
      expect(sentence, `changeset: "${sentence}"`).not.toMatch(/IntelliSense/i)
    }
  })

  it('the check reports a planted overclaiming sentence', () => {
    const planted = ['The data file', 'autocompletes', 'atom names in VS Code.'].join(' ')
    expect(sentencesNaming(planted).some((s) => /complet/i.test(s))).toBe(true)
  })
})

describe('AC-consumer-constraints-02 (scoped to this slice): no prose count', () => {
  const COUNT_NEAR_VOCAB =
    /\b(?:[2-9]|[1-9]\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|dozens?)\b[^.]{0,40}\b(?:atoms?|tokens?|custom propert(?:y|ies)|propert(?:y|ies)|rules?)\b/i

  it('the description and this slice’s changeset carry no numeral or number word near the vocabulary', () => {
    const description = readCommittedCssData().atDirectives![0]!.description!.value
    expect(description).not.toMatch(COUNT_NEAR_VOCAB)
    expect(shippedChangeset()).not.toMatch(COUNT_NEAR_VOCAB)
  })

  it('the scan reports a planted count', () => {
    const planted = ['Nave ships', '48', 'atoms today.'].join(' ')
    expect(COUNT_NEAR_VOCAB.test(planted)).toBe(true)
  })

  it('the scan reports a planted three-digit count', () => {
    const planted = ['Nave ships', '150', 'tokens today.'].join(' ')
    expect(COUNT_NEAR_VOCAB.test(planted)).toBe(true)
  })

  it('the scan reports a planted number word above ten', () => {
    const planted = ['Nave ships', 'twenty', 'atoms today.'].join(' ')
    expect(COUNT_NEAR_VOCAB.test(planted)).toBe(true)
  })

  it('the scan reports a planted number word for a rule count', () => {
    const planted = ['Nave ships', 'eleven', 'rules today.'].join(' ')
    expect(COUNT_NEAR_VOCAB.test(planted)).toBe(true)
  })
})

describe('AC-consumer-constraints-04 (scoped to this slice): no brain reference', () => {
  it('nave.css-data.json carries no tracker, persona, dated-id or brain-path reference', () => {
    expect(() =>
      scanForBrainReferences(JSON.stringify(readCommittedCssData()), 'nave.css-data.json'),
    ).not.toThrow()
  })

  it('this slice’s changeset carries none either', () => {
    expect(() => scanForBrainReferences(shippedChangeset(), 'the changeset')).not.toThrow()
  })

  it('the scan reports a planted copy carrying a tracker ref, a persona id and a dated id', () => {
    const plantedPersonaId = ['O', 'R', 'C', 'H'].join('')
    const planted = `See ${HASH}1, cleared by ${plantedPersonaId} per ${syntheticDatedId()}.`
    expect(() => scanForBrainReferences(planted, 'planted')).toThrow()
  })
})

/**
 * The correct realpath comparison, held as its own constant rather than only inline inside
 * `hasRealpathGuard`, so the reformat-tolerance test below can build its wrapped fixture FROM
 * this string directly instead of `.replace`-ing it out of a live source file: a fixture derived
 * from the real file goes vacuous the moment that file is reformatted for an unrelated reason
 * (the replace target silently stops matching and the row starts asserting nothing).
 */
const CANONICAL_REALPATH_GUARD =
  'realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])'

/**
 * True when `source`, with every run of whitespace collapsed to a single space, contains the
 * correct realpath comparison — tolerant of a lawful reformat (the comparison wrapped across
 * lines), the same tolerance `check-main-guard-spaced-path.test.mjs`'s own `GUARD_PATTERN`
 * already gives the repo-root scripts it sweeps. A byte-exact `toContain` would red a
 * behaviourally-correct file the moment it is reformatted.
 */
function hasRealpathGuard(source: string): boolean {
  return source.replaceAll(/\s+/g, ' ').includes(CANONICAL_REALPATH_GUARD)
}

describe('generate-css-data.ts and generate-atoms-doc.ts guard their file-writing drivers for spaced and symlinked invocation paths', () => {
  it('does not use the broken `file://${process.argv[1]}` template, and does use the realpath comparison', () => {
    for (const src of [GENERATOR_SRC, ATOMS_DOC_SRC]) {
      expect(src).not.toContain('file://${process.argv[1]}')
      expect(hasRealpathGuard(src)).toBe(true)
    }
  })

  it('still passes a lawful reformat that wraps the comparison across two lines', () => {
    const wrapped = CANONICAL_REALPATH_GUARD.replace(' === ', ' ===\n    ')
    expect(wrapped).toContain('\n')
    expect(hasRealpathGuard(wrapped)).toBe(true)
  })

  it('still fails on a copy carrying the old broken template', () => {
    const oldTemplateGuard = [
      'if (import.meta.url === ',
      '`file://${process.argv[1]}`',
      ') {',
    ].join('')
    expect(hasRealpathGuard(oldTemplateGuard)).toBe(false)
  })
})
