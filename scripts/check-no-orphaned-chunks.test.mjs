import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// A NAMESPACE import, deliberately, not named imports. This suite's rows are written before the
// code they exercise (TDD), and a named import of a not-yet-existing export is a
// module-level SyntaxError that fails the whole FILE with one message -- which hides every row's
// own red behind the first missing symbol. Through the namespace, a missing export is `undefined`
// at the call site, so each row fails on its own assertion and its red is its own evidence.
import * as subject from './check-no-orphaned-chunks.mjs'

const {
  collectDeclaredEntries,
  findImportedSpecifiers,
  findOrphanedChunks,
  main,
  ORPHANED_CHUNK_HEADER,
  ORPHANED_CHUNK_REMEDY,
  parsePackedFiles,
  readPackedJsFiles,
  UNREADABLE_PACKAGE_HEADER,
  UNREADABLE_PACKAGE_REMEDY,
} = subject

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-no-orphaned-chunks.mjs',
)

test('findImportedSpecifiers finds a static export-from specifier (tsup entry-file shape)', () => {
  assert.deepEqual(findImportedSpecifiers("export { atoms } from './chunk-3S57XYS2.js';"), [
    './chunk-3S57XYS2.js',
  ])
})

test('findImportedSpecifiers finds a static import specifier', () => {
  assert.deepEqual(findImportedSpecifiers("import { atoms } from './chunk-ABCD1234.js'"), [
    './chunk-ABCD1234.js',
  ])
})

test('findImportedSpecifiers finds a dynamic import() specifier', () => {
  assert.deepEqual(findImportedSpecifiers("const m = await import('./chunk-ABCD1234.js')"), [
    './chunk-ABCD1234.js',
  ])
})

test('findImportedSpecifiers finds more than one specifier in the same file', () => {
  assert.deepEqual(
    findImportedSpecifiers(
      "export { a } from './chunk-AAAA1111.js';\nexport { b } from './chunk-BBBB2222.js';",
    ),
    ['./chunk-AAAA1111.js', './chunk-BBBB2222.js'],
  )
})

test('findImportedSpecifiers ignores a bare package-name import', () => {
  assert.deepEqual(findImportedSpecifiers("import { x } from '@navecss/tokens'"), [])
})

// ROW (F4): a nested entry file reaches a chunk in its parent directory through `../`, which the
// leading-`./`-only specifier pattern could not express at all.
test('findImportedSpecifiers finds a parent-relative ../ specifier (nested tsup entry shape)', () => {
  assert.deepEqual(findImportedSpecifiers("export { x } from '../chunk-5QDZ6XOZ.js'"), [
    '../chunk-5QDZ6XOZ.js',
  ])
})

test('findOrphanedChunks: a chunk with no importer at all is orphaned', () => {
  const files = {
    'atoms.js': "export { atoms } from './chunk-LIVE0001.js';",
    'chunk-DEAD0002.js': 'export const dead = 1;',
    'chunk-LIVE0001.js': 'export const atoms = {};',
  }
  assert.deepEqual(findOrphanedChunks(files, ['atoms.js']), ['chunk-DEAD0002.js'])
})

test('findOrphanedChunks: a chunk imported by another chunk (transitive) is not orphaned', () => {
  const files = {
    'atoms.js': "export { a } from './chunk-AAAA0001.js';",
    'chunk-AAAA0001.js': "export { b } from './chunk-BBBB0002.js'; export const a = 1;",
    'chunk-BBBB0002.js': 'export const b = 2;',
  }
  assert.deepEqual(findOrphanedChunks(files, ['atoms.js']), [])
})

test('findOrphanedChunks: no chunks at all reports no orphans', () => {
  assert.deepEqual(findOrphanedChunks({ 'atoms.js': 'export const atoms = {};' }, ['atoms.js']), [])
})

test('findOrphanedChunks: every chunk referenced reports no orphans', () => {
  const files = {
    'atoms.js': "export { atoms } from './chunk-LIVE0001.js';",
    'chunk-LIVE0001.js': 'export const atoms = {};',
    'cx.js': "import { atoms } from './chunk-LIVE0001.js';",
  }
  assert.deepEqual(findOrphanedChunks(files, ['atoms.js', 'cx.js']), [])
})

test('findOrphanedChunks: two independently orphaned chunks are both reported, sorted', () => {
  const files = {
    'atoms.js': "export { a } from './chunk-LIVE0001.js';",
    'chunk-DEAD0002.js': 'export const dead2 = 1;',
    'chunk-DEAD0001.js': 'export const dead1 = 1;',
    'chunk-LIVE0001.js': 'export const a = 1;',
  }
  assert.deepEqual(findOrphanedChunks(files, ['atoms.js']), [
    'chunk-DEAD0001.js',
    'chunk-DEAD0002.js',
  ])
})

// The measured instance this tripwire exists for, reproduced structurally: an entry importing only
// the LIVE chunk, plus a DEAD chunk that itself still parses as a valid module (as a real
// superseded tsup chunk does) and carries no import of its own.
test('findOrphanedChunks reproduces the measured shape: atoms/cx/postcss all import one live chunk, a second chunk with no importer is orphaned', () => {
  const files = {
    'atoms.js': "export { atomClassMap, atoms, toClassName } from './chunk-3S57XYS2.js';",
    'chunk-3S57XYS2.js':
      'export const atoms = {}; export const atomClassMap = {}; export const toClassName = () => "";',
    'chunk-VGWWB3KI.js': '/** stale docblock, no importer */\nexport const atoms = {};',
    'cx.js': "import { atomClassMap } from './chunk-3S57XYS2.js';",
    'postcss.js': "import { atoms } from './chunk-3S57XYS2.js';",
  }
  assert.deepEqual(findOrphanedChunks(files, ['atoms.js', 'cx.js', 'postcss.js']), [
    'chunk-VGWWB3KI.js',
  ])
})

