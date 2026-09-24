import assert from 'node:assert/strict'
/**
 * Every gate script in this repository (plus the protected-writes hook) used to end
 * with `if (import.meta.url === \`file://${process.argv[1]}\`) { main() }`. `import.meta.url`
 * is percent-encoded and `process.argv[1]` is a raw path, so the two silently disagree the
 * moment the checkout path contains a character that URL-encodes (a space, for one) — the
 * guard never fires, `main()` never runs, and the script exits 0 having printed nothing.
 * `pnpm run scripts:check` would report success without a single gate having executed.
 *
 * WHAT THIS FILE SWEEPS, AND WHAT IT DOES NOT — stated because three different totals for
 * "the guarded scripts" are in circulation and none of them used to say what it counted.
 * `scriptFiles` walks `<repo>/scripts` recursively and keeps every `.mjs` that is not a
 * `.test.mjs`: FOURTEEN files today, being the TWELVE gates `package.json`'s `scripts:check`
 * chains, plus two files that chain does not run — the release-path
 * `check-no-pending-changesets.mjs` (wired into the root `release` script
 * alone), and the `readme-sections.mjs` helper module, which has no
 * `main()` at all (see `hasMainEntryPoint` below, whose whole reason for existing is that such
 * a file must not be forced to grow a guard). Recounted when a fifteenth file, a report-only
 * script, was deleted from this directory; the assertions below pin only
 * a FLOOR, so this number is documentation and a drifted one is a doc defect, not a coverage
 * hole.
 *
 * The DEFECT CLASS is larger than the swept set, and this file is not evidence the class is
 * closed. `packages/core/scripts/build-css.ts` carries the same comparison (spelled `isMain`
 * rather than `main()`, which does not exempt it: the class is the COMPARISON, not the binding
 * name), was fixed under a separate change, and is invisible here twice over (wrong
 * directory, wrong extension) — so the class is FOURTEEN and this file enforces THIRTEEN of
 * it, the single gap being that file. The class is NOT the swept set, and the two FOURTEENs in
 * this docblock are different sets: the sweep is fourteen files including `readme-sections.mjs`
 * and excluding `build-css.ts`, the class is fourteen members the other way round, because a
 * file with no entry point and no guard cannot exhibit the defect at all. Everything under a
 * `packages/<name>/scripts/` directory is unenforced territory; widening the sweep to reach
 * it is tracked separately and is a design call about the sweep's subject, not a regex
 * change. (Spelled `<name>` rather than with a star, because a star-slash inside a docblock
 * closes it.)
 *
 * This file proves the fix seven ways, none of which depends on the real scripts' own
 * relative-path assumptions (they resolve their ROOT from their own location under
 * `scripts/`, which a copy into a scratch directory would break for unrelated reasons):
 *
 *   1. A STATIC ABSENCE sweep over the source of every real `.mjs` under `scripts/`,
 *      recursively: every such file ON DISK, tracked or not, since `scriptFiles` walks the
 *      directory rather than asking git. It asserts none of them carries the broken template
 *      form any longer — a regression guard against a new script (or a tidy-up)
 *      reintroducing it, including one not yet committed.
 *   2. A FUNCTIONAL demonstration against two small, self-contained fixture scripts (the old
 *      guard shape and the fixed one), run from a directory whose path genuinely contains a
 *      space, at its PHYSICAL location. `/tmp` on macOS is a symlink to `/private/tmp`, and
 *      `import.meta.url` resolves through that symlink while a path built from
 *      `process.argv[1]` alone would not — using the physical path is what makes this a test
 *      of the SPACE, not an accidental second test of the symlink.
 *   3. A STATIC PRESENCE sweep (a round-2 review finding) over the same real
 *      files, asserting each one that defines a `main()` entry point carries the one correct
 *      guard VERBATIM — not merely that it lacks the old broken template. Absence-only misses
 *      the naive `pathToFileURL(process.argv[1]).href` form (the load-bearing
 *      `process.argv[1] &&` limb dropped), any third form, and a new script shipped with no
 *      guard at all: all three pass an absence check and all three are the same class of
 *      defect the presence check exists to catch.
 *   4. A REAL-FILE subprocess import (the same round-2 finding) of each of the
 *      fifteen swept files with `process.argv[1]` left undefined — the exact shape
 *      `node -e "import(...)"` produces and the shape `node --test` can never construct for a
 *      file other than its own, since `node --test` always sets `argv[1]` to the invoking
 *      test file's own path. Sweep 3 checks the SOURCE TEXT; this checks that the REAL FILE
 *      actually loads with `argv[1]` undefined, closing the gap an in-process import (which
 *      could never fail this way) would leave open. That is ONE of the TWO conditions the
 *      guard now exists to handle: item 5 below adds the second (a SYMLINKED invocation
 *      path), and no test here evaluates that second condition against a real file — only
 *      against fixtures, for the ROOT-resolution reason stated above. Do not read item 4 as
 *      real-file evidence for the symlink half.
 *   5. A follow-up fix: the fix above closed the SPACE character class, and a SEPARATE
 *      class survived it — `pathToFileURL(process.argv[1]).href` still disagrees with
 *      `import.meta.url` when the invoking path carries a SYMLINKED component, because Node
 *      resolves `import.meta.url` through the symlink and leaves `process.argv[1]` exactly
 *      as given. A fixture reached through a real symlink (not merely a physically-resolved
 *      directory, which is what fixtures 2/3 above already use to isolate the SPACE case from
 *      this one) reproduces this a second way; comparing REALPATHS on both sides, which the
 *      real scripts now do, closes it. The symlink in that fixture is built under
 *      `realpathSync(tmpdir())`, so it is the ONLY symlinked component of the path on every
 *      platform: on macOS `os.tmpdir()` itself sits under `/var` -> `/private/var`, and a
 *      fixture built on the raw `tmpdir()` would keep reproducing the defect with the explicit
 *      `symlinkSync` deleted — green locally, red only on `ubuntu-latest`, whose `/tmp` is
 *      physical. Each symlink test asserts the parent is physical for the same reason.
 *   6. A REAL-FILE subprocess import of each swept file with `process.argv[1]` set to a path
 *      that EXISTS and is NOT the swept file (a scratch probe script that does the importing),
 *      so the guard EXPRESSION is evaluated in full — both `realpathSync` calls run and the
 *      comparison is false — rather than short-circuited at the `process.argv[1] &&` limb the
 *      way item 4 leaves it. Item 4 cannot see a swept file whose guard TEXT is correct but
 *      whose `realpathSync`/`fileURLToPath` import is missing: the limb short-circuits before
 *      the missing binding is touched, and the file crashes with a `ReferenceError` only when
 *      actually run. Today the sibling `*.test.mjs` files run every swept file for real and
 *      would catch that; a new script shipped without a sibling test would not be caught by
 *      anything but this. It is still NOT real-file evidence for the symlink half (item 4's
 *      caveat stands): it evaluates the expression, it does not invoke through a symlink.
 *   7. The ONE shape where the realpath mechanism is louder than the pre-#426 form, pinned so
 *      it is a known cost and not a surprise: `node -e "<code>" <positional>` puts the
 *      positional in `process.argv[1]`, and a swept file imported by that code then calls
 *      `realpathSync(<positional>)`, which throws `ENOENT` when the positional is not a path
 *      that exists. No runner in this repo produces that shape — `scripts:check` runs each
 *      gate as its own `argv[1]`, and `scripts:test` is `node --test` — and the pre-#426
 *      `pathToFileURL` form was silent under it, which is not better. The throw belongs to
 *      the mechanism, not to any one file; a tracked follow-up item covers re-deriving the
 *      mechanism (`import.meta.main`), which would remove it.
 */
