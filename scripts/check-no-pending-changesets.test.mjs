import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// A NAMESPACE import, deliberately, not named imports -- the convention this directory's
// suites already use (`check-no-orphaned-chunks.test.mjs` states the reason in full). These
// rows are written before the code they exercise (TDD), and a named import of a
// not-yet-existing export is a module-level SyntaxError that fails the whole FILE with one
// message, which hides every row's own red behind the first missing symbol. Through the
// namespace, a missing export is `undefined` at the call site, so each row fails on its own
// assertion and its red is its own evidence.
import * as subject from './check-no-pending-changesets.mjs'

const {
  findPendingChangesets,
  IGNORED_CHANGESET_MD_FILES,
  main,
  PENDING_CHANGESET_HEADER,
  PENDING_CHANGESET_REMEDY,
  UNREADABLE_CHANGESET_DIR_HEADER,
  UNREADABLE_CHANGESET_DIR_REMEDY,
} = subject

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-no-pending-changesets.mjs',
)

// ---------------------------------------------------------------------------------------------
// The pure classifier. Every row here is a name `readdirSync('.changeset')` can really hand
// back, and the ignore rules are the ones `@changesets/read`'s own `readChangesets` applies
// before it parses anything -- so a name this function calls pending is a name that command
// would really consume, and a name it passes over is one that command really ignores.
// ---------------------------------------------------------------------------------------------

test('findPendingChangesets: an ordinary fragment is pending', () => {
  assert.deepEqual(findPendingChangesets(['brisk-lab-seeds.md']), ['brisk-lab-seeds.md'])
})

test('findPendingChangesets: config.json is not a fragment (it is not markdown)', () => {
  assert.deepEqual(findPendingChangesets(['config.json']), [])
})

test('findPendingChangesets: README.md is not a fragment', () => {
  assert.deepEqual(findPendingChangesets(['README.md']), [])
})

// ROW: the upstream reader matches README case-INSENSITIVELY (`/^README\.md$/i`) while matching
// the other three ignored names as exact strings. A transcription that flattened both halves to
// one comparison would disagree with the real reader on one of these two rows.
test('findPendingChangesets: readme.md in lower case is not a fragment either', () => {
  assert.deepEqual(findPendingChangesets(['readme.md']), [])
})

