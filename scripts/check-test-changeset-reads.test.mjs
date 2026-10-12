import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
 * More limits, each left alone because seeing past comments and strings takes a lexer, a larger
 * hazard than the defects. A fragment named only in a comment counts as named, so a file that
 * mentions one must import the helper or not name it. A comment between the two path arguments of
 * `'.changeset', 'name.md'` hides the name. An `import` line, or an `import()`, inside a comment
 * or a string counts, and so does an `import()` type annotation. `import { type A } from` the
 * helper counts although it reads nothing. A comment inside a helper import's own clause that holds
 * `from` and a quote (`// from 'x'`) ends the clause there, so a file that imports the helper that
 * way is reported and has to word the comment differently.
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
 * `import('<path>/released-changeset')` (a backtick specifier counts there), with or without the
 * `.ts`. The last path segment is the helper's own name, so `not-released-changeset.ts` is not it,
 * `import type` does not count, and neither does `typeof import(...)`. A static clause runs to the
 * first `from` that is followed by a quote, which is its own specifier, and stops at the next
 * `import` line, so text after it that mentions the helper cannot stand in for the import, and an
 * apostrophe in a comment inside the clause does not end it. Each span ends before the next one
 * begins, so the cost grows with the length of the source.
 */
const HELPER_IMPORT =
  /(?:^import\b(?!\s+type\b)(?:(?!^import\b|\bfrom\s*['"])[\s\S])*\bfrom\s*['"]|(?<!\btypeof\s+)\bimport\s*\(\s*['"`])[^'"`\n]*\/released-changeset(?:\.ts)?['"`]/m

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
  const helper = "'./helpers/released-changeset.ts'"

  assert.deepEqual(namedFragments('// see .changeset/some-fragment.md for history'), [
    '.changeset/some-fragment.md',
  ])
  assert.deepEqual(namedFragments("path.join(ROOT, '.changeset', /* x */ 'x.md')"), [])
  assert.ok(importsHelper(`/*\nimport { a } from ${helper}\n*/\n`))
  assert.ok(importsHelper(`import { a } from './a.ts'\n// await import(${helper})\n`))
  assert.ok(importsHelper(`const s = "import(${helper})"\n`))
  assert.ok(importsHelper(`let x: import(${helper}).ChangelogEntry\n`))
  assert.ok(importsHelper(`import { type ChangelogEntry } from ${helper}\n`))
  assert.ok(!importsHelper(`import {\n  // from 'x'\n  shippedChangesetProse,\n} from ${helper}\n`))
})

test('control: a static import of the helper counts, and one of another module does not', () => {
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

test('control: text after the last import cannot stand in for an import of the helper', () => {
  const helper = "'./helpers/released-changeset.ts'"
  const after = (text) => `import { a } from './a.ts'\n${text}\n`

  assert.ok(!importsHelper(after(`const note = "from ${helper}"`)))
  assert.ok(!importsHelper(after(`// from ${helper}`)))
  assert.ok(!importsHelper(after(`/** shippedChangesetProse imported from ${helper} */`)))
  assert.ok(!importsHelper(after(`export { x } from ${helper}`)))
  assert.ok(
    !importsHelper(`import {\n  x,\n} from './a.ts'\nconst y = 1\nconst n = 'from ${helper}'\n`),
  )
  assert.ok(importsHelper(`import { a } from './a.ts'\nimport { b } from ${helper}\n`))
})

test('control: a dynamic import of the helper counts, at the start of a line or not', () => {
  assert.ok(
    importsHelper(
      "const { shippedChangesetProse } = await import('./helpers/released-changeset.ts')\n",
    ),
  )
  assert.ok(importsHelper("import('./helpers/released-changeset.ts').then((m) => m.x)\n"))
  assert.ok(importsHelper("  const m = await import( './helpers/released-changeset' )\n"))
  assert.ok(importsHelper('const m = await import(`./helpers/released-changeset.ts`)\n'))
  assert.ok(!importsHelper("await import('./helpers/not-released-changeset.ts')\n"))
  assert.ok(!importsHelper("await import('./a.ts')\n// released-changeset\n"))
})

test('control: a type position that only names the helper does not count', () => {
  assert.ok(!importsHelper("type H = typeof import('./helpers/released-changeset.ts')\n"))
  assert.ok(!importsHelper("type H = typeof  import('./helpers/released-changeset.ts')\n"))
  assert.ok(!importsHelper('type H = typeof import(`./helpers/released-changeset.ts`)\n'))
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
 * Scaling, never a time budget: a pattern that rescans its input costs about 100 times as much on
 * ten times the text, one that does not about 10 times. The clock is the CPU time the process
 * spends (user plus system), not the wall clock: a busy machine preempts a long sample more than
 * a short one and so inflates a wall-clock ratio, where CPU time stops counting while the process
 * waits for a core. The fastest of three runs is taken, and a pass is retried, because a lone
 * stall can still push one over the budget where a real rescan fails every pass.
 */
const SMALL = 20_000
const LARGE = 200_000
const RATIO_BUDGET = 30
const ATTEMPTS = 3
const SAMPLE_MICROSECONDS = 2000

function cpuMicroseconds() {
  const { user, system } = process.cpuUsage()
  return user + system
}

function timeRuns(run, input, runs) {
  const start = cpuMicroseconds()
  for (let i = 0; i < runs; i++) run(input)
  return cpuMicroseconds() - start
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
  const runs = Math.max(1, Math.ceil(SAMPLE_MICROSECONDS / Math.max(1, fastest(run, small, 1))))
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
 * Every source file git tracks under a package's `test` directory or under `scripts/`, listed by
 * git with the extensions written out here, so that what the sweep skips and which extensions it
 * takes cannot also hide a file from this list.
 */
function trackedSourceFiles() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', 'packages/*/test/**', 'scripts/**'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return listed.split('\0').filter((file) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file))
}

/**
 * Tracked source files the sweep leaves out on purpose, each with the reason: the sweep itself,
 * which names fragments only to test the patterns above.
 */
const NOT_SWEPT = new Map([
  [
    'scripts/check-test-changeset-reads.test.mjs',
    'this file: its controls name invented fragments',
  ],
])

test('the sweep reaches every tracked source file under a package test directory or scripts/, and the helper itself', () => {
  const sweptFiles = new Set(swept().map((entry) => entry.file))
  const tracked = trackedSourceFiles()

  assert.ok(tracked.length > 100, `git lists only ${tracked.length} files`)
  assert.ok(tracked.some((file) => file.startsWith('scripts/')))
  assert.ok(tracked.some((file) => file.startsWith('packages/core/test/')))
  const missed = tracked.filter((file) => !sweptFiles.has(file) && !NOT_SWEPT.has(file))
  assert.deepEqual(missed, [], 'tracked files the sweep does not read')
  assert.ok(sweptFiles.has('packages/core/test/helpers/released-changeset.ts'))
  assert.ok([...sweptFiles].some((file) => file.startsWith('scripts/')))
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