import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPTS_DIR = path.join(ROOT, 'scripts')

// The exact broken form, as a string rather than a regex literal, so this file's own source
// does not itself start matching the pattern it is checking for.
const BROKEN_GUARD = 'import.meta.url === `file://${process.argv[1]}`'

// Recursive by construction (a round-3 review finding): the file set derives
// from what is actually on disk under scripts/, not from a naming of known directories, so a
// script landing in any future subdirectory is swept the same as scripts/*.mjs is today. That
// property is why a later removal of scripts/hooks/ needed no change here beyond
// wording: the sweep followed the tree rather than an enumeration of it.
function scriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return scriptFiles(full)
    if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) return [full]
    return []
  })
}

test('no scripts/**/*.mjs source carries the broken file://${argv[1]} guard', () => {
  const files = scriptFiles(SCRIPTS_DIR)
  assert.ok(files.length >= 12, `expected at least 12 script files, found ${files.length}`)
  const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(BROKEN_GUARD))
  assert.deepEqual(offenders, [], `still using the broken guard: ${offenders.join(', ')}`)
})

/**
 * A physical (symlink-resolved) directory whose own path contains a space, so a script
 * placed inside it reproduces the exact divergence between `import.meta.url` (percent-
 * encoded) and a raw `process.argv[1]`.
 */
function spacedScratchDir() {
  const made = mkdtempSync(path.join(tmpdir(), 'nave-292-'))
  const physical = realpathSync(made)
  const spaced = path.join(physical, 'with space')
  mkdirSync(spaced)
  return spaced
}

const OLD_GUARD_FIXTURE = `
console.log('BEFORE_GUARD')
function main() { console.log('MAIN_RAN') }
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  main()
}
`

const NEW_GUARD_FIXTURE = `
import { pathToFileURL } from 'node:url'
console.log('BEFORE_GUARD')
function main() { console.log('MAIN_RAN') }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
`

