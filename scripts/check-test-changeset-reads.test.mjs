import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * A changeset exists only until the release that consumes it: `changeset version` deletes the file
 * and writes its text into the package's `CHANGELOG.md`. A test that opens a changeset by name
 * passes on the feature branch and fails, by construction, on the version commit, where the file
 * is gone. That has happened three times, each time to a test written after the last fix.
 *
 * `packages/core/test/helpers/released-changeset.ts` is the remedy: its `shippedChangesetProse`
 * reads the pending file while it exists and the changelog entry afterwards. This test sweeps every
 * test under `packages/<name>/test` (a star-slash in a docblock would close it) and every script
 * under `scripts/` for a file that names a changeset and does not import that helper.
 *
 * WHAT IT CAN AND CANNOT SEE. The unit is the FILE: one that names a fragment must import the
 * helper (a static `import` or a dynamic `import()`; `import type` is erased and does not count),
 * but a file that imports it for one fragment and opens another by path passes. A line-level
 * rule would have to tell a read from a write, and the fixtures that write fragments into a scratch
 * copy are not reads. A read that builds its path from a variable, or lists the directory and
 * opens what it finds, names no fragment and is not seen; a directory listing cannot fail with
 * ENOENT, but an assertion that the listing is non-empty can still fail on the version commit.
 * `README.md` and `config.json` are never consumed and are not fragments.
 *
 * Three more limits, each left alone because seeing past comments takes a comment stripper, a
 * larger hazard than the defects. A fragment named only in a comment counts as named, so a file
 * that mentions one must import the helper or not name it. A comment between the two path arguments
 * of `'.changeset', 'name.md'` hides the name. An `import` line inside a block comment counts as
 * an import.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A fragment named by file: `.changeset/<name>.md` in one string, or `'.changeset', '<name>.md'`
 * as two path arguments, the directory with or without a trailing slash. The name may hold dots
 * (`core-0.4.md`) as dot-separated runs of word characters and dashes, so no two parts of the
 * pattern can claim the same character.
 */