// ROW (F4): the nested-entry shape, at the pure-function level. Two entry files in a
// subdirectory both reach one chunk in the parent directory; the specifier must be resolved
// RELATIVE TO THE IMPORTING FILE, not against the package root.
test('findOrphanedChunks: a chunk reached only through ../ from a nested entry is not orphaned', () => {
  const files = {
    'dist/chunk-5QDZ6XOZ.js': 'export const x = 1; export const y = 2;',
    'dist/theming/copy-lint.js': "export { x } from '../chunk-5QDZ6XOZ.js';",
    'dist/theming/build-step.js': "export { y } from '../chunk-5QDZ6XOZ.js';",
  }
  assert.deepEqual(
    findOrphanedChunks(files, ['dist/theming/copy-lint.js', 'dist/theming/build-step.js']),
    [],
  )
})

// ROW (F2): the graph is rooted in DECLARED entries. A superseded non-chunk entry left behind by
// the same `clean: false` mechanism this tripwire is filed about must not certify the
// superseded chunk it still references.
test('findOrphanedChunks: a stale undeclared entry does not certify the stale chunk it imports', () => {
  const files = {
    'dist/atoms.js': "export { a } from './chunk-LIVE0001.js';",
    'dist/postcss.js': "import { a } from './chunk-OLD00002.js';",
    'dist/chunk-LIVE0001.js': 'export const a = 1;',
    'dist/chunk-OLD00002.js': 'export const a = 0;',
  }
  assert.deepEqual(findOrphanedChunks(files, ['dist/atoms.js']), ['dist/chunk-OLD00002.js'])
})

// ROW (F5, kills M11 `roots = Object.keys(files)`): pins the difference between "reachable from a
// declared entry" (the property this tripwire asks for) and the tautology "reachable from
// anything on disk". With chunks as their own roots, chunk-DEADB0002 is reported reachable
// through chunk-DEADA0001 and only ONE of the two dead chunks is named.
test('findOrphanedChunks: a dead chunk chain with no entry importer reports BOTH chunks, not just its head', () => {
  const files = {
    'atoms.js': "export { a } from './chunk-LIVE0001.js';",
    'chunk-LIVE0001.js': 'export const a = 1;',
    'chunk-DEADA0001.js': "export { b } from './chunk-DEADB0002.js';",
    'chunk-DEADB0002.js': 'export const b = 2;',
  }
  assert.deepEqual(findOrphanedChunks(files, ['atoms.js']), [
    'chunk-DEADA0001.js',
    'chunk-DEADB0002.js',
  ])
})

// ROW: a DECLARED ENTRY that is itself chunk-named. `findOrphanedChunks`
// seeds `reachable` with every root that is in the chunk set, and without that seed loop such an
// entry is reported orphaned even though the manifest declares it -- a false RED whose printed
// remedy ("delete dist/ and rebuild") reproduces it exactly. No tsup build in this repository emits
// that shape today, so the guard is latent; nothing held it until now. The helper chunk is here to
// separate the two halves: it is reachable through the ordinary walk whether or not the seed loop
// exists, so deleting the seed loop reds this row on the ROOT alone.
test('findOrphanedChunks: a declared entry that is itself chunk-named is not reported orphaned', () => {
  const files = {
    'chunk-ENTRY001.js': "export { b } from './chunk-HELPER2.js';",
    'chunk-HELPER2.js': 'export const b = 2;',
  }
  assert.deepEqual(findOrphanedChunks(files, ['chunk-ENTRY001.js']), [])
})

// ROW (G1): DOCUMENTS KNOWN CURRENT BEHAVIOUR, not a property worth having. `IMPORT_SPECIFIER`
// is a regex and not a parser, so a `./chunk-*.js` substring sitting inside an ORDINARY STRING
// LITERAL after the word `from` or `import` matches it, `findOrphanedChunks` walks that FALSE
// EDGE, and a real orphan is certified reachable -- the quiet, fail-OPEN direction. Left
// unhardened deliberately (telling a specifier from a string literal needs a real parser, and
// there are zero live instances; see the subject's `IMPORT_SPECIFIER` comment for the
// measurement). This row is green today BY CONSTRUCTION: it exists so that the day the
// behaviour changes, someone is told rather than the change passing unremarked.
test('findOrphanedChunks: KNOWN GAP, a chunk name inside a string literal adds a false edge and hides the orphan', () => {
  const files = {
    'index.js': `export const msg = "cannot import from './chunk-DEAD0002.js'";`,
    'chunk-DEAD0002.js': 'export const d = 1;',
  }
  assert.deepEqual(findOrphanedChunks(files, ['index.js']), [])
})

// ROW (F2): the declared-entry set is read off the manifest, through every export condition and
// through nested subpath objects, plus `bin`, `main` and `module`.
test('collectDeclaredEntries reads exports (all conditions, nested), bin, main and module', () => {
  const manifest = {
    main: './dist/main.js',
    module: './dist/module.js',
    bin: { navecss: './dist/cli.js' },
    exports: {
      '.': { types: './dist/index.d.ts', style: './dist/index.css', import: './dist/index.js' },
      './deep': { node: { import: './dist/deep.js' } },
      './css-only': './dist/only.css',
    },
  }
  assert.deepEqual(collectDeclaredEntries(manifest).toSorted(), [
    'dist/cli.js',
    'dist/deep.js',
    'dist/index.js',
    'dist/main.js',
    'dist/module.js',
  ])
})

