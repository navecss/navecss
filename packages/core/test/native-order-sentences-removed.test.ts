/**
 * AC-native-order-migration-removal-01, -02 (its HEAD half), -04 and -07, Tier A: the one-release sentences of the
 * order warnings, the module that held them and everything that existed only for them are gone,
 * and nothing points at them. The names searched for are assembled from fragments, so that this
 * file is not itself a line the repository-wide search would find.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ORDER_INSTANCES, SHAPE_INSTANCES } from './helpers/worked-instances.ts'

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(PACKAGE, '../..')
const SOURCE = path.join(PACKAGE, 'src')

/**
 * The names joined from their fragments.
 */
function named(...fragments: readonly string[]): string {
  return fragments.join('')
}

const SENTENCE_NAMES = [
  named('Before @navecss', '/core'),
  named('MIGRATION', '_VERSION'),
  named('overrider', 'Sentence'),
  named('wrappedSpecificity', 'Sentence'),
  named('wrappedPseudoElement', 'Sentence'),
  named('migration', 'Sentence'),
  named('isWrapped', 'Before'),
  named('hasOwn', 'Nested'),
  named('nested', 'Sentence'),
]

const DOCBLOCK_WORDS = new RegExp(
  [
    named('previous', ' release'),
    named('before', ' this release'),
    named('used to be', ' placed'),
    named('first', ' minor'),
    named('256384', 'a7'),
    named(String.raw`(?<![\d.])0`, String.raw`\.5\.0(?![\d.])`),
  ].join('|'),
  'i',
)

/**
 * The members of the object type of the `parts` parameter, as written in `shapes`.
 */
function partsTypeOf(shapes: string): string {
  return /\bparts: \{([^}]*)\}/.exec(shapes)?.[1] ?? ''
}

/**
 * The body of `pseudoElementText` in `shapes`, up to the closing brace at the start of a line.
 */
function pseudoElementBody(shapes: string): string {
  const start = shapes.indexOf('function pseudoElementText')
  return shapes.slice(start, shapes.indexOf('\n}\n', start))
}

/**
 * The relative path of every file under `src`.
 */
function sourceFiles(): string[] {
  return readdirSync(SOURCE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(SOURCE, path.join(entry.parentPath, entry.name)))
}

/**
 * The lines of a file under `src`.
 */
function linesOf(file: string): string[] {
  return readFileSync(path.join(SOURCE, file), 'utf8').split('\n')
}

/**
 * The files under `src` with a line that holds one of `needles`.
 */
function filesHolding(needles: readonly string[]): string[] {
  return sourceFiles().filter((file) => {
    const text = readFileSync(path.join(SOURCE, file), 'utf8')
    return needles.some((needle) => text.includes(needle))
  })
}

/**
 * The lines `git grep -F` finds for `needles` over every tracked file, as `path:line:text`.
 */