test('findPendingChangesets: the agent-instruction files the reader ignores are not fragments', () => {
  assert.deepEqual(findPendingChangesets(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']), [])
})

test('findPendingChangesets: a dot-prefixed markdown file is not a fragment', () => {
  assert.deepEqual(findPendingChangesets(['.keep.md']), [])
})

// ROW: `readChangesets` reads `.changeset/pre/` as well and prefixes those names with `pre/`, so
// a fragment parked there is consumed exactly as one at the top level is. The filter is applied
// to the BASENAME, which is what makes such a name pending rather than silently skipped for
// containing a slash.
test('findPendingChangesets: a fragment under pre/ is pending, matched on its basename', () => {
  assert.deepEqual(findPendingChangesets(['pre/tidy-moons-describe.md']), [
    'pre/tidy-moons-describe.md',
  ])
})

// ROW: the ignore list applies under a `pre/` prefix too, on the BASENAME. A mutant that
// special-cases anything under `pre/` as always-pending (treating the prefix as an override of
// the ignore rules rather than just a location) would report these two as pending; they are not.
test('findPendingChangesets: the ignored names are still ignored under a pre/ prefix', () => {
  assert.deepEqual(findPendingChangesets(['pre/README.md', 'pre/AGENTS.md']), [])
})

test('findPendingChangesets: several fragments are all reported, sorted, ignoring the rest', () => {
  assert.deepEqual(
    findPendingChangesets([
      'olive-jars-repeat.md',
      'config.json',
      'brisk-lab-seeds.md',
      'README.md',
    ]),
    ['brisk-lab-seeds.md', 'olive-jars-repeat.md'],
  )
})

test('findPendingChangesets: an empty directory listing has nothing pending', () => {
  assert.deepEqual(findPendingChangesets([]), [])
})

// ROW: the ignore list is a TRANSCRIPTION of `@changesets/read@1.0.0`'s own `ignoredMdFiles`,
// and `@changesets/read` is not resolvable from this repository's root (only `@changesets/cli`
// is a dependency), so nothing can compare the two automatically. Pinned here so a silent
// narrowing -- which is the fail-OPEN direction, a name this gate stops reporting while the real
// reader still consumes it -- fails a named row rather than passing unremarked.
test('IGNORED_CHANGESET_MD_FILES transcribes the four names the shipped reader ignores', () => {
  const asText = IGNORED_CHANGESET_MD_FILES.map(String)
  assert.deepEqual(asText, [String.raw`/^README\.md$/i`, 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md'])
})

// ---------------------------------------------------------------------------------------------
// The printed surfaces, pinned byte-for-byte. Both headers AND both remedies, because the remedy
// is the half a person acts on and pinning only the headers leaves it replaceable at a fully
// green suite (a finding recorded against this directory's sibling gate).
// ---------------------------------------------------------------------------------------------

test('PENDING_CHANGESET_HEADER says publish never reads the directory, so a fragment outlives this release', () => {
  assert.equal(
    PENDING_CHANGESET_HEADER,
    'Pending changeset fragment(s) on the release path: the release stages (and, once approved, ' +
      "publishes) each package manifest's version exactly as written and never reads " +
      '.changeset/, so every fragment below survives this release unconsumed and is then folded ' +
      'into whatever version comes next, describing work the release below it already shipped:\n',
  )
})

// ROW: the remedy carries the FENCE this check was asked for -- it refuses and deletes nothing,
// because which fragments go is a release decision and not a script's -- plus both lawful ways
// out. A remedy that named only the deletion would read as an instruction to throw away release
// copy that may still be wanted.
test('PENDING_CHANGESET_REMEDY refuses without deleting and names both lawful ways to clear it', () => {
  assert.equal(
    PENDING_CHANGESET_REMEDY,
    '\nThis refuses and deletes nothing: which fragments go, and whether their narrative is ' +
      "kept anywhere, is a release decision and not a script's. Two ways to clear it, and both " +
      'end with .changeset/ holding no fragment at all: delete the fragments whose content the ' +
      'version about to be published already contains, or run `changeset version` first to ' +
      'consume them into a deliberately chosen next version.',
  )
})

test('UNREADABLE_CHANGESET_DIR_HEADER states the failure as a failure to certify, not as a skip', () => {
  assert.equal(
    UNREADABLE_CHANGESET_DIR_HEADER,
    'Could not read the changeset directory, so this check could not certify that this ' +
      'release leaves no fragment behind:\n',
  )
})

test('UNREADABLE_CHANGESET_DIR_REMEDY states that a directory it cannot read is one it did not check', () => {
  assert.equal(
    UNREADABLE_CHANGESET_DIR_REMEDY,
    '\nA directory this check cannot read is a directory it did not check, so this is a ' +
      'failure rather than a skip.',
  )
})

// ---------------------------------------------------------------------------------------------
// End-to-end over scratch trees. `main(rootDir)` takes the repository root so a fixture can be
// driven without touching this repository's own `.changeset/`, which legitimately holds
// fragments today and must stay untouched by a test.
// ---------------------------------------------------------------------------------------------

/**
 * Builds a scratch repository root carrying a `.changeset/` directory with `names` in it. A name
 * containing a slash is created under its subdirectory (`pre/x.md`). Returns the PHYSICAL path,
 * because macOS's `mkdtemp` hands back a `/var/folders/...` symlink and the script's own main
 * guard compares realpaths on both sides.
 */
function buildFixture(names) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'pending-changesets-')))
  mkdirSync(path.join(dir, '.changeset'), { recursive: true })
  for (const name of names) {
    const target = path.join(dir, '.changeset', name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, `---\n'@navecss/tokens': patch\n---\n\n${name}\n`)
  }
  return dir
}

/**
 * `main(rootDir)`'s verdict: `{ exitCode, out }`, with `process.exitCode` saved and restored.
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
 * Runs the REAL script as its own process against `rootDir`, by copying it into
 * `<rootDir>/scripts/` (the script resolves its own ROOT from its own location, one directory
 * up). Returns `{ status, out }` with stdout and stderr concatenated.
 */