test('collectDeclaredEntries on a manifest declaring nothing returns no entries', () => {
  assert.deepEqual(collectDeclaredEntries({}), [])
})

// ROW (G7): `exports` array-fallback support as DOCUMENTED BEHAVIOUR. `collectStringLeaves`'s own
// docblock claims it ("an array of fallbacks, or any nesting of those"), so entries declared that
// way must become roots; if they stop, everything reachable only through them reds.
//
// WHAT THIS ROW DOES NOT CATCH, said plainly because an earlier version of this comment claimed
// the opposite: deleting the dedicated `Array.isArray` BRANCH of `collectStringLeaves` does NOT
// drop array-fallback support and does NOT red this row. An array is a non-null `object`, and
// `Object.values` on an array returns its elements, so the object branch below it subsumes the
// array branch exactly and the deletion is a no-op -- verified by mutation, the suite stays at
// 39/39 with that branch removed. The branch is kept as the legible statement of intent, but
// nothing here pins it, and a comment promising otherwise tells the next maintainer a door is
// shut that is open. What this row DOES catch is a change that stops arrays contributing leaves
// AT ALL; that mutant reds this row, alone, immediately.
test('collectDeclaredEntries reads an exports array fallback', () => {
  const manifest = { exports: { '.': { import: ['./dist/a.js', './dist/b.js'] } } }
  assert.deepEqual(collectDeclaredEntries(manifest).toSorted(), ['dist/a.js', 'dist/b.js'])
})

// ROW: a subpath PATTERN target is EXPANDED against the packed set, not skipped.
// `"./dist/styles/*.js"` is not a path and matches no packed file literally, so reading it as
// one silently drops the root and everything reachable only through it reds. This is the
// deliberate divergence from `check-readme-export-coverage.mjs`'s `inScopeExportKeys`; the
// subject's own `collectDeclaredEntries` docblock states why the two checks disagree.
test('collectDeclaredEntries expands a subpath-pattern target against the packed set', () => {
  const manifest = { exports: { './styles/*': './dist/styles/*.js' } }
  const packed = [
    'dist/styles/a.js',
    'dist/styles/nested/b.js',
    'dist/styles/c.css',
    'dist/other.js',
  ]
  assert.deepEqual(collectDeclaredEntries(manifest, packed).toSorted(), [
    'dist/styles/a.js',
    'dist/styles/nested/b.js',
  ])
})

// ROW: a target carrying MORE THAN ONE `*` binds ONE value to all of
// them. Verified against the resolver rather than assumed, on Node v24.17.0: a package whose only
// subpath is `"./a/*"` targeting `"./d/x-*-y-*.js"` resolves `starpkg/a/one` to `d/x-one-y-one.js`,
// so both stars take the same match. A first-star-only expansion contributes nothing for such a
// target where Node resolves a real file, which is the same false-RED direction row 1 exists to
// remove.
//
// THE `/`-SPANNING PROPERTY IS NOT THIS ROW'S, though an earlier version of this comment credited
// it here. Re-derived from this row's own data: `'./dist/*/x-*.js'` over the three packed paths
// below binds `"one"` and then `"two"`, and neither value contains a `/`. That property is held one
// row UP, by the single-star row, whose `'./dist/styles/*.js'` matches `dist/styles/nested/b.js`
// only by binding `"nested/b"` -- a mutant forbidding `/` in a bound match reds that row, and only
// that row. Nothing was uncovered; the credit was in the wrong place.
test('collectDeclaredEntries expands a multi-star pattern target by binding one value to every star', () => {
  const manifest = { exports: { './a/*': './dist/*/x-*.js' } }
  const packed = ['dist/one/x-one.js', 'dist/one/x-two.js', 'dist/two/x-two.js']
  assert.deepEqual(collectDeclaredEntries(manifest, packed).toSorted(), [
    'dist/one/x-one.js',
    'dist/two/x-two.js',
  ])
})

// ROW: a pattern that matches nothing in the packed set contributes
// nothing, rather than contributing its own literal `*`-bearing string as a phantom root. Same
// direction as the pre-existing "resolves to a path not in the packed set" rule, reached the other
// way: expansion is against the tarball, so an unmatched pattern is simply empty.
test('collectDeclaredEntries: a pattern matching no packed file contributes no entry', () => {
  const manifest = { exports: { './styles/*': './dist/styles/*.js' } }
  assert.deepEqual(collectDeclaredEntries(manifest, ['dist/atoms.js']), [])
})

// ROW: a subpath pattern broad enough to ALSO match a chunk's own name (`"./*": "./dist/*"` is
// lawful grammar) must not root that chunk on itself. Without this exclusion the chunk would pass
// `findOrphanedChunks`'s `chunkNames.has(root)` check unconditionally, degrading the property this
// gate asserts ("reachable from a declared entry") to the tautology "reachable from something the
// pattern also matched". The pattern's OTHER match (`dist/atoms.js`) is unaffected.
test('collectDeclaredEntries: a pattern broad enough to also match a chunk name excludes the chunk', () => {
  const manifest = { exports: { './*': './dist/*' } }
  const packed = ['dist/atoms.js', 'dist/chunk-DEAD0002.js']
  assert.deepEqual(collectDeclaredEntries(manifest, packed), ['dist/atoms.js'])
})

// ROW: the top-level `browser` field is a declared entry point. Measured
// as a false-RED source: a package declaring only `browser` had no root at all, so every chunk it
// ships reported orphaned.
test('collectDeclaredEntries reads a top-level browser field', () => {
  assert.deepEqual(collectDeclaredEntries({ browser: './dist/b.js' }), ['dist/b.js'])
})