function trackedLinesHolding(needles: readonly string[]): string[] {
  try {
    return execFileSync(
      'git',
      ['grep', '-n', '-F', ...needles.flatMap((needle) => ['-e', needle])],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
      .split('\n')
      .filter((line) => line !== '')
  } catch (error) {
    if ((error as { status?: number }).status === 1) return []
    throw error
  }
}

describe('AC-native-order-migration-removal-01 — the source holds no module, no sentence and nothing that only fed one', () => {
  it('has no file for the module', () => {
    const module = path.join(SOURCE, 'directive', named('migration', '.ts'))

    expect(existsSync(module)).toBe(false)
  })

  it.each(SENTENCE_NAMES)('no file under src holds %s', (name) => {
    expect(filesHolding([name])).toEqual([])
  })

  it('no docblock under src speaks of an earlier release, a first minor or 0.5.0', () => {
    const lines = sourceFiles().flatMap((file) =>
      linesOf(file)
        .filter((line) => DOCBLOCK_WORDS.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    )

    expect(lines).toEqual([])
  })

  it('NestedFact has no block member, and the run facts take no sentence', () => {
    const state = readFileSync(path.join(SOURCE, 'directive/rule-state.ts'), 'utf8')
    const emit = readFileSync(path.join(SOURCE, 'directive/rule-emit.ts'), 'utf8')
    const shapes = readFileSync(path.join(SOURCE, 'directive/shape-warnings.ts'), 'utf8')
    const nestedFact = /export interface NestedFact \{([^}]*)\}/.exec(state)?.[1]

    expect(nestedFact).toBeDefined()
    expect(nestedFact).not.toMatch(/\bblock\b/)
    expect(emit).not.toMatch(/\bblock: \{ atom/)
    expect(partsTypeOf(shapes)).not.toMatch(/\bsentence\b/)
    expect(pseudoElementBody(shapes)).not.toMatch(/\b(?:const|let) sentence\b/)
  })

  it('control: the search finds each name and each docblock word where one is planted', () => {
    for (const name of SENTENCE_NAMES) expect(`x ${name} y`.includes(name)).toBe(true)
    const docblock =
      '/** the first sentence */\nfunction followsText(r, parts: { atoms: string }) {}'
    expect(partsTypeOf(docblock)).not.toMatch(/\bsentence\b/)
    expect(partsTypeOf('parts: { sentence: string }')).toMatch(/\bsentence\b/)
    expect(pseudoElementBody('function pseudoElementText() {\n  const sentence = 1\n}\n')).toMatch(
      /\b(?:const|let) sentence\b/,
    )
    expect(sourceFiles()).toContain(path.join('directive', 'order-text.ts'))
    expect(filesHolding(['focusClauseOf'])).toContain(path.join('directive', 'order-text.ts'))
    expect(DOCBLOCK_WORDS.test('it ships in the first minor')).toBe(true)
    expect(DOCBLOCK_WORDS.test('since 0.5.0')).toBe(true)
    expect(DOCBLOCK_WORDS.test('since 10.5.0')).toBe(false)
    expect(DOCBLOCK_WORDS.test('First Minor')).toBe(true)
    expect(DOCBLOCK_WORDS.test('the next one')).toBe(false)
  })
})

describe('AC-native-order-migration-removal-02 — the worked instances name no earlier release', () => {
  it('holds the 14 instances, and no line of them opens a sentence about an earlier release', () => {
    const instances = [...ORDER_INSTANCES, ...SHAPE_INSTANCES]
    const lines = instances.flatMap((instance) => instance.lines)

    expect(instances.length).toBeGreaterThanOrEqual(14)
    expect(lines.length).toBeGreaterThanOrEqual(14)
    expect(lines.filter((line) => /before @navecss\/core/i.test(line))).toEqual([])
  })
})

describe('AC-native-order-migration-removal-04 — the first-minor instruments are gone, and nothing points at them', () => {
  const RETIRED = [
    ['test', named('migration', '-version.test.ts')],
    ['test/fixtures', named('migration', '-old-placement.ts')],
    ['scripts', named('generate-migration', '-old-placement.ts')],
    ['test', named('native-order-', 'migration.test.ts')],
    ['test/helpers', named('migration', '-rows.ts')],
    ['test/browser', named('native-order-', 'migration.browser.test.ts')],
  ] as const

  it.each(RETIRED)('%s holds no %s', (directory, file) => {
    expect(existsSync(path.join(PACKAGE, directory, file))).toBe(false)
  })

  it('package.json has no script that generates the retired fixture', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(Object.keys(scripts).filter((name) => name.includes('migration'))).toEqual([])
  })

  it('only ADR 0011 names them, in decision 6 and in its correction', () => {
    const lines = trackedLinesHolding([
      named('migration', '-old-placement'),
      named('MIGRATION', '_ROWS'),
      named('Migration', 'Row'),
      named('OLD', '_PLACEMENT'),
      named('migration', '-rows'),
      named('directive/', 'migration'),
    ])
    const files = [...new Set(lines.map((line) => line.split(':', 1)[0]!))]

    expect(files).toEqual(['docs/04-adr/0011-nave-expands-in-native-apply-order.md'])
    expect(lines).toHaveLength(2)
  })

  it('no browser test, helper or script holds a field or helper only the retired files used', () => {
    const needles = [named('text', 'Was'), named('ELEMENT', '_COLOR'), named('OLD', '_ROWS')]
    const directories = ['test/browser', 'test/helpers', 'scripts']
    const holding = trackedLinesHolding(needles)
      .map((line) => line.split(':', 1)[0]!)
      .filter((file) =>
        directories.some((directory) => file.startsWith(`packages/core/${directory}/`)),
      )

    expect(holding).toEqual([])
  })
})

describe('AC-native-order-migration-removal-07 — no permanent name says migration for this work', () => {
  it('the only path of the package that names a migration is the unrelated plugin test', () => {
    const paths = execFileSync('git', ['ls-files', 'packages/core'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((file) => file.includes('migration'))

    expect(paths).toEqual(['packages/core/test/vite-plugin-migration.test.ts'])
  })

  it('the outcome files exist and cite their own criteria, not the retired comparison', () => {
    const files = [
      'test/browser/native-order-outcomes.browser.test.ts',
      'test/helpers/native-order-outcome-rows.ts',
      'test/native-order-outcome-rows.test.ts',
    ]
    const texts = files.map((file) => readFileSync(path.join(PACKAGE, file), 'utf8'))

    for (const text of texts) expect(text).not.toContain('AC-native-apply-order-33')
    expect(texts[0]).toContain('AC-native-order-migration-removal-05')
    expect(texts[2]).toContain('AC-native-order-migration-removal-06')
    expect(texts[1]).toContain('export const OUTCOME_ROWS')
  })
})