function runScriptIn(rootDir) {
  const scriptsDir = path.join(rootDir, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  const copied = path.join(scriptsDir, path.basename(SCRIPT_PATH))
  copyFileSync(SCRIPT_PATH, copied)
  try {
    const stdout = execFileSync(process.execPath, [copied], { encoding: 'utf8' })
    return { out: stdout, status: 0 }
  } catch (error) {
    return { out: `${error.stdout ?? ''}${error.stderr ?? ''}`, status: error.status }
  }
}

test('main(rootDir): a changeset directory holding only config.json and README.md exits 0', () => {
  const dir = buildFixture(['README.md'])
  writeFileSync(path.join(dir, '.changeset', 'config.json'), '{}\n')
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No pending changeset fragments/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('main(rootDir): one pending fragment sets exitCode and names the file', () => {
  const dir = buildFixture(['README.md', 'brisk-lab-seeds.md'])
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.ok(out.includes(PENDING_CHANGESET_HEADER), out)
    assert.match(out, /\.changeset\/brisk-lab-seeds\.md/)
    assert.ok(out.includes(PENDING_CHANGESET_REMEDY), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: the success line must not accompany a refusal. Its sibling gate carries the same row for
// the same reason: a report that contradicts itself in two consecutive paragraphs is worst on
// exactly the exit path that matters.
test('main(rootDir): a refusal does NOT also print the success line', () => {
  const dir = buildFixture(['brisk-lab-seeds.md'])
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.ok(!out.includes('No pending changeset fragments'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: THE FENCE, asserted as behaviour rather than only as printed copy. This gate's scope
// line, as given to it, is "the check must refuse, never auto-delete". A gate that quietly
// cleared the directory would satisfy every other row in this file, including the exit code.
test('main(rootDir): the refusal leaves every fragment exactly where it was', () => {
  const dir = buildFixture(['brisk-lab-seeds.md', 'olive-jars-repeat.md'])
  const fragment = path.join(dir, '.changeset', 'brisk-lab-seeds.md')
  const before = readFileSync(fragment, 'utf8')
  try {
    mainVerdict(dir)
    assert.ok(existsSync(fragment), 'the fragment must still exist after a refusal')
    assert.equal(readFileSync(fragment, 'utf8'), before)
    assert.ok(existsSync(path.join(dir, '.changeset', 'olive-jars-repeat.md')))
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: `readChangesets` reads `.changeset/pre/` too, so a fragment parked there is consumed by
// the next `changeset version` exactly as a top-level one is. A gate that walked only the top
// level would exit 0 over a directory that still has something to leave behind.
test('main(rootDir): a fragment under .changeset/pre/ is reported, named through its subdirectory', () => {
  const dir = buildFixture(['README.md', 'pre/tidy-moons-describe.md'])
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /\.changeset\/pre\/tidy-moons-describe\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ---------------------------------------------------------------------------------------------
// The active pre-release exemption. `@changesets/apply-release-plan@8.0.0` renames a consumed
// fragment to `.changeset/pre/<id>.md` instead of deleting it when `.changeset/pre.json` reads
// `mode: "pre"`, so a `pre/` entry under that condition is the tool's own parked record for the
// eventual exit version, not a fragment this release path is leaving behind.
// ---------------------------------------------------------------------------------------------

// ROW: this is the exemption itself. Before this file's fix it was RED (a pre/ fragment was
// unconditionally pending); it must be GREEN once the mode==="pre" filter exists.
test('main(rootDir): a pre/ fragment is exempt while .changeset/pre.json reads mode "pre"', () => {
  const dir = buildFixture(['pre/tidy-moons-describe.md'])
  writeFileSync(
    path.join(dir, '.changeset', 'pre.json'),
    JSON.stringify({ mode: 'pre', changesets: [], initialVersions: {} }),
  )
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 0, out)
    assert.match(out, /No pending changeset fragments/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: the exemption is scoped to pre/ entries only. A mutant that read "pre mode active" as
// "nothing in .changeset/ is pending" would pass the row above and miss this one: a top-level
// fragment describes work not yet folded into any pre.json record, so it must stay pending even
// while pre mode is active.
test('main(rootDir): a top-level fragment stays pending even while pre mode is active', () => {
  const dir = buildFixture(['brisk-lab-seeds.md'])
  writeFileSync(
    path.join(dir, '.changeset', 'pre.json'),
    JSON.stringify({ mode: 'pre', changesets: [], initialVersions: {} }),
  )
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /\.changeset\/brisk-lab-seeds\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: the exemption cannot widen past what pre.json actually declares. No pre.json at all means
// this root is not in pre-release mode, so a pre/ entry is exactly as pending as it always was --
// a mutant that exempted any `pre/`-prefixed name unconditionally would pass every row above and
// fail only this one.
test('main(rootDir): a pre/ fragment with no pre.json at all is still pending', () => {
  const dir = buildFixture(['pre/tidy-moons-describe.md'])
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /\.changeset\/pre\/tidy-moons-describe\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: "exit" is the other mode token `readPreState` can produce, and it means pre-release mode
// has ENDED, so a pre/ entry under it is not the active-pre-mode record the exemption is for and
// must still be reported pending. Catches a mutant that checks only "does pre.json exist" rather
// than its actual mode value.
test('main(rootDir): a pre/ fragment stays pending when pre.json reads mode "exit"', () => {
  const dir = buildFixture(['pre/tidy-moons-describe.md'])
  writeFileSync(
    path.join(dir, '.changeset', 'pre.json'),
    JSON.stringify({ mode: 'exit', changesets: [] }),
  )
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /\.changeset\/pre\/tidy-moons-describe\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: an unparsable pre.json must not open the exemption either -- the docblock's own CLOSED
// direction. A mutant that treated "pre.json exists" (parse failure or not) as "pre mode active"
// would pass every row above and fail only this one.
test('main(rootDir): a pre/ fragment stays pending when pre.json cannot be parsed', () => {
  const dir = buildFixture(['pre/tidy-moons-describe.md'])
  writeFileSync(path.join(dir, '.changeset', 'pre.json'), '{not valid json')
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /\.changeset\/pre\/tidy-moons-describe\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: a pre.json that cannot be READ AT ALL is a third shape, distinct from absent and from
// unparsable, and it reaches a different `catch` in `isPreReleaseModeActive`. A directory at that
// path makes `readFileSync` throw EISDIR, which is the deterministic stand-in for the EACCES case
// (a permission fixture is not reproducible under every runner, an EISDIR one is). The exemption
// must stay shut: a mutant whose read failure returned `true` rather than `false` -- the
// fail-OPEN direction, the only one that can hurt -- passes every other row in this file and
// fails only this one.
test('main(rootDir): a pre/ fragment stays pending when pre.json cannot be read at all', () => {
  const dir = buildFixture(['pre/tidy-moons-describe.md'])
  mkdirSync(path.join(dir, '.changeset', 'pre.json'))
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.match(out, /\.changeset\/pre\/tidy-moons-describe\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: fail CLOSED. A root with no `.changeset/` at all is a root this check could not read, and
// "nothing to list" must not be reported as "nothing pending" -- that is the shape that would let
// a misconfigured or relocated release path publish with the gate reporting success.
test('main(rootDir): a missing .changeset directory fails loudly instead of passing', () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'pending-changesets-')))
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.ok(out.includes(UNREADABLE_CHANGESET_DIR_HEADER), out)
    assert.ok(out.includes(UNREADABLE_CHANGESET_DIR_REMEDY), out)
    assert.ok(!out.includes('No pending changeset fragments'), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: pins the non-ENOENT rethrow specifically. `.changeset/pre` existing as a REGULAR FILE
// makes `readdirSync(.../pre)` throw ENOTDIR, not ENOENT, so `listChangesetDirEntries`'s
// `if (error.code !== 'ENOENT') throw error` must let it propagate into `main`'s fail-closed
// branch. If that condition were ever dropped to a bare swallow (every error treated as "no
// pre/"), this would report either success or the ordinary top-level result instead of the
// unreadable-directory failure.
test('main(rootDir): .changeset/pre existing as a regular file fails closed, not silently', () => {
  const dir = buildFixture(['README.md'])
  writeFileSync(path.join(dir, '.changeset', 'pre'), 'not a directory\n')
  try {
    const { exitCode, out } = mainVerdict(dir)
    assert.equal(exitCode, 1, out)
    assert.ok(out.includes(UNREADABLE_CHANGESET_DIR_HEADER), out)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ROW: the real file, run as a real process, so the main guard is proven to FIRE rather than the
// script exiting 0 having printed nothing (a known lesson: the exit code alone cannot tell a
// clean pass from a guard that never ran, and the tell is the expected output being absent).
test('the real script run as a process refuses over a fixture holding a fragment', () => {
  const dir = buildFixture(['README.md', 'brisk-lab-seeds.md'])
  try {
    const { out, status } = runScriptIn(dir)
    assert.equal(status, 1, out)
    assert.ok(out.includes(PENDING_CHANGESET_HEADER), out)
    assert.match(out, /\.changeset\/brisk-lab-seeds\.md/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('the real script run as a process exits 0 and prints its success line over a clean fixture', () => {
  const dir = buildFixture(['README.md'])
  try {
    const { out, status } = runScriptIn(dir)
    assert.equal(status, 0, out)
    assert.match(out, /No pending changeset fragments/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// ---------------------------------------------------------------------------------------------
// The wiring. A gate nothing invokes is not a gate, and this one is invoked from exactly one
// place -- the root `release` script -- rather than from `scripts:check`/`ci:check`, because a
// pending fragment is CORRECT during ordinary development and wrong only at the moment of
// publish. Wiring it into `ci:check` would red every pull request that properly files one.
// ---------------------------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function rootScripts() {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts
}

test('the release script runs this gate, and runs it before the staging step', () => {
  const release = rootScripts().release
  const gateIndex = release.indexOf('check-no-pending-changesets.mjs')
  const stageIndex = release.indexOf('node scripts/stage-release.mjs')
  assert.ok(gateIndex !== -1, `release must run this gate; it reads: ${release}`)
  assert.ok(stageIndex !== -1, `release must run the staging step; it reads: ${release}`)
  assert.ok(
    gateIndex < stageIndex,
    `the gate must run BEFORE the staging step; release reads: ${release}`,
  )
})

// ROW: pins the SHELL SEMANTICS of the wiring, not just substring order. `indexOf` above passes
// against a mutant like `"node scripts/check-no-pending-changesets.mjs || true && turbo run
// build && ... && node scripts/stage-release.mjs"`, where `|| true` swallows the gate's non-zero exit and the
// release proceeds regardless. Splitting `release` on `' && '` and requiring one WHOLE trimmed
// token to equal the invocation exactly catches that: the mutant's token is the invocation PLUS
// `|| true`, which is not a member of this list.
test('the gate is its own whole && token in release, not merely a substring of one', () => {
  const release = rootScripts().release
  const tokens = release.split(' && ').map((token) => token.trim())
  assert.ok(
    tokens.includes('node scripts/check-no-pending-changesets.mjs'),
    `release must run the gate as its own && token, with nothing appended to its exit status; release reads: ${release}`,
  )
})

// ROW: pins FIRST ahead of the BUILD specifically, not only ahead of the staging step (which
// the row above already covers). The header's own placement rationale is that a full workspace
// build must not be spent on a release this gate was always going to refuse; a mutant that moved
// the gate to run after `turbo run build` but still before the staging step would pass the row
// above and fail only this one.
test('the gate runs before turbo run build, not merely before the staging step', () => {
  const release = rootScripts().release
  assert.ok(
    release.indexOf('check-no-pending-changesets.mjs') < release.indexOf('turbo run build'),
    `the gate must run before the build; release reads: ${release}`,
  )
})

// ROW: the other half of the placement, and the one that fails silently. If this gate were added
// to `scripts:check` it would red `ci:check` on every branch carrying a changeset -- a
// known trap, a check that is red for a reason nobody can clear and that therefore
// teaches its readers to skip it.
test('this gate is NOT wired into scripts:check, where a pending fragment is lawful', () => {
  const scripts = rootScripts()
  assert.ok(!scripts['scripts:check'].includes('check-no-pending-changesets.mjs'))
  assert.ok(!scripts['ci:check'].includes('check-no-pending-changesets.mjs'))
})