const NAMED_FRAGMENT =
  /\.changeset(?:\/|\/?['"`]\s*,\s*['"`])(?!README\.md)[\w-]+(?:\.[\w-]+)*\.md\b/g

/**
 * An import of the helper: a static `import ... from '<path>/released-changeset'` or a dynamic
 * `import('<path>/released-changeset')`, with or without the `.ts`. The last path segment is the
 * helper's own name, so `not-released-changeset.ts` is not it, and `import type` does not count.
 * A static clause runs to its `from` and stops at the next `import` line, so it cannot reach a
 * later import's specifier, and an apostrophe in a comment inside the clause does not end it. Each
 * span ends before the next one begins, so the cost grows with the length of the source.
 */
const HELPER_IMPORT =
  /(?:^import\b(?!\s+type\b)(?:(?!^import\b)[\s\S])*?\bfrom\s*|\bimport\s*\(\s*)['"][^'"\n]*\/released-changeset(?:\.ts)?['"]/m

/**
 * Files that name a fragment without reading the repository's own, each with the reason. A file
 * listed here that stops naming one fails the sweep, so the list cannot go stale.
 */
const FIXTURE_ONLY = new Map([
  [
    'packages/stylelint-config/test/package-shape.test.ts',
    'writes and removes fragments in a scratch copy of the directory',
  ],
  [
    'scripts/check-no-pending-changesets.test.mjs',
    'builds its own scratch directory of invented fragments for the gate it tests',
  ],
])

/**
 * The fragments `source` names by file, in order.
 */
function namedFragments(source) {
  return [...source.matchAll(NAMED_FRAGMENT)].map((match) => match[0])
}

/**
 * Whether `source` imports the helper that reads a fragment or its released entry.
 */
function importsHelper(source) {
  return HELPER_IMPORT.test(source)
}

const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const NOT_SOURCE = new Set(['node_modules', 'dist', 'coverage'])

function sourceFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (NOT_SOURCE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (SOURCE_FILE.test(entry.name)) found.push(full)
  }
  return found
}

function swept() {
  const dirs = [path.join(ROOT, 'scripts')]
  for (const name of readdirSync(path.join(ROOT, 'packages'))) {
    const testDir = path.join(ROOT, 'packages', name, 'test')
    if (existsSync(testDir)) dirs.push(testDir)
  }
  return dirs
    .flatMap(sourceFiles)
    .map((full) => path.relative(ROOT, full).split(path.sep).join('/'))
    .filter((file) => file !== 'scripts/check-test-changeset-reads.test.mjs')
    .map((file) => {
      const source = readFileSync(path.join(ROOT, file), 'utf8')
      return { file, fragments: namedFragments(source), helper: importsHelper(source) }
    })
}

test('control: a named fragment is seen in each spelling a test uses, and README.md and config.json are not', () => {
  assert.deepEqual(namedFragments("read('.changeset/a-b.md')"), ['.changeset/a-b.md'])
  assert.deepEqual(namedFragments("path.join(ROOT, '.changeset', 'a-b.md')"), [
    ".changeset', 'a-b.md",
  ])
  assert.deepEqual(namedFragments('path.resolve(HERE, `../../../.changeset/a.md`)'), [
    '.changeset/a.md',
  ])
  assert.deepEqual(namedFragments("read('.changeset/README.md')"), [])
  assert.deepEqual(namedFragments("read('.changeset/config.json')"), [])
  assert.deepEqual(namedFragments("readdirSync(path.join(ROOT, '.changeset'))"), [])
})

test('control: a name with dots and a directory argument with a trailing slash are seen', () => {
  assert.deepEqual(namedFragments("read('.changeset/core-0.4.md')"), ['.changeset/core-0.4.md'])
  assert.deepEqual(namedFragments("read('.changeset/a.b.c.md')"), ['.changeset/a.b.c.md'])
  assert.deepEqual(namedFragments("path.join(ROOT, '.changeset/', 'x.md')"), [
    ".changeset/', 'x.md",
  ])
  assert.deepEqual(namedFragments('path.join(ROOT, `.changeset/`, `core-0.4.md`)'), [
    '.changeset/`, `core-0.4.md',
  ])
  assert.deepEqual(namedFragments("read('.changeset/README.md')"), [])
  assert.deepEqual(namedFragments("path.join(ROOT, '.changeset/', 'README.md')"), [])
})

test('control: the stated limits hold, so a change to one is a decision', () => {
  assert.deepEqual(namedFragments('// see .changeset/some-fragment.md for history'), [
    '.changeset/some-fragment.md',
  ])
  assert.deepEqual(namedFragments("path.join(ROOT, '.changeset', /* x */ 'x.md')"), [])
  assert.ok(importsHelper("/*\nimport { a } from './helpers/released-changeset.ts'\n*/\n"))
})

test('control: only an import whose own specifier is the helper counts', () => {
  assert.ok(
    importsHelper("import { shippedChangesetProse } from './helpers/released-changeset.ts'\n"),
  )
  assert.ok(
    importsHelper(
      "import {\n  changelogEntries,\n  shippedChangesetProse,\n} from './helpers/released-changeset.ts'\n",
    ),
  )
  assert.ok(importsHelper("import { a } from './helpers/released-changeset'\n"))
  assert.ok(!importsHelper("import { a } from './a.ts'\n// released-changeset\n"))
  assert.ok(!importsHelper("import { a } from './a.ts'\nimport { b } from './b.ts'\n"))
  assert.ok(!importsHelper("const x = 'released-changeset'\n"))
})

test('control: a dynamic import of the helper counts, at the start of a line or not', () => {
  assert.ok(
    importsHelper(
      "const { shippedChangesetProse } = await import('./helpers/released-changeset.ts')\n",
    ),
  )
  assert.ok(importsHelper("import('./helpers/released-changeset.ts').then((m) => m.x)\n"))
  assert.ok(importsHelper("  const m = await import( './helpers/released-changeset' )\n"))
  assert.ok(!importsHelper("await import('./helpers/not-released-changeset.ts')\n"))
  assert.ok(!importsHelper("await import('./a.ts')\n// released-changeset\n"))
})

test('control: the specifier ends in the helper itself, and a type-only import does not count', () => {
  assert.ok(!importsHelper("import { x } from './helpers/not-released-changeset.ts'\n"))
  assert.ok(!importsHelper("import { x } from './helpers/released-changeset-extra.ts'\n"))
  assert.ok(
    !importsHelper("import type { ChangelogEntry } from './helpers/released-changeset.ts'\n"),
  )
  assert.ok(
    !importsHelper(
      "import type {\n  ChangelogEntry,\n} from './helpers/released-changeset.ts'\nimport { a } from './a.ts'\n",
    ),
  )
  assert.ok(
    importsHelper(
      "import type { A } from './a.ts'\nimport { shippedChangesetProse } from './helpers/released-changeset.ts'\n",
    ),
  )
})

test('control: an apostrophe in a comment inside the import clause does not end it', () => {
  assert.ok(
    importsHelper(
      "import {\n  // it's the helper\n  shippedChangesetProse,\n} from './helpers/released-changeset.ts'\n",
    ),
  )
  assert.ok(
    importsHelper(
      "import {\n  /* \"quoted\" and it's odd */\n  shippedChangesetProse,\n} from './helpers/released-changeset.ts'\n",
    ),
  )
  assert.ok(!importsHelper("import {\n  // it's\n  a,\n} from './a.ts'\n// released-changeset'\n"))
})

/**
 * Scaling, never a wall-clock budget: a pattern that rescans its input costs about 100 times as
 * much on ten times the text, one that does not about 10 times, and a ratio between two sizes of
 * the same subject holds on a slow runner where a millisecond figure would not. The fastest of
 * three runs is taken, since load only ever adds time, and a pass is retried because a lone stall
 * can push one over the budget where a real rescan fails every pass.
 */
const SMALL = 20_000
const LARGE = 200_000
const RATIO_BUDGET = 30
const ATTEMPTS = 3
const SAMPLE_NS = 2_000_000

function timeRuns(run, input, runs) {
  const start = process.hrtime.bigint()
  for (let i = 0; i < runs; i++) run(input)
  return Number(process.hrtime.bigint() - start)
}

function fastest(run, input, runs) {
  return Math.min(
    timeRuns(run, input, runs),
    timeRuns(run, input, runs),
    timeRuns(run, input, runs),
  )
}

/**
 * How much longer `run` takes on `LARGE` characters than on `SMALL`, both of the shape `make`
 * builds. A fast subject is repeated until one sample is long enough to time, the same number of
 * times at both sizes.
 */
function growth(run, make) {
  const small = make(SMALL)
  const large = make(LARGE)
  run(small)
  const runs = Math.max(1, Math.ceil(SAMPLE_NS / fastest(run, small, 1)))
  return fastest(run, large, runs) / fastest(run, small, runs)
}

function assertLinear(run, make) {
  const ratios = []
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    ratios.push(growth(run, make))
    if (ratios.at(-1) < RATIO_BUDGET) return
  }
  assert.fail(
    `ten times the text cost ${ratios.map((ratio) => ratio.toFixed(1)).join(', ')} times as much`,
  )
}

const SHAPES = {
  'lines of `import x`': (size) => 'import x\n'.repeat(Math.ceil(size / 9)),
  'lines of an import with a backtick': (size) => 'import `\n'.repeat(Math.ceil(size / 8)),
  'imports with no quote, then one long string': (size) =>
    `${'import x\n'.repeat(Math.ceil(size / 18))}'${'a'.repeat(size / 2)}`,
  'imports with a long specifier each': (size) =>
    `import x from '${'a'.repeat(100)}'\n`.repeat(Math.ceil(size / 118)),
}

for (const [shape, make] of Object.entries(SHAPES)) {
  test(`scaling: the helper-import pattern is linear on ${shape}`, () => {
    assertLinear(importsHelper, make)
  })
}

const NAMED_SHAPES = {
  'one long name': (size) => `.changeset/${'a'.repeat(size)}`,
  'a long name of dotted parts': (size) => `.changeset/${'a.'.repeat(size / 2)}`,
  'repeated starts': (size) => '.changeset/a'.repeat(Math.ceil(size / 12)),
  'a quote and a long run of spaces': (size) => `.changeset'${' '.repeat(size)}`,
  'a quote and a run of commas': (size) => `.changeset'${' ,'.repeat(size / 2)}`,
}

for (const [shape, make] of Object.entries(NAMED_SHAPES)) {
  test(`scaling: the fragment-name pattern is linear on ${shape}`, () => {
    assertLinear(namedFragments, make)
  })
}

/**
 * The names of the packages whose `test` directory holds a source file, listed with a recursive
 * `readdirSync` of each directory and none of `swept()`'s own walk.
 */
function packagesWithTests() {
  const packagesDir = path.join(ROOT, 'packages')
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const testDir = path.join(packagesDir, name, 'test')
      return (
        existsSync(testDir) &&
        readdirSync(testDir, { recursive: true }).some(
          (relative) =>
            SOURCE_FILE.test(relative) &&
            relative.split(path.sep).every((segment) => !NOT_SOURCE.has(segment)),
        )
      )
    })
}