// ROW: `imports` (Node's `#`-prefixed internal specifier map) names real
// files inside the package and is walked exactly like `exports`, through every condition. Measured
// as the third false-RED source.
test('collectDeclaredEntries reads imports subpath targets through their conditions', () => {
  const manifest = { imports: { '#h': './dist/h.js', '#c': { node: './dist/c.js' } } }
  assert.deepEqual(collectDeclaredEntries(manifest).toSorted(), ['dist/c.js', 'dist/h.js'])
})

// ROW: a `null` target contributes nothing. `"./internal": null` is how
// Node BLOCKS a subpath, so it names no file. Same treatment and same reason as
// `check-readme-export-coverage.mjs`'s `inScopeExportKeys`, which is where the two checks AGREE.
// GREEN BEFORE THIS CHANGE AND AFTER IT: `collectStringLeaves` already guards `value !== null`, and
// this row exists because the design call names the case explicitly and nothing pinned it.
test('collectDeclaredEntries: a null target contributes no entry', () => {
  const manifest = { exports: { '.': './dist/index.js', './internal': null } }
  assert.deepEqual(collectDeclaredEntries(manifest), ['dist/index.js'])
})

// ROW (F1): the printed header is pinned byte-for-byte so a later tidy cannot silently
// reintroduce the `files`-field over-claim it used to carry (`packages/tokens` reads
// `["dist","!dist/contact-sheet.html","tokens.json"]`, a negation, so "names the whole
// directory" was false of it).
test('ORPHANED_CHUNK_HEADER states what packs it without claiming the files field names a whole directory', () => {
  assert.equal(
    ORPHANED_CHUNK_HEADER,
    'Orphaned build chunk(s): a content-hashed chunk with no importer left behind in its own ' +
      "package, which npm packs into the published tarball anyway because that package's own " +
      'file list still selects it:\n',
  )
})

// ROW (G6): the second header constant, pinned byte-for-byte exactly as its sibling above is.
// The only other assertion on it is `out.includes(UNREADABLE_PACKAGE_HEADER)` with the expected
// value imported from the subject, which compares the subject to itself: replacing the whole
// constant leaves the whole suite green. It is the claim-bearing one ("a package this check
// skips is a package it did not check"), so it gets the same protection.
test('UNREADABLE_PACKAGE_HEADER states the failure as a failure to certify, not as a skip', () => {
  assert.equal(
    UNREADABLE_PACKAGE_HEADER,
    'Could not determine the packed file set for the following package(s), so this check could ' +
      'not certify them:\n',
  )
})

// ROW: the REMEDY paragraph beneath the orphaned-chunk header, pinned
// byte-for-byte exactly as the header above it is. Both headers were pinned and neither remedy was,
// so the actionable half of both reports was replaceable with `'nothing to see here'` at a fully
// green suite. The remedy is the part a person acts on, and this one carries the load-bearing claim
// that the fix is a rebuild rather than a source edit -- the sentence that decides whether the
// reader goes looking for a bug that is not there.
test('ORPHANED_CHUNK_REMEDY tells the reader this is a stale artifact and to rebuild, not to edit source', () => {
  assert.equal(
    ORPHANED_CHUNK_REMEDY,
    "\nThis is a stale build artifact, not a source change: delete the package's dist/ (or " +
      'run its clean script) and rebuild from a clean tree before packing or publishing.',
  )
})

// ROW: the other remedy paragraph, same protection for the same reason.
// Its claim is the one that says an unreadable package is a FAILURE and not a skip, which is the
// whole argument for this branch exiting non-zero.
test('UNREADABLE_PACKAGE_REMEDY states that a package it cannot read is a package it did not check', () => {
  assert.equal(
    UNREADABLE_PACKAGE_REMEDY,
    '\nA package this check cannot read is a package it did not check, so this is a failure ' +
      'rather than a skip.',
  )
})

// ROW (G3): fail CLOSED on a tarball entry that carries no `files` key. `(parsed[0].files ?? [])`
// was copied verbatim from the `listPackedFiles` of a since-retired sibling that was REPORT-ONLY
// and paired that idiom with a compensating tripwire (its summary read INCOMPLETE
// when the scanned file count was 0). Only the idiom was copied, not the tripwire, and in a GATE the
// consequence is worse: an unreadable package becomes an empty packed set, an empty packed set
// has no chunks, and the check prints its confident success line over a tarball it never read.
test('parsePackedFiles throws on a tarball entry with no files key, rather than reading it as zero packed files', () => {
  assert.throws(() => parsePackedFiles('[{"name":"x"}]'), /files list/)
})

// ROW (G3): the other half of the same tripwire. A package whose packed set is genuinely EMPTY
// is not a package with no orphans, it is a package this check did not certify.
test('parsePackedFiles throws on a tarball entry whose packed file list is empty', () => {
  assert.throws(() => parsePackedFiles('[{"name":"x","files":[]}]'), /zero packed files/)
})

// ROW: the third of `parsePackedFiles`'s throw limbs, the only one the
// two rows above left uncovered. Still fail-CLOSED without it (`parsed[0].files` on an empty array
// is a TypeError into the same `unreadable` bucket), so this pins the NAMED reason rather than a
// missing verdict: a reader of the failure line is told the reply carried no tarball entry instead
// of reading a `Cannot read properties of undefined` stack fragment.
// GREEN BEFORE THIS CHANGE AND AFTER IT: the limb already exists; only the coverage is new.
test('parsePackedFiles throws on an empty top-level array, naming the missing tarball entry', () => {
  assert.throws(() => parsePackedFiles('[]'), /no tarball entry/)
})