/**
 * Runs one fixture at a CALLER-SUPPLIED directory under a caller-supplied filename, so a
 * defect fixture and its positive control can be run at the SAME path rather than at two
 * different paths that merely share a shape. Two fixtures at one path is what makes each of
 * them a check on the other: the negative proves the hazard is present at that exact path,
 * and the positive proves the fix survives it, so neither can quietly stop testing anything.
 */
function runFixtureNamed(dir, name, source) {
  const file = path.join(dir, name)
  writeFileSync(file, source)
  return execFileSync(process.execPath, [file], { encoding: 'utf8' })
}

test('at one identical path containing a SPACE, the old template guard skips main() and the fixed guard runs it', () => {
  const dir = spacedScratchDir()
  // Assert the fixture's own properties INSIDE the test, so a helper that silently stops
  // producing what this title names fails HERE by name rather than leaving a green test that
  // measures nothing (both hazards below get the same treatment).
  assert.ok(dir.includes(' '), `the fixture path must contain a space, got: ${dir}`)
  assert.equal(
    lstatSync(dir).isSymbolicLink(),
    false,
    'and must NOT itself be a symlink: spacedScratchDir realpaths its parent precisely so ' +
      'this stays a test of the SPACE and not an accidental second test of the symlink class',
  )
  assert.equal(
    runFixtureNamed(dir, 'old-guard.mjs', OLD_GUARD_FIXTURE),
    'BEFORE_GUARD\n',
    'MAIN_RAN should be absent: this is the defect',
  )
  assert.equal(
    runFixtureNamed(dir, 'new-guard.mjs', NEW_GUARD_FIXTURE),
    'BEFORE_GUARD\nMAIN_RAN\n',
    'and the fixed guard must run main() at that same path',
  )
})

test('the fixed guard does not throw when argv[1] is undefined (imported, not run)', () => {
  // `node -e "<code>"` with no further positional argument leaves `process.argv[1]`
  // undefined — the shape `check-adr-structure.mjs` hits for real whenever another module
  // imports its `parseFrontmatter` export rather than running it as an entry point.
  const dir = spacedScratchDir()
  const file = path.join(dir, 'fixture.mjs')
  writeFileSync(file, NEW_GUARD_FIXTURE)
  const fileUrl = new URL(`file://${encodeURI(file)}`).href
  const stdout = execFileSync(
    process.execPath,
    ['-e', `await import(${JSON.stringify(fileUrl)})`],
    { encoding: 'utf8' },
  )
  assert.equal(
    stdout,
    'BEFORE_GUARD\n',
    'imported, not run: main() must not fire, and must not throw',
  )
})