test('the sweep reaches every package that has tests, the scripts, and the helper itself', () => {
  const files = swept().map((entry) => entry.file)
  const packages = packagesWithTests()

  assert.ok(packages.includes('core'), 'the listing does not find packages/core/test')
  for (const name of packages) {
    assert.ok(
      files.some((file) => file.startsWith(`packages/${name}/test/`)),
      `no file under packages/${name}/test is swept`,
    )
  }
  assert.ok(files.some((file) => file.startsWith('scripts/')))
  assert.ok(files.includes('packages/core/test/helpers/released-changeset.ts'))
})

test('every file that names a changeset reads it through the helper', () => {
  const offenders = swept()
    .filter((entry) => entry.fragments.length > 0 && !entry.helper)
    .filter((entry) => !FIXTURE_ONLY.has(entry.file))
    .map((entry) => `${entry.file} opens ${[...new Set(entry.fragments)].join(', ')}`)

  assert.deepEqual(
    offenders,
    [],
    'changeset version deletes a changeset, so a test must read it through ' +
      'shippedChangesetProse from packages/core/test/helpers/released-changeset.ts',
  )
})

test('an exempt file still names a fragment, so the list does not go stale', () => {
  const byFile = new Map(swept().map((entry) => [entry.file, entry]))
  for (const file of FIXTURE_ONLY.keys()) {
    assert.ok(byFile.get(file)?.fragments.length > 0, `${file} no longer names a changeset`)
  }
})
