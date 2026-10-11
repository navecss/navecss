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
 * helper, but a file that imports it for one fragment and opens another by path passes. A line-level
 * rule would have to tell a read from a write, and the fixtures that write fragments into a scratch
 * copy are not reads. A read that builds its path from a variable, or lists the directory and
 * opens what it finds, names no fragment and is not seen; a directory listing cannot fail with
 * ENOENT, but an assertion that the listing is non-empty can still fail on the version commit.
 * `README.md` and `config.json` are never consumed and are not fragments.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A fragment named by file: `.changeset/<name>.md` in one string, or `'.changeset', '<name>.md'`
 * as two path arguments.
 */
const NAMED_FRAGMENT = /\.changeset(?:\/|['"`]\s*,\s*['"`])(?!README\.md)[\w-]+\.md\b/g

/**
 * An import whose specifier is the helper. The import clause holds no quote, so the pattern runs
 * from `import` to that import's own specifier and cannot reach a later one.
 */
const HELPER_IMPORT = /^import\b[^'"]*['"][^'"]*released-changeset(?:\.ts)?['"]/m

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

test('control: only an import whose own specifier is the helper counts', () => {
  assert.ok(
    importsHelper("import { shippedChangesetProse } from './helpers/released-changeset.ts'\n"),
  )
  assert.ok(
    importsHelper(
      "import {\n  changelogEntries,\n  shippedChangesetProse,\n} from './helpers/released-changeset.ts'\n",
    ),
  )
  assert.ok(!importsHelper("import { a } from './a.ts'\n// released-changeset\n"))
  assert.ok(!importsHelper("import { a } from './a.ts'\nimport { b } from './b.ts'\n"))
  assert.ok(!importsHelper("const x = 'released-changeset'\n"))
})

test('the sweep reaches the packages it is meant to, and sees a file that is right', () => {
  const files = swept()

  assert.ok(files.length > 100, `only ${files.length} files swept`)
  assert.ok(files.some((entry) => entry.file.startsWith('scripts/')))
  assert.ok(files.some((entry) => entry.file.startsWith('packages/core/test/')))
  const compliant = files.find(
    (entry) => entry.file === 'packages/core/test/css-data-shape.test.ts',
  )
  assert.ok(compliant, 'css-data-shape.test.ts is not swept')
  assert.ok(compliant.fragments.length > 0 && compliant.helper)
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