// Note the subject: this is the NAIVE `pathToFileURL(process.argv[1]).href` form (the
// `process.argv[1] &&` limb dropped), not `OLD_GUARD_FIXTURE`'s template form — the template
// form builds the string `file://undefined` and does not throw at all. The title used to say
// "the OLD guard shape", which names the wrong fixture.
test('the NAIVE pathToFileURL guard (argv[1] limb dropped) THROWS ERR_INVALID_ARG_TYPE when argv[1] is undefined', () => {
  const dir = spacedScratchDir()
  const file = path.join(dir, 'fixture.mjs')
  const naivePathToFileURLFixture = `
import { pathToFileURL } from 'node:url'
console.log('BEFORE_GUARD')
function main() { console.log('MAIN_RAN') }
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
`
  writeFileSync(file, naivePathToFileURLFixture)
  const fileUrl = new URL(`file://${encodeURI(file)}`).href
  assert.throws(() => {
    execFileSync(process.execPath, ['-e', `await import(${JSON.stringify(fileUrl)})`], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  }, /ERR_INVALID_ARG_TYPE/)
})

// --- The SYMLINK class, which the earlier "fixed" pathToFileURL guard did
// not close. A SEPARATE CLASS from the SPACE case above (per docblock item 5), and not a
// character class: nothing about the path's character set is involved, only whether a
// component of it is a symlink Node resolves on one side of the comparison and not the
// other. ---

/**
 * A directory reached through a real symlink: `dir` itself is a symlink (not merely a path
 * that happens to have one resolved ancestor, which is what `spacedScratchDir` already
 * normalises away via `realpathSync`). A script placed inside it and invoked BY the symlink
 * path reproduces the exact divergence `pathToFileURL(process.argv[1]).href` misses: Node
 * resolves `import.meta.url` through the symlink, `process.argv[1]` stays exactly as given.
 *
 * Both scratch directories are made under `realpathSync(tmpdir())`, NOT the raw `tmpdir()`,
 * so the `symlinkSync` below is the ONLY symlinked component of the returned path on every
 * platform. On macOS `os.tmpdir()` is `/var/folders/...` and `/var` is itself a symlink to
 * `/private/var`; built on the raw `tmpdir()`, the fixture reproduced the defect through THAT
 * symlink whether or not this function made one, so deleting the `symlinkSync` left every
 * symlink test green on a Mac and red only on `ubuntu-latest`, whose `/tmp` is physical
 * (measured: 11/11 locally with the symlink and both `lstatSync` assertions removed).
 * `assertSoleSymlinkComponent` below is the in-test check that this stays true.
 */
function symlinkedScratchDir() {
  const physicalTmp = realpathSync(tmpdir())
  const real = mkdtempSync(path.join(physicalTmp, 'nave-426-real-'))
  const linkParent = mkdtempSync(path.join(physicalTmp, 'nave-426-link-'))
  const link = path.join(linkParent, 'via-symlink')
  symlinkSync(real, link)
  return link
}

/**
 * Asserts, INSIDE a test, that `link` is a symlink AND that everything above it is physical,
 * so the hazard each symlink test names is exactly the one `symlinkedScratchDir` made and not
 * one the platform's temp directory happened to supply. Without the second limb, the
 * fixture's symlink-ness would be a property of the machine on macOS and of this file only on
 * `ubuntu-latest`, and a macOS-only edit could delete the fixture's symlink without a local
 * test turning red.
 */
function assertSoleSymlinkComponent(link) {
  assert.ok(
    lstatSync(link).isSymbolicLink(),
    `the fixture path's final component must really be a symlink, got: ${link}`,
  )
  const parent = path.dirname(link)
  assert.equal(
    realpathSync(parent),
    parent,
    `everything above the fixture symlink must be physical, so the symlink under test is the ` +
      `one this file made and not one supplied by os.tmpdir(): ${parent}`,
  )
}

const PATHTOFILEURL_GUARD_FIXTURE = `
import { pathToFileURL } from 'node:url'
console.log('BEFORE_GUARD')
function main() { console.log('MAIN_RAN') }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
`

const REALPATH_GUARD_FIXTURE = `
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
console.log('BEFORE_GUARD')
function main() { console.log('MAIN_RAN') }
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main()
}
`

test('at one identical SYMLINKED path, the pre-fix pathToFileURL guard skips main() and the realpath guard runs it', () => {
  const dir = symlinkedScratchDir()
  assertSoleSymlinkComponent(dir)
  assert.equal(
    runFixtureNamed(dir, 'pathtofileurl-guard.mjs', PATHTOFILEURL_GUARD_FIXTURE),
    'BEFORE_GUARD\n',
    'MAIN_RAN should be absent: this is the defect',
  )
  assert.equal(
    runFixtureNamed(dir, 'realpath-guard.mjs', REALPATH_GUARD_FIXTURE),
    'BEFORE_GUARD\nMAIN_RAN\n',
    'and the realpath guard must run main() at that same symlinked path',
  )
})

test('at one identical path that is BOTH symlinked and contains a SPACE, the same pair holds (both hazards at once)', () => {
  const base = symlinkedScratchDir()
  const spaced = path.join(base, 'with space')
  mkdirSync(spaced)
  assertSoleSymlinkComponent(base)
  assert.ok(spaced.includes(' '), `the fixture path must contain a space, got: ${spaced}`)
  assert.equal(
    runFixtureNamed(spaced, 'pathtofileurl-guard.mjs', PATHTOFILEURL_GUARD_FIXTURE),
    'BEFORE_GUARD\n',
    'the pre-#426 guard must still be defeated when both hazards are present at once',
  )
  assert.equal(
    runFixtureNamed(spaced, 'realpath-guard.mjs', REALPATH_GUARD_FIXTURE),
    'BEFORE_GUARD\nMAIN_RAN\n',
    'and the realpath guard must run main() at that same doubly-hazardous path',
  )
})

test('the realpath guard does not throw when argv[1] is undefined (imported, not run)', () => {
  const dir = symlinkedScratchDir()
  const file = path.join(dir, 'fixture.mjs')
  writeFileSync(file, REALPATH_GUARD_FIXTURE)
  const fileUrl = new URL(`file://${encodeURI(file)}`).href
  const stdout = execFileSync(
    process.execPath,
    ['-e', `await import(${JSON.stringify(fileUrl)})`],
    { encoding: 'utf8' },
  )
  assert.equal(
    stdout,
    'BEFORE_GUARD\n',
    'imported, not run: main() must not fire, and must not throw',
  )
})

/**
 * Runs `node -e "await import(<url>)" <positional>`: the `-e` shape with ONE positional
 * argument, which Node places in `process.argv[1]`. Inside the imported fixture the guard's
 * `argv[1]` limb is therefore truthy and `realpathSync(<positional>)` is evaluated for real.
 * Returns stdout and stderr together, since the point of the callers is which of the two a
 * given guard mechanism writes to under this shape.
 */
function importWithPositionalArgv1(file, positional) {
  const fileUrl = pathToFileURL(file).href
  try {
    const stdout = execFileSync(
      process.execPath,
      ['-e', `await import(${JSON.stringify(fileUrl)})`, positional],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { stdout, stderr: '' }
  } catch (error) {
    return { stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

// 🔵 (a principal-engineer review finding): the realpath mechanism's one new failure path,
// pinned rather than left latent. Under `node -e "<code>" <positional>` the positional lands
// in `argv[1]`, so a swept file imported by that code evaluates `realpathSync(<positional>)`
// and throws `ENOENT` when it names nothing on disk. No runner in this repo produces that
// shape, and the earlier `pathToFileURL` form (before the realpath fix) was SILENT under it
// (pinned as the second half below), so this is the mechanism trading a silent skip for a
// loud throw in a shape nobody uses — a cost worth knowing, not a regression. A tracked
// follow-up item covers re-deriving the mechanism (`import.meta.main`), which has no such
// path; whoever lands that should retire this test deliberately rather than find it failing.
test('under `node -e "<code>" <nonexistent positional>` the realpath guard THROWS ENOENT after loading, where the pre-fix form skipped silently', () => {
  const dir = spacedScratchDir()
  const positional = path.join(dir, 'names-nothing-on-disk')
  assert.throws(() => lstatSync(positional), /ENOENT/, 'the positional must not exist')

  const realpathFile = path.join(dir, 'realpath-guard.mjs')
  writeFileSync(realpathFile, REALPATH_GUARD_FIXTURE)
  const realpath = importWithPositionalArgv1(realpathFile, positional)
  assert.equal(
    realpath.stdout,
    'BEFORE_GUARD\n',
    'the module body must have loaded before the guard threw: the throw is IN the guard',
  )
  assert.match(
    realpath.stderr,
    /ENOENT/,
    'the realpath guard must fail loudly with ENOENT on the nonexistent positional',
  )
  assert.doesNotMatch(realpath.stdout, /MAIN_RAN/, 'and main() must not have fired')

  const pathToFileURLFile = path.join(dir, 'pathtofileurl-guard.mjs')
  writeFileSync(pathToFileURLFile, PATHTOFILEURL_GUARD_FIXTURE)
  const pathToFileURLForm = importWithPositionalArgv1(pathToFileURLFile, positional)
  assert.deepEqual(
    pathToFileURLForm,
    { stdout: 'BEFORE_GUARD\n', stderr: '' },
    'the pre-#426 form skips main() silently under the same shape: the cost pinned above is ' +
      'loudness, not a behaviour the older mechanism got right',
  )
})

// --- A round-2 review finding: presence check + real-file subprocess import ---

/**
 * The correct guard's ESSENTIAL shape, tolerant of whitespace/line-break reformatting and of
 * the `!== undefined` truthy-check spelling — both functionally identical to `&&` here, since
 * `process.argv[1]` is either a non-empty string or `undefined`.
 *
 * A follow-up fix: the pinned shape now compares REALPATHS on both sides
 * (`realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])`), not
 * `import.meta.url === pathToFileURL(process.argv[1]).href` — the older form is now itself an
 * offender (proven vulnerable to the symlink class above), which is why it is no longer
 * accepted here and the real scripts no longer use it.
 *
 * 🔵 nit (a quality-review finding): the prior version of this check was a
 * byte-exact `source.includes(CORRECT_GUARD)`, which flagged a legitimate `!== undefined`
 * variant or a guard reformatted across several lines as an "offender" even though both run
 * identically to the pinned form. That review rated this maintenance fragility only, not a
 * coverage hole: the paired real-file subprocess import below (finding A's other half) still
 * passes a functionally correct variant clean, so no live defect was ever let through by the
 * false positive — but a legitimate reformat would have broken CI on this check alone, which
 * this pattern fixes. Whitespace is normalised to single spaces before matching, so a guard
 * split across lines still matches; the essential two-part structure (a truthy check on
 * `argv[1]`, THEN the realpath comparison) is still required, so a missing guard, the old
 * broken template, the pre-fix `pathToFileURL` form, or a naive form (this file's own
 * defect-return regression tests above) all still fail this check.
 */
const GUARD_PATTERN =
  /if\s*\(\s*process\.argv\[1\]\s*(?:&&|!==\s*undefined\s*&&)\s*realpathSync\(fileURLToPath\(import\.meta\.url\)\)\s*===\s*realpathSync\(process\.argv\[1\]\)\s*\)\s*\{/

function hasCorrectGuard(source) {
  return GUARD_PATTERN.test(source.replaceAll(/\s+/g, ' '))
}

/**
 * Whether a swept file declares a `main()` entry point at module scope. This is the honest
 * line between "needs a guard" and "does not", and BOTH of its arms are live against the real
 * corpus: of the fifteen files swept today, FOURTEEN are runnable checks that define `main()`
 * and this returns true for them, and ONE does not — `readme-sections.mjs`, a helper module of
 * exported functions with no entry point and nothing for `pnpm run scripts:check` to invoke
 * directly — so this returns false and the presence sweep skips it, which is correct. The
 * exemption is exercised, not reserved for a hypothetical future file: a pure-utility `.mjs`
 * must not be forced to grow a no-op guard just to satisfy this test. Meanwhile a file that
 * DOES define `main()` and does NOT guard it correctly stays exactly the silent-no-op-check
 * defect this test exists to catch, and fails this test by name instead of silently passing an
 * absence-only sweep.
 *
 * This predicate is the SOLE GATE on that test, so its coverage is the coverage of the whole
 * enforcement mechanism: a spelling it does not recognise is a file the presence sweep never
 * examines, no matter how broken that file's guard is. It is therefore derived from the set
 * of ways THIS module system lets a module-scope binding named `main` be declared, not from
 * the one spelling the fourteen current entry points happen to use. THE COVERED SET, one
 * assertion per member in the tolerance test below:
 *
 *   function main(…)                     async function main(…)
 *   export function main(…)              export async function main(…)
 *   export default function main(…)      export default async function main(…)
 *   const | let | var main = …           export const | let | var main = …
 *
 * DELIBERATELY NOT COVERED, and the reason, so this is a boundary rather than a gap someone
 * later mistakes for one: an ANONYMOUS default export (`export default () => {}`) declares no
 * binding named `main` at all, so there is nothing for a guard footer of the shape this file
 * pins to call, and reading it as an entry point would make the predicate true of files with
 * no `main()` to guard. Anchoring every pattern to a line start (`^` under `m`) is likewise
 * deliberate: it is what keeps an indented, nested `function main(` inside another function,
 * and a ` * function main()` line inside a docblock, from being read as module-scope
 * declarations. Both are pinned as negative controls below, alongside a pure-utility module
 * with no entry point at all — without those, "widen the predicate" and "make the predicate
 * always true" are indistinguishable.
 */
const MAIN_ENTRY_POINT_PATTERNS = [
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+main\s*\(/m,
  /^(?:export\s+)?(?:const|let|var)\s+main\s*=/m,
]

function hasMainEntryPoint(source) {
  return MAIN_ENTRY_POINT_PATTERNS.some((pattern) => pattern.test(source))
}

test('every swept file that defines main() guards it with the exact correct form', () => {
  const files = scriptFiles(SCRIPTS_DIR)
  assert.ok(files.length >= 12, `expected at least 12 script files, found ${files.length}`)
  const offenders = files.filter((file) => {
    const source = readFileSync(file, 'utf8')
    return hasMainEntryPoint(source) && !hasCorrectGuard(source)
  })
  assert.deepEqual(
    offenders,
    [],
    `file(s) define main() but do not guard it with the exact correct form (missing, naive, ` +
      `or a third shape): ${offenders.join(', ')}`,
  )
})

// 🔵 nit follow-up: pins the tolerance itself, so a future edit cannot silently narrow
// GUARD_PATTERN back to a byte-exact match without a test naming the regression. The body
// covers two eras: the first four assertions predate the symlink fix
// (the tolerance itself, and the two earlier offender forms it must still reject), and the
// fifth is the symlink fix's own addition (the pre-fix pathToFileURL form is now an offender too).
test('GUARD_PATTERN tolerates a !== undefined variant and a reformatted guard, and still rejects every offender form', () => {
  assert.ok(
    hasCorrectGuard(
      'if (process.argv[1] !== undefined && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {',
    ),
    'the !== undefined variant is functionally identical and must not be flagged',
  )
  assert.ok(
    hasCorrectGuard(
      'if (\n  process.argv[1] &&\n  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])\n) {',
    ),
    'a guard reformatted across several lines must not be flagged',
  )
  assert.ok(
    !hasCorrectGuard(
      'if (realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {',
    ),
    'the naive form (missing the argv[1] truthy check) must still be flagged',
  )
  assert.ok(
    !hasCorrectGuard('if (import.meta.url === `file://${process.argv[1]}`) {'),
    'the old broken template form must still be flagged',
  )
  assert.ok(
    !hasCorrectGuard(
      'if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {',
    ),
    'the pre-fix pathToFileURL form must now be flagged too — it is the form proven vulnerable to the symlink class',
  )
})

// A follow-up review round: hasMainEntryPoint is the SOLE gate on the presence sweep above,
// so a spelling it misses is a file that sweep never examines. One assertion per covered
// spelling, so a future narrowing back to the one form the fourteen current entry points use
// fails a named test rather than silently reopening the hole. The prior predicate was
// `/^(async )?function main\(/m`: an `export function main()` entry point carrying the exact
// pre-#426 guard passed the whole suite while silently no-opping through a symlinked path.
test('hasMainEntryPoint recognises every module-scope spelling of a main() entry point, and nothing else', () => {
  const covered = [
    ['function main() {}', 'a plain function declaration'],
    ['async function main() {}', 'an async function declaration'],
    ['export function main() {}', 'a named export'],
    ['export async function main() {}', 'an async named export'],
    ['export default function main() {}', 'a named default export'],
    ['export default async function main() {}', 'an async named default export'],
    ['const main = () => {}', 'a const arrow binding'],
    ['const main = async () => {}', 'an async const arrow binding'],
    ['let main = function () {}', 'a let function-expression binding'],
    ['var main = function () {}', 'a var function-expression binding'],
    ['export const main = () => {}', 'an exported const arrow binding'],
    ['export let main = () => {}', 'an exported let binding'],
    ['export var main = () => {}', 'an exported var binding'],
    ['function main () {}', 'a space before the parameter list'],
    ['export const main = () => {}', 'the spelling a reviewer probed at (export + arrow)'],
  ]
  for (const [source, description] of covered) {
    assert.ok(
      hasMainEntryPoint(source),
      `${description} declares a main() entry point and must be swept: ${source}`,
    )
  }

  const notEntryPoints = [
    [
      "export function parseFrontmatter() {}\nexport const SLUG = 'x'\n",
      'a pure-utility module with no entry point (the case the predicate exists to exempt)',
    ],
    ['function maintain() {}', 'a different function whose name merely starts with "main"'],
    ['const mainList = []', 'a different binding whose name merely starts with "main"'],
    [
      'function wrapper() {\n  function main() {}\n}\n',
      'a nested, non-module-scope function main()',
    ],
    ['/**\n * function main() is described here\n */\n', 'a docblock mentioning function main()'],
  ]
  for (const [source, description] of notEntryPoints) {
    assert.ok(
      !hasMainEntryPoint(source),
      `${description} must NOT be read as a main() entry point: ${JSON.stringify(source)}`,
    )
  }
})

/**
 * Runs `node -e "import(<url>)"` in a fresh subprocess with NO positional script argument, so
 * `process.argv[1]` is genuinely undefined inside the imported module — the one shape
 * `node --test` can never construct for a file other than itself.
 *
 * This probe USED to justify itself by "the one shape the naive
 * `pathToFileURL(process.argv[1]).href` guard throws `ERR_INVALID_ARG_TYPE` on". That is
 * still true OF `pathToFileURL` (the fixture test above pins it), but it is no longer true of
 * any file this loop sweeps: the swept files compare realpaths now, so the failure a swept
 * file that lost its `argv[1]` limb produces here is `ENOENT`, not a type error.
 * `realpathSync(undefined)` does not reject a non-string: it coerces `undefined` to the
 * STRING `'undefined'` and resolves it against the CURRENT WORKING DIRECTORY, so it raises
 * `ENOENT` on `<cwd>/undefined` in the usual case and, in a cwd that happens to contain a
 * file of that name, returns a real path and does not throw at all (measured both ways). The
 * limb is still load-bearing in both cwds — it is what stops either outcome being reached —
 * but the mechanism is coercion, not a type check, so do not "correct" a real ENOENT failure
 * here by looking for a type error. Every one of the fifteen real swept files prints nothing
 * at module load — only branches inside their own `main()` call `console.log`/`console.error`,
 * and `readme-sections.mjs`, the one swept file with no `main()`, calls neither anywhere;
 * confirmed empirically against every file in this suite — so a correctly-guarded file
 * produces exactly this script's own sentinel on stdout, in the success branch, with nothing
 * ahead of it: a naive guard throws before the sentinel is ever written, and an accidental
 * `main()` firing would print its own output first and break the exact-equality assertion.
 */
function importWithUndefinedArgv1(file) {
  const url = pathToFileURL(file).href
  // Kept as three parts — the import, the success branch, the failure branch — because that is
  // what the assertions below read against. Joined rather than concatenated so `prefer-template`
  // does not fold them into one another as nested `${String.raw`…`}` interpolations.
  const probe = [
    `import(${JSON.stringify(url)})`,
    String.raw`.then(() => { process.stdout.write('IMPORT_SUCCEEDED\n') })`,
    String.raw`.catch((e) => { process.stderr.write('IMPORT_THREW:' + e.message + '\n'); process.exitCode = 1 })`,
  ].join('')
  try {
    return execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' })
  } catch (error) {
    // execFileSync throws when the child exits non-zero (the .catch branch above sets
    // process.exitCode = 1 on a throw). Return whatever landed on stdout before the throw
    // (normally nothing) so the assertion below reports a clean mismatch naming the file,
    // rather than an opaque child_process error.
    return error.stdout ?? ''
  }
}

test('every real swept file import()s cleanly with argv[1] undefined and main() never fires', () => {
  const files = scriptFiles(SCRIPTS_DIR)
  assert.ok(files.length >= 12, `expected at least 12 script files, found ${files.length}`)
  for (const file of files) {
    const stdout = importWithUndefinedArgv1(file)
    assert.equal(
      stdout,
      'IMPORT_SUCCEEDED\n',
      `${file}: import() must succeed with nothing printed before the sentinel (main() must ` +
        `not fire, and the guard must not throw — a swept file that dropped its ` +
        `process.argv[1] limb fails here with ENOENT on <cwd>/undefined, not with a type error)`,
    )
  }
})

// --- 🔵 (a principal-engineer review finding): evaluate every real swept file's guard
// EXPRESSION, not only its short-circuit ---

/**
 * Imports `file` from a scratch PROBE SCRIPT run as the entry point, so inside the swept file
 * `process.argv[1]` is the probe's own path: a string, a path that exists, and NOT the swept
 * file. The guard therefore evaluates in full — `realpathSync(fileURLToPath(import.meta.url))`
 * and `realpathSync(process.argv[1])` both run and compare unequal — and `main()` still does
 * not fire. This is the one shape that reaches a swept file's guard EXPRESSION without
 * invoking the file: `importWithUndefinedArgv1` above stops at the `argv[1] &&` limb, and
 * `node --test` sets `argv[1]` to the test file, which would fire `main()` only for the test
 * file itself. A swept file whose guard text is correct but whose `realpathSync` or
 * `fileURLToPath` import is missing passes the presence sweep and `importWithUndefinedArgv1`
 * and crashes only when run; here it fails with a `ReferenceError` naming the binding.
 *
 * The probe lives in a physical scratch directory (`spacedScratchDir`, chosen for its
 * `realpathSync`, not its space), so `realpathSync(process.argv[1])` in the swept file has a
 * real path to resolve and the only variable under test is the swept file's own guard.
 */
function importWithForeignArgv1(file) {
  const url = pathToFileURL(file).href
  const probe = path.join(spacedScratchDir(), 'probe-entry-point.mjs')
  writeFileSync(
    probe,
    `await import(${JSON.stringify(url)})\nprocess.stdout.write('IMPORT_SUCCEEDED\\n')\n`,
  )
  try {
    const stdout = execFileSync(process.execPath, [probe], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout, stderr: '' }
  } catch (error) {
    return { stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

test('every real swept file import()s cleanly with a FOREIGN argv[1], so its guard expression is evaluated in full and main() never fires', () => {
  const files = scriptFiles(SCRIPTS_DIR)
  assert.ok(files.length >= 12, `expected at least 12 script files, found ${files.length}`)
  for (const file of files) {
    const { stdout, stderr } = importWithForeignArgv1(file)
    assert.equal(
      stdout,
      'IMPORT_SUCCEEDED\n',
      `${file}: import() from a foreign entry point must succeed with nothing printed before ` +
        `the sentinel (main() must not fire, and the fully-evaluated guard must not throw; a ` +
        `swept file missing its realpathSync/fileURLToPath import fails here with a ` +
        `ReferenceError)\nstderr: ${stderr}`,
    )
  }
})

// The pairing that proves the test above binds the hazard it names, at fixture level: the SAME
// file passes the presence sweep and the undefined-argv[1] probe, and fails only this one.
// Without this, "the probe evaluates the guard expression" is a claim about the probe's
// construction and not a measured property.
const MISSING_IMPORT_GUARD_FIXTURE = `
import { fileURLToPath } from 'node:url'
console.log('BEFORE_GUARD')
function main() { console.log('MAIN_RAN') }
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main()
}
`

test('a guard with correct TEXT but a missing realpathSync import passes the presence sweep and the undefined-argv[1] probe, and only the foreign-argv[1] probe catches it', () => {
  assert.ok(
    hasMainEntryPoint(MISSING_IMPORT_GUARD_FIXTURE) &&
      hasCorrectGuard(MISSING_IMPORT_GUARD_FIXTURE),
    'the presence sweep must accept this fixture: its guard TEXT is the pinned form, which is ' +
      'exactly why text alone cannot catch the missing import',
  )

  const dir = spacedScratchDir()
  const missing = path.join(dir, 'missing-import-guard.mjs')
  writeFileSync(missing, MISSING_IMPORT_GUARD_FIXTURE)
  assert.equal(
    importWithUndefinedArgv1(missing),
    'BEFORE_GUARD\nIMPORT_SUCCEEDED\n',
    'the undefined-argv[1] probe must pass it: the && limb short-circuits before the missing ' +
      'binding is ever touched',
  )
  const foreign = importWithForeignArgv1(missing)
  assert.equal(foreign.stdout, 'BEFORE_GUARD\n', 'the module body loaded, then the guard ran')
  assert.match(
    foreign.stderr,
    /ReferenceError: realpathSync is not defined/,
    'and the foreign-argv[1] probe must fail on the missing binding by name',
  )

  const correct = path.join(dir, 'realpath-guard.mjs')
  writeFileSync(correct, REALPATH_GUARD_FIXTURE)
  assert.deepEqual(
    importWithForeignArgv1(correct),
    { stdout: 'BEFORE_GUARD\nIMPORT_SUCCEEDED\n', stderr: '' },
    'positive control: the same probe passes the correctly-imported guard at the same path',
  )
})