// ROW: `readPackedJsFiles` reads ONLY the packed `.js` files.
//
// STATED PRECISELY, BECAUSE THE OBVIOUS RATIONALE FOR THIS ROW IS WRONG. The carve-out filed this
// as fail-OPEN ("a non-`.js` packed file scanned for specifiers can contribute a FALSE EDGE"). It
// cannot, and that was measured rather than assumed: for a file to be scanned it must be REACHED,
// a file is reached only by being a declared entry or by being the target of a specifier,
// `collectDeclaredEntries` keeps only `.js` targets (pinned by the `./css-only` case in its own row
// above) and `IMPORT_SPECIFIER` captures only specifiers ending in `.js`, so no non-`.js` key in
// this map is reachable by either road and none is ever read for specifiers. Dropping this filter
// changes no verdict.
//
// What it does change is what gets READ: every packed `.css`, `.json`, `.d.ts`, `.html` and
// `README.md` in all four packages, into memory, as UTF-8, on every run of the gate, for a map
// whose extra keys nothing can consult. That is the property this row pins, and it is pinned as a
// contract on the function rather than as a verdict on a tree because a verdict row would be
// asserting a consequence that does not exist.
test('readPackedJsFiles reads the packed .js files and skips every other extension', () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'orphan-chunks-')))
  try {
    writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;')
    writeFileSync(path.join(dir, 'b.css'), '.x {}')
    writeFileSync(path.join(dir, 'c.d.ts'), 'export declare const a: number')
    assert.deepEqual(readPackedJsFiles(dir, ['a.js', 'b.css', 'c.d.ts']), {
      'a.js': 'export const a = 1;',
    })
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ---------------------------------------------------------------------------------------------
// End-to-end fixtures. `main(rootDir)` and the script run as a real PROCESS are both driven
// against scratch trees that carry real `package.json` manifests, because the packed file set is
// now read from `npm pack --dry-run --json` rather than from a `dist/` walk.
// ---------------------------------------------------------------------------------------------

/**
 * Builds a scratch workspace root: `<root>/packages/<name>/package.json` plus every file in that
 * package's `files` map (keys are package-relative paths). Returns the PHYSICAL path, because
 * macOS's `mkdtemp` hands back a `/var/folders/...` symlink and the script's own main guard
 * compares realpaths on both sides.
 */
function buildFixture(packages) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'orphan-chunks-')))
  mkdirSync(path.join(dir, 'packages'), { recursive: true })
  for (const [name, { manifest, files }] of Object.entries(packages)) {
    const pkgDir = path.join(dir, 'packages', name)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      typeof manifest === 'string'
        ? manifest
        : JSON.stringify({ name: `fixture-${name}`, version: '0.0.0', ...manifest }, null, 2),
    )
    for (const [relPath, content] of Object.entries(files ?? {})) {
      const target = path.join(pkgDir, relPath)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
  }
  return dir
}

/**
`main(rootDir)`'s verdict: `{ exitCode, out }`, with `process.exitCode` saved and restored.
 */
function mainVerdict(rootDir) {
  let out = ''
  const realLog = console.log
  const realError = console.error
  const originalExitCode = process.exitCode
  console.log = (line) => {
    out += `${line}\n`
  }
  console.error = (line) => {
    out += `${line}\n`
  }
  process.exitCode = undefined
  let exitCode
  try {
    main(rootDir)
    exitCode = process.exitCode ?? 0
  } finally {
    console.log = realLog
    console.error = realError
    process.exitCode = originalExitCode
  }
  return { exitCode, out }
}

/**
 * Runs the REAL script as its own process against `rootDir`, by copying it to
 * `<rootDir>/scripts/` (the script resolves its own ROOT from its location, one directory up).
 * Returns `{ status, out }` with stdout and stderr concatenated.
 */
function runScriptIn(rootDir) {
  const scriptsDir = path.join(rootDir, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  const copied = path.join(scriptsDir, path.basename(SCRIPT_PATH))
  copyFileSync(SCRIPT_PATH, copied)
  try {
    const stdout = execFileSync(process.execPath, [copied], { encoding: 'utf8' })
    return { status: 0, out: stdout }
  } catch (error) {
    return { status: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const CLEAN_PACKAGE = {
  manifest: { files: ['dist'], exports: { './atoms': { import: './dist/atoms.js' } } },
  files: {
    'dist/atoms.js': "export { a } from './chunk-LIVE0001.js';",
    'dist/chunk-LIVE0001.js': 'export const a = 1;',
  },
}

/**
The measured shape this tripwire exists for: a superseded chunk nothing imports, still packed.
 */
const ORPHANED_PACKAGE = {
  manifest: { files: ['dist'], exports: { './atoms': { import: './dist/atoms.js' } } },
  files: {
    'dist/atoms.js': "export { a } from './chunk-LIVE0001.js';",
    'dist/chunk-LIVE0001.js': 'export const a = 1;',
    'dist/chunk-DEAD0002.js': 'export const dead = 1;',
  },
}

test('main(rootDir): a clean fixture with every chunk referenced exits 0', () => {
  const dir = buildFixture({ core: CLEAN_PACKAGE })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): a fixture with an orphaned chunk sets exitCode and names the file', () => {
  const dir = buildFixture({ core: ORPHANED_PACKAGE })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): a package with no dist/ at all is skipped, not an error', () => {
  const dir = buildFixture({ bridge: { manifest: { files: ['src'] }, files: {} } })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F4): the measured nested-entry tree from the round-1 review. Two entry files under
// `dist/theming/` both import one chunk in `dist/`. A non-recursive read cannot see the entries
// and a `./`-only specifier pattern cannot express the edge, so the check reds on a build that is
// entirely lawful, and its own printed remedy ("delete dist/ and rebuild") reproduces it exactly.
test('main(rootDir): a nested-entry build reaching its chunk through ../ exits 0', () => {
  const dir = buildFixture({
    core: {
      manifest: {
        files: ['dist'],
        exports: {
          './copy-lint': { import: './dist/theming/copy-lint.js' },
          './build-step': { import: './dist/theming/build-step.js' },
        },
      },
      files: {
        'dist/chunk-5QDZ6XOZ.js': 'export const x = 1; export const y = 2;',
        'dist/theming/copy-lint.js': "export { x } from '../chunk-5QDZ6XOZ.js';",
        'dist/theming/build-step.js': "export { y } from '../chunk-5QDZ6XOZ.js';",
      },
    },
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F2): the same stale-entry shape, end to end. `postcss.js` is a superseded entry the
// manifest does not declare; it must not certify the superseded chunk it still imports.
test('main(rootDir): a stale undeclared entry does not hide the stale chunk it imports', () => {
  const dir = buildFixture({
    core: {
      manifest: { files: ['dist'], exports: { './atoms': { import: './dist/atoms.js' } } },
      files: {
        'dist/atoms.js': "export { a } from './chunk-LIVE0001.js';",
        'dist/postcss.js': "import { a } from './chunk-OLD00002.js';",
        'dist/chunk-LIVE0001.js': 'export const a = 1;',
        'dist/chunk-OLD00002.js': 'export const a = 0;',
      },
    },
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.match(out, /packages\/core\/dist\/chunk-OLD00002\.js/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F3): the packed set comes from `npm pack --dry-run --json`, not from a `dist/` walk, so a
// file the package's own `files` field NEGATES out of the tarball is not a violation. This is
// `packages/tokens`'s real shape (`["dist","!dist/contact-sheet.html","tokens.json"]`).
test('main(rootDir): an orphan chunk excluded by a files-field negation is not reported', () => {
  const dir = buildFixture({
    core: {
      manifest: {
        files: ['dist', '!dist/chunk-DEAD0002.js'],
        exports: { './atoms': { import: './dist/atoms.js' } },
      },
      files: {
        'dist/atoms.js': "export { a } from './chunk-LIVE0001.js';",
        'dist/chunk-LIVE0001.js': 'export const a = 1;',
        'dist/chunk-DEAD0002.js': 'export const dead = 1;',
      },
    },
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ---------------------------------------------------------------------------------------------
// ROWS. Three lawful `exports`-grammar forms, each measured as a
// permanent false RED before this change, each paired with a CONTROL proving the same shape still
// reports a genuine orphan. The control is what separates "the root is now derived" from "the check
// stopped looking": each control asserts BOTH that the dead chunk is named AND that the live one is
// not, so the pre-change behaviour (no root at all, therefore every chunk reported) reds it.
// ---------------------------------------------------------------------------------------------

/**
`entryPath` reaches `chunk-LIVE0001.js`; nothing reaches `chunk-DEAD0002.js` when `orphan` is set.
 */
function shapeFixture({ manifest, entryPath, orphan }) {
  const toLive = path.posix.relative(path.posix.dirname(entryPath), 'dist/chunk-LIVE0001.js')
  const specifier = toLive.startsWith('.') ? toLive : `./${toLive}`
  const files = {
    [entryPath]: `export { a } from '${specifier}';`,
    'dist/chunk-LIVE0001.js': 'export const a = 1;',
  }
  if (orphan) files['dist/chunk-DEAD0002.js'] = 'export const dead = 1;'
  return buildFixture({ core: { manifest: { files: ['dist'], ...manifest }, files } })
}

const PATTERN_MANIFEST = { exports: { './styles/*': './dist/styles/*.js' } }
const WILDCARD_MANIFEST = { exports: { './*': './dist/*' } }
const BROWSER_MANIFEST = { browser: './dist/b.js' }
const IMPORTS_MANIFEST = { imports: { '#h': './dist/h.js' } }

test('main(rootDir): an exports subpath PATTERN root is expanded against the packed set, so its build exits 0', () => {
  const dir = shapeFixture({ manifest: PATTERN_MANIFEST, entryPath: 'dist/styles/a.js' })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): CONTROL, a real orphan under an exports subpath PATTERN is still reported, and the live chunk is not', () => {
  const dir = shapeFixture({
    manifest: PATTERN_MANIFEST,
    entryPath: 'dist/styles/a.js',
    orphan: true,
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: a `"./*": "./dist/*"` pattern is broad enough to also match a chunk file's own name, which
// would root the chunk on itself if `collectDeclaredEntries` did not exclude chunk-shaped targets
// (see the docblock note above it). No package in this workspace writes a manifest this broad;
// this is a correctness fix for the stated property, not a measured regression.
test('main(rootDir): a wildcard exports pattern broad enough to also match a chunk name does not root the chunk on itself', () => {
  const dir = shapeFixture({
    manifest: WILDCARD_MANIFEST,
    entryPath: 'dist/entry.js',
    orphan: true,
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): CONTROL, the same wildcard pattern still exits 0 with no orphan present', () => {
  const dir = shapeFixture({ manifest: WILDCARD_MANIFEST, entryPath: 'dist/entry.js' })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): a top-level browser field is a declared root, so its build exits 0', () => {
  const dir = shapeFixture({ manifest: BROWSER_MANIFEST, entryPath: 'dist/b.js' })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): CONTROL, a real orphan beside a browser root is still reported, and the live chunk is not', () => {
  const dir = shapeFixture({ manifest: BROWSER_MANIFEST, entryPath: 'dist/b.js', orphan: true })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): an imports map target is a declared root, so its build exits 0', () => {
  const dir = shapeFixture({ manifest: IMPORTS_MANIFEST, entryPath: 'dist/h.js' })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): CONTROL, a real orphan beside an imports root is still reported, and the live chunk is not', () => {
  const dir = shapeFixture({ manifest: IMPORTS_MANIFEST, entryPath: 'dist/h.js', orphan: true })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ---------------------------------------------------------------------------------------------
// ROWS (from a terminal read). WHERE NODE SUBSTITUTES `*`, AND WHERE IT DOES NOT.
// All three shapes below are fail-OPEN: the gate manufactured a root out of a subpath that does
// not resolve, the root certified a real orphan as reachable, and the check exited 0 over a
// tarball still carrying the stale byte. Each claim about the resolver was measured against Node
// v24.17.0 with a real package on disk before its row was written, and each row is paired with a
// live chunk it must NOT name, so a fix that simply stopped deriving roots reds it too.
// ---------------------------------------------------------------------------------------------

/**
`dist/atoms.js` reaches `chunk-LIVE0001.js`; nothing reaches `chunk-DEAD0002.js`.
 */
function starFixture(manifest) {
  return buildFixture({
    core: {
      manifest: { files: ['dist'], ...manifest },
      files: {
        'dist/atoms.js': "export { a } from './chunk-LIVE0001.js';",
        'dist/chunk-LIVE0001.js': 'export const a = 1;',
        'dist/chunk-DEAD0002.js': 'export const dead = 1;',
      },
    },
  })
}

// ROW: a `*` can NEVER match the empty string, so a pattern target that reaches a packed file only
// by binding a zero-length match names no subpath that resolves, and must root nothing. Measured
// on Node v24.17.0 against a real package whose sole subpath is `"./a*"` -> `"./d/x*.js"` with
// `d/x.js` present on disk: `sp/a` throws ERR_PACKAGE_PATH_NOT_EXPORTED while the control `sp/aq`
// resolves to `d/xq.js`. The `imports` form behaves identically (`#i` ->
// ERR_PACKAGE_IMPORT_NOT_DEFINED, control `#iq` -> `d/xq.js`), as does a bare `"./*"`. The reason
// is in the algorithm: a pattern match requires the requested subpath to be strictly longer than
// the key's pattern base, so the bound value is at least one character.
//
// Without the `"./x/*"` line this exact tree exits 1 and names the dead chunk; with it, and with a
// zero-length match accepted, `'./dist/chunk-DEAD0002*.js'` "matches" `dist/chunk-DEAD0002.js` at
// length 0 and roots it, and the orphan is certified reachable.
test('main(rootDir): a pattern target reaching a chunk only by a ZERO-LENGTH star roots nothing, so the orphan is still reported', () => {
  const dir = starFixture({
    exports: { './atoms': './dist/atoms.js', './x/*': './dist/chunk-DEAD0002*.js' },
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: Node substitutes `*` ONLY for a subpath-PATTERN KEY. Under a non-pattern key the `*` in the
// target is an ordinary filename character and the target resolves literally. Measured on Node
// v24.17.0: with `"exports": {"./a": "./d/x-*.js"}` and a real file NAMED `d/x-*.js` on disk,
// `sp/a` resolves to `d/x-*.js` itself, not to the sibling `d/x-q.js`. Expanding such a target
// against the packed set therefore invents roots the resolver never produces -- here it roots BOTH
// chunks off one non-pattern key and hides the dead one.
test('main(rootDir): a `*` in the target of a NON-pattern exports key is literal, not a wildcard, so it roots no chunk', () => {
  const dir = starFixture({ exports: { './atoms': './dist/atoms.js', './x': './dist/chunk-*.js' } })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: `main` is not a subpath map and Node never substitutes in it; the same holds for `module`,
// `browser` and `bin`, where a `*` is only ever a literal filename character. Measured on Node
// v24.17.0: with `"main": "./d/x-*.js"` and a real file named `d/x-*.js` on disk, `sp` resolves to
// `d/x-*.js` itself. Same fail-OPEN consequence as the row above, reached through a field that has
// no key to inspect at all.
test('main(rootDir): a `*` in main is a literal filename character, not a wildcard, so it roots no chunk', () => {
  const dir = starFixture({
    main: './dist/chunk-*.js',
    exports: { './atoms': './dist/atoms.js' },
  })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
    assert.ok(!out.includes('chunk-LIVE0001.js'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (🔵, a review finding tracked in the principal engineer's table): pinned as CORRECT, not a
// defect. A `main` field shaped like `"./dist/x.js/."` now normalizes to `dist/x.js` and roots
// it, which it did not before roots were derived from declared entries at all (any non-chunk
// `.js` on disk was already a root, so the manifest's exact shape never mattered). Measured
// directly against Node rather than assumed: `require.resolve()` against a real package on disk
// whose `main` reads `"./dist/x.js/."` returns the file `dist/x.js`, so treating this shape as a
// root MATCHES the runtime's own resolution rather than diverging from it. No build tool emits
// this shape (the entry point named here does exist and is a real file), so it is inert in
// practice; the row exists so a future reader sees this was measured and closed, not left as an
// open question.
test('collectDeclaredEntries: a main field with a trailing /. segment normalizes the same way Node itself resolves it', () => {
  const manifest = { main: './dist/x.js/.' }
  assert.deepEqual(collectDeclaredEntries(manifest), ['dist/x.js'])
})

// ROW (F3): fail closed. A package whose packed set cannot be determined is named and the check
// exits 1, rather than being skipped silently (a skipped package is an unchecked package).
test('main(rootDir): a package whose packed set cannot be read fails loudly instead of being skipped', () => {
  const dir = buildFixture({ core: { manifest: '{ not valid json', files: {} } })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.ok(out.includes(UNREADABLE_PACKAGE_HEADER), out)
    assert.match(out, /packages\/core/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (G7): the `&& unreadable.length === 0` limb of the success branch. Dropping it leaves the
// whole suite green and prints the confident "No orphaned build chunks" line immediately after
// "could not certify them" -- a report that contradicts itself in two consecutive paragraphs, on
// the exit path where it matters most. The row above pins the failure half; this pins the
// silence that has to go with it.
test('main(rootDir): a package that could not be certified does NOT also print the success line', () => {
  const dir = buildFixture({ core: { manifest: '{ not valid json', files: {} } })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1)
    assert.ok(!out.includes('No orphaned build chunks'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (G7): the `if (!existsSync(<package>/package.json)) continue` skip, held by nothing until
// now. Neutering it leaves the whole suite green and turns a plain `packages/scratch/` directory
// -- no manifest, nothing to publish, an entirely lawful thing to have in a working tree -- into
// a RED, because `npm pack` in a directory that is not a package throws and the directory then
// lands in the `unreadable` bucket. One line stands between a stray directory and a red gate.
test('main(rootDir): a directory under packages/ with no package.json is skipped, not an unreadable package', () => {
  const dir = buildFixture({ core: CLEAN_PACKAGE })
  mkdirSync(path.join(dir, 'packages', 'scratch'), { recursive: true })
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F7): `statSync` follows symlinks, so a broken symlink under `packages/` used to throw
// ENOENT with a stack trace before any package was inspected.
test('main(rootDir): a broken symlink under packages/ is skipped, not a crash', () => {
  const dir = buildFixture({ core: CLEAN_PACKAGE })
  symlinkSync(path.join(dir, 'packages', 'does-not-exist'), path.join(dir, 'packages', 'dangling'))
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F7): symmetry with the per-package read, whose own failures `main`'s try/catch turns into
// a named `unreadable` entry. A root with no `packages/` at all is nothing to check, not an
// ENOENT stack trace before any package has been looked at.
test('main(rootDir): a root with no packages/ directory reports no orphans instead of throwing', () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'orphan-chunks-')))
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F6): a real VERDICT from the real process on a clean tree, replacing
// `assert.ok(status === 0 || status === 1)`, which every possible outcome satisfied. The tree is
// the nested-entry one, so this row is also the process-level half of F4.
test('the script run as a real process on a clean tree exits 0 and says so', () => {
  const dir = buildFixture({
    core: {
      manifest: {
        files: ['dist'],
        exports: { './copy-lint': { import: './dist/theming/copy-lint.js' } },
      },
      files: {
        'dist/chunk-5QDZ6XOZ.js': 'export const x = 1;',
        'dist/theming/copy-lint.js': "export { x } from '../chunk-5QDZ6XOZ.js';",
      },
    },
  })
  try {
    const { status, out } = runScriptIn(dir)
    assert.equal(status, 0, out)
    assert.match(out, /No orphaned build chunks/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F6): the dirty half of the same replacement -- a real process, a real non-zero status, and
// the offending path named in the output.
test('the script run as a real process on a tree with an orphan exits 1 and names the file', () => {
  const dir = buildFixture({ core: ORPHANED_PACKAGE })
  try {
    const { status, out } = runScriptIn(dir)
    assert.equal(status, 1, out)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F5, kills M10): with the main guard's `process.argv[1] &&` limb mutated to `false &&`,
// `main()` never fires, the process prints nothing and exits 0 -- and `release` publishes. This
// row pins the process's verdict AGAINST `main(dir)`'s verdict on the same fixture tree (not
// against `main(ROOT)`, which would scan the real workspace), so a guard that stops firing is a
// mismatch here rather than a silent success.
test('the script run as a real process produces the same verdict as main() on the same tree', () => {
  const dir = buildFixture({ core: ORPHANED_PACKAGE })
  try {
    const inProcess = mainVerdict(dir)
    const asProcess = runScriptIn(dir)
    assert.equal(asProcess.status, inProcess.exitCode)
    assert.equal(asProcess.out, inProcess.out)
    assert.equal(inProcess.exitCode, 1)
    assert.match(asProcess.out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (G4): the main guard's realpath property, held by no row until now. Reverting the
// main guard to its pre-fix form (`fileURLToPath(import.meta.url) === process.argv[1]`, no
// `realpathSync` on either side) is green against every other row in this file, because they all
// invoke the script through a path with no symlink in it. Here the same fixture is reached
// through a SYMLINK to its own root, so `process.argv[1]` carries the link while Node hands
// `import.meta.url` back symlink-resolved: under the pre-#426 form the two sides disagree,
// `main()` never fires, and the process exits 0 having printed nothing on a tree that carries an
// orphan -- with `release` publishing it. The symlink is created explicitly rather than relying
// on macOS's `/var` -> `/private/var`, so the discrepancy exists on every platform instead of
// only on the one this was measured on.
test('the script invoked through a symlinked workspace root still fires and reports the orphan', () => {
  const dir = buildFixture({ core: ORPHANED_PACKAGE })
  const link = `${dir}-symlink`
  symlinkSync(dir, link)
  try {
    const { status, out } = runScriptIn(link)
    assert.equal(status, 1, out)
    assert.match(out, /packages\/core\/dist\/chunk-DEAD0002\.js/)
  } finally {
    rmSync(link, { force: true })
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW (F6): what the old `main() with no argument ... without throwing` test actually pinned, said
// honestly. It asserts ROOT resolution and NOTHING about any verdict; it deliberately does not run
// the real scan, which now shells out to `npm pack` four times.
test("ROOT resolves to the directory one level above the script's own scripts/ directory", () => {
  assert.equal(subject.ROOT, path.resolve(path.dirname(SCRIPT_PATH), '..'))
  assert.equal(path.basename(path.dirname(SCRIPT_PATH)), 'scripts')
})
