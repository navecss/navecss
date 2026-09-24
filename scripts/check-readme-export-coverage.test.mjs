import assert from 'node:assert/strict'
/**
 * Coverage for check-readme-export-coverage.mjs, run with Node's
 * built-in test runner, in two layers.
 *
 * The first layer is the pure classification logic against synthetic fixtures, per the
 * same reasoning as check-license-parity.test.mjs: red/green evidence for the comparison
 * logic without depending on (or mutating) the real repo's package manifests or READMEs.
 *
 * The second layer drives the SHIPPED script as a child process against a throwaway
 * workspace. That layer exists because everything `main()` adds on top of the pure
 * predicate — the private-package limb, the two counters, the printed text and the exit
 * code — was reachable from no test at all: `main()` is not exported and runs only under
 * the entry-point guard, so deleting `process.exitCode = 1` (the gate stops gating) or
 * replacing the `isNonPrivate` limb with `continue` (the gate examines nothing and still
 * prints a reassuring line) each left the whole suite green.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { isNonPrivate } from './check-license-parity.mjs'
import {
  consumerFacingSpecifier,
  findUndocumentedSubpaths,
  inScopeExportKeys,
} from './check-readme-export-coverage.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = path.join(ROOT, 'packages')
const SCRIPT_NAME = 'check-readme-export-coverage.mjs'
const SIBLING_NAME = 'check-license-parity.mjs'

/**
 * A qualified tracker reference, `<slug>#<digits>`: what a bare number turns into when someone
 * "fixes" it by putting a repository in front of it.
 *
 * IT DELIBERATELY DOES NOT FENCE THE LEFT SIDE, and that is a reverted decision rather than an
 * omission, so the next reader does not re-attempt it. Unfenced, the shape accepts one known
 * false-positive class: the tail of a digit-initial URL fragment, `https://example.com/docs#3`.
 * That class is UNREACHABLE in this gate's stderr, because neither a CSS id selector nor an XML
 * id may begin with a digit and nothing it prints carries a fragment. A lookbehind keyed on `/`
 * was tried and reverted, because every slash-keyed fence also excludes the TWO-SEGMENT
 * spelling, `owner/repo#632` — which is reachable, and which the repository-wide bare-form guard
 * already skips by its own identical fence, so fencing here would leave that spelling seen by no
 * check in this repository at all. This gate prints package-relative PATHS and scoped package
 * SPECIFIERS, both full of slashes, which is where a slash-keyed fence would have bitten
 * hardest. An unreachable false positive is the cheaper of the two.
 */
const TRACKER_REFERENCE_PATTERN = /[\w-]+#\d+/

/**
 * The shape of the green line, with the counts left free: they are a property of the tree.
 * TWO lines: the census first, then the verdict closing on the presence-only caveat, which
 * is the clause a reader must not miss and so is the one the output ends on.
 */
const SUCCESS_LINE_SHAPE =
  /^README export coverage: \d+ subpath\(s\) across \d+ non-private package\(s\) examined; \d+ private package\(s\) carrying \d+ in-scope subpath\(s\) not examined, because a private package publishes no tarball\.\nEvery specifier is present as a whole name in its own package's README\.md — presence of the name only, never that the README describes it\.$/

/**
 * A throwaway workspace the SHIPPED script can be run against: a `scripts/` holding a copy
 * of the script and of the sibling it imports `isNonPrivate` from, plus a synthetic
 * `packages/` tree built from `packages` ({ dir: { manifest, readme } }; a null `readme`
 * writes no README.md at all).
 *
 * The temp root is realpath'd deliberately. On macOS `os.tmpdir()` is `/var/folders/...`, a
 * symlink to `/private/var/folders/...`. Under the pre-fix entry-point guard
 * (`import.meta.url`, which node realpaths, against `pathToFileURL(process.argv[1]).href`,
 * which it does not) a fixture reached through that symlink made `main()` never run and the
 * child exit 0 printing nothing, a vacuous pass indistinguishable from a real one
 * (a known lesson). The guard now realpaths both sides, so the symlink alone no longer skips
 * `main()`; the fixture stays on the physical path so the run here does not depend on it.
 */
function buildFixture(packages) {
  const dir = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'nave-readme-export-'))
  mkdirSync(path.join(dir, 'scripts'))
  for (const name of [SCRIPT_NAME, SIBLING_NAME]) {
    cpSync(path.join(ROOT, 'scripts', name), path.join(dir, 'scripts', name))
  }
  for (const [packageDir, { manifest, readme }] of Object.entries(packages)) {
    const packagePath = path.join(dir, 'packages', packageDir)
    mkdirSync(packagePath, { recursive: true })
    writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify(manifest, null, 2))
    if (readme !== null) {
      writeFileSync(path.join(packagePath, 'README.md'), readme)
    }
  }
  return dir
}

/**
 * Run the script as a child process from `cwd`'s root. Asserts the run PRODUCED something,
 * because the failure mode this whole layer guards against (the guard not firing) shows up
 * as exit 0 with no output at all, which passes any assertion written about a green run.
 */
function runScript(cwd) {
  const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
    cwd,
    encoding: 'utf8',
  })
  const printed = result.stdout + result.stderr
  assert.ok(
    printed.includes('README export coverage:'),
    `the child printed nothing recognisable, so main() did not run: ${JSON.stringify(printed)}`,
  )
  return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

test('consumerFacingSpecifier joins the package name and the subpath, dropping the leading dot', () => {
  assert.equal(consumerFacingSpecifier('@navecss/tokens', './css'), '@navecss/tokens/css')
  assert.equal(consumerFacingSpecifier('@navecss/core', './no-tokens'), '@navecss/core/no-tokens')
})

test('inScopeExportKeys keeps only literal reachable subpath keys, and excludes "." and "./package.json" by rule', () => {
  const manifest = {
    name: '@navecss/core',
    exports: {
      '.': './dist/index.js',
      './no-tokens': './dist/no-tokens.css',
      './cx': './dist/cx.js',
      './package.json': './package.json',
      './styles/*': './dist/styles/*.css',
      './internal': null,
    },
  }
  assert.deepEqual(inScopeExportKeys(manifest), ['./no-tokens', './cx'])
})

test('inScopeExportKeys limb 1: a top-level conditions object declares no subpath, so nothing is in scope', () => {
  // `{ "types": ..., "import": ... }` is a legal `exports` value and is sugar for `"."`.
  // Its keys are CONDITION names, not subpaths. Without the `./` requirement they are read
  // as subpaths and `consumerFacingSpecifier` slices the first character off each, so the
  // check demands `@navecss/x` + `ypes` / `mport` / `equire` — strings no honest README can
  // contain, and which its own printed remedy ("add a row naming the subpath") cannot fix.
  const manifest = {
    name: '@navecss/x',
    exports: {
      default: './dist/index.js',
      import: './dist/index.js',
      require: './dist/index.cjs',
      types: './dist/index.d.ts',
    },
  }
  assert.deepEqual(inScopeExportKeys(manifest), [])
  assert.deepEqual(findUndocumentedSubpaths(manifest, ''), [])
})

test('inScopeExportKeys limb 2: a subpath PATTERN is dropped, because `*` names no single specifier', () => {
  const manifest = { name: '@navecss/core', exports: { './styles/*': './dist/styles/*.css' } }
  assert.deepEqual(inScopeExportKeys(manifest), [])
  // Without the limb, a README documenting every file the pattern exposes is RED and the
  // only way to go green is to write a bare `@navecss/core/styles/*` into it.
  const readme = 'See `@navecss/core/styles/button` and `@navecss/core/styles/card`.'
  assert.deepEqual(findUndocumentedSubpaths(manifest, readme), [])
})

test('inScopeExportKeys limb 3: a null target is dropped, because it BLOCKS the subpath', () => {
  // `"./internal": null` is Node's way of making a subpath unreachable. Demanding that a
  // deliberately unreachable specifier be named in a README inverts the check's own job.
  const manifest = {
    name: '@navecss/core',
    exports: { '.': './dist/index.js', './cx': './dist/cx.js', './internal': null },
  }
  assert.deepEqual(inScopeExportKeys(manifest), ['./cx'])
  assert.deepEqual(findUndocumentedSubpaths(manifest, 'See `@navecss/core/cx`.'), [])
})

test('inScopeExportKeys returns nothing for a string or array exports field (no subpaths to enumerate)', () => {
  assert.deepEqual(inScopeExportKeys({ name: '@navecss/x', exports: './dist/index.js' }), [])
  assert.deepEqual(inScopeExportKeys({ name: '@navecss/x', exports: ['./a', './b'] }), [])
})

test('inScopeExportKeys returns nothing for a manifest with no exports field at all', () => {
  assert.deepEqual(inScopeExportKeys({ name: '@navecss/x' }), [])
})

test('findUndocumentedSubpaths: GREEN when the README mentions every in-scope subpath specifier', () => {
  const manifest = {
    name: '@navecss/tokens',
    exports: { '.': './dist/index.js', './css': './dist/tokens.css', './js': './dist/tokens.js' },
  }
  const readme =
    'Install `@navecss/tokens`. Also see `@navecss/tokens/css` and `@navecss/tokens/js`.'
  assert.deepEqual(findUndocumentedSubpaths(manifest, readme), [])
})

test('findUndocumentedSubpaths: RED names every missing specifier, not just the first', () => {
  const manifest = {
    name: '@navecss/core',
    exports: {
      '.': './dist/index.js',
      './no-tokens': './dist/no-tokens.css',
      './reset': './dist/reset.css',
      './cx': './dist/cx.js',
    },
  }
  const readme = 'Only `@navecss/core/cx` is mentioned here.'
  assert.deepEqual(findUndocumentedSubpaths(manifest, readme), [
    '@navecss/core/no-tokens',
    '@navecss/core/reset',
  ])
})

test('findUndocumentedSubpaths: the bare exports KEY appearing is not enough — the full specifier must be present', () => {
  // The exact shape this check is filed against: a README could plausibly contain the literal
  // substring "./css" (e.g. inside an unrelated file path) without documenting the export.
  const manifest = { name: '@navecss/tokens', exports: { '.': 'x', './css': './dist/tokens.css' } }
  const readme = 'See tokens.json or ./css/whatever for build config, unrelated to the export.'
  assert.deepEqual(findUndocumentedSubpaths(manifest, readme), ['@navecss/tokens/css'])
})

test('findUndocumentedSubpaths: a longer sibling name does not satisfy a shorter export', () => {
  // A plain substring test makes `@navecss/core/cx-extra` satisfy an undocumented `./cx`,
  // which is a false negative in the check's own core job, on a package that already ships
  // near-sibling names (`./atoms` beside `./atomic`).
  const manifest = { name: '@navecss/core', exports: { '.': 'x', './cx': './dist/cx.js' } }
  assert.deepEqual(findUndocumentedSubpaths(manifest, 'Only `@navecss/core/cx-extra` is here.'), [
    '@navecss/core/cx',
  ])
  // A deeper subpath is likewise a different specifier, not a mention of this one.
  assert.deepEqual(findUndocumentedSubpaths(manifest, 'See `@navecss/core/cx/legacy`.'), [
    '@navecss/core/cx',
  ])
  // Every form the two real READMEs actually use still counts, plus end of file.
  assert.deepEqual(findUndocumentedSubpaths(manifest, 'See `@navecss/core/cx`.'), [])
  assert.deepEqual(findUndocumentedSubpaths(manifest, "import { cx } from '@navecss/core/cx'"), [])
  assert.deepEqual(findUndocumentedSubpaths(manifest, '@navecss/core/cx'), [])
  // A bounded occurrence later in the file counts even after an unbounded one.
  assert.deepEqual(
    findUndocumentedSubpaths(manifest, '@navecss/core/cx-extra, `@navecss/core/cx`'),
    [],
  )
})

test('findUndocumentedSubpaths: "." is never checked, so a package with only the default export is vacuously clean', () => {
  const manifest = { name: '@navecss/cli', exports: { '.': './dist/index.js' } }
  assert.deepEqual(findUndocumentedSubpaths(manifest, ''), [])
})

test('findUndocumentedSubpaths: "./package.json" is never checked even though it is a real exports key', () => {
  const manifest = {
    name: '@navecss/core',
    exports: { '.': './dist/index.js', './package.json': './package.json' },
  }
  assert.deepEqual(findUndocumentedSubpaths(manifest, ''), [])
})

test('the real workspace passes today: every non-private package’s in-scope subpaths are named in its own README', () => {
  // Live, not synthetic: reads the real packages/ tree and applies the shipped predicate to
  // it. What this establishes is exactly that and no more — that the predicate finds no
  // violation in today's tree. It does NOT exercise the shipped script: the traversal below
  // is this test's own, so it observes no exit code, no counter and no printed byte, and it
  // can drift from `main()`'s traversal with nothing noticing. `main()` itself is covered by
  // the end-to-end tests at the bottom of this file, which spawn the script as a child
  // process; that layer, not this one, is what holds the gating property.
  const violations = []

  for (const dir of readdirSync(PACKAGES_DIR).sort()) {
    if (!statSync(path.join(PACKAGES_DIR, dir)).isDirectory()) continue
    const manifestPath = path.join(PACKAGES_DIR, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!isNonPrivate(manifest)) continue
    const readmePath = path.join(PACKAGES_DIR, dir, 'README.md')
    const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : ''
    violations.push(...findUndocumentedSubpaths(manifest, readme).map((s) => `${dir}: ${s}`))
  }

  assert.deepEqual(violations, [])
})

// ── End to end: the SHIPPED script, driven as a child process ────────────────────────────
// Everything below the pure predicate lives in `main()`, which is not exported and runs only
// under the entry-point guard. These tests are what make the two limbs, the counters, the
// printed text and the exit code assertable at all.

/**
 * The four counts the green line prints are DISCRIMINATING here, and that is what the extra
 * packages buy rather than tidiness. This fixture prints 6 examined subpath(s) across 3
 * non-private package(s), 1 private package carrying 4 skipped subpath(s): four values, all
 * different from each other AND all different from the real workspace's 11/2/2/2. Both
 * properties are needed and they are not the same property. Distinct from EACH OTHER kills
 * cross-substitution (printing one counter in another's slot); distinct from the OTHER FIXTURE
 * kills hardcoding (replacing a counter with the literal it happens to equal). Measured, not
 * reasoned: under the two-package shape this fixture had before, three counters were all 1
 * here and all 2 in the real workspace, so two cross-substitutions survived; under a first
 * attempt at 2/5/1/3, `checkedPackages` matched the real workspace's 2 and the hardcode
 * mutation survived instead. Shrinking this fixture, or letting any count drift onto one of
 * the workspace's, gives one of the two blindnesses back silently.
 */
const CLEAN_FIXTURE = {
  alpha: {
    manifest: {
      exports: { '.': './dist/index.js', './one': './dist/one.css', './two': './dist/two.js' },
      name: '@navecss/alpha',
    },
    readme: '# alpha\n\nSee `@navecss/alpha/one` and `@navecss/alpha/two`.\n',
  },
  epsilon: {
    manifest: {
      exports: { '.': './dist/index.js', './solo': './dist/solo.js' },
      name: '@navecss/epsilon',
    },
    readme: '# epsilon\n\n`@navecss/epsilon/solo`.\n',
  },
  gamma: {
    manifest: {
      exports: {
        '.': './dist/index.js',
        './x': './dist/x.js',
        './y': './dist/y.js',
        './z': './dist/z.js',
      },
      name: '@navecss/gamma',
    },
    readme: '# gamma\n\n`@navecss/gamma/x`, `@navecss/gamma/y`, `@navecss/gamma/z`.\n',
  },
  zeta: {
    manifest: {
      exports: {
        '.': './dist/index.js',
        './hidden': './dist/hidden.js',
        './more': './dist/more.js',
        './still': './dist/still.js',
        './yet': './dist/yet.js',
      },
      name: '@navecss/zeta',
      private: true,
    },
    readme: null,
  },
}

const DIRTY_FIXTURE = {
  beta: {
    manifest: {
      exports: {
        '.': './dist/index.js',
        './documented': './dist/documented.js',
        './missing': './dist/missing.js',
      },
      name: '@navecss/beta',
    },
    readme: '# beta\n\nOnly `@navecss/beta/documented` is written up here.\n',
  },
}

const ALL_PRIVATE_FIXTURE = {
  gamma: {
    manifest: {
      exports: { '.': './dist/index.js', './a': './dist/a.js' },
      name: '@navecss/gamma',
      private: true,
    },
    readme: null,
  },
}

/**
 * The shape where the failure text has to earn its words: the README DOES literally contain
 * `@navecss/eta/cx`, inside `@navecss/eta/cx-extra`, and the check still calls the subpath
 * undocumented. A maintainer who greps here finds the string and needs the message to say why
 * that is not a mention.
 */
const NEAR_SIBLING_FIXTURE = {
  eta: {
    manifest: {
      exports: { '.': './dist/index.js', './cx': './dist/cx.js' },
      name: '@navecss/eta',
    },
    readme: '# eta\n\nSee `@navecss/eta/cx-extra`.\n',
  },
}

/**
 * The second shape that reaches the zero-scope branch, and the one that falsified its old
 * wording: a tree with NO private package at all, whose one package is
 * non-private and simply declares no in-scope subpath. The branch keys on
 * `counts.checkedSubpaths === 0`, so it fires here too — and any explanation phrased as a
 * fact about privateness is false on exactly this tree.
 */
const NO_IN_SCOPE_SUBPATHS_FIXTURE = {
  delta: {
    manifest: { exports: { '.': './dist/index.js' }, name: '@navecss/delta' },
    readme: '# delta\n',
  },
}

test('end to end: a clean fixture exits 0 and prints the scope, the skip and the presence-only caveat', () => {
  const dir = buildFixture(CLEAN_FIXTURE)
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(
      stdout.trim(),
      'README export coverage: 6 subpath(s) across 3 non-private package(s) examined; 1 ' +
        'private package(s) carrying 4 in-scope subpath(s) not examined, because a private ' +
        'package publishes no tarball.\n' +
        "Every specifier is present as a whole name in its own package's README.md — " +
        'presence of the name only, never that the README describes it.',
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a violating fixture exits 1 and names the specifier and the file to edit', () => {
  const dir = buildFixture(DIRTY_FIXTURE)
  try {
    const { status, stderr, stdout } = runScript(dir)
    assert.equal(status, 1)
    assert.match(stderr, /@navecss\/beta\/missing/)
    assert.match(stderr, /packages\/beta\/README\.md/)
    assert.doesNotMatch(stderr, /@navecss\/beta\/documented/)
    assert.equal(stdout, '')
    // `.github/CONTRIBUTING.md`, "Text the build prints or ships": command-line output is
    // read by people with no checkout, so it carries no internal reference tag, "whether
    // they are the whole of the pointer or only a label on it". The message states its
    // constraint in words and names an act on the reader's own file, which that rule says
    // is the whole of what is needed. The shape is the qualified tracker reference,
    // `<slug>#<digits>`; the bare form is held to zero repository-wide by
    // `check-no-bare-issue-refs.test.mjs`.
    assert.doesNotMatch(stderr, TRACKER_REFERENCE_PATTERN)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a run that examined nothing says so instead of printing the success sentence', () => {
  // A prior ruling's rider, in published `licensing` overview §4/§5's own words: a run
  // that compared nothing must not read as a run that compared and passed. Exit stays 0 —
  // having nothing in scope to examine is a legitimate state, and the branch keys on that,
  // not on the tree being all-private.
  const dir = buildFixture(ALL_PRIVATE_FIXTURE)
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(
      stdout.trim(),
      'README export coverage: 0 in-scope subpath(s) examined, so this run compared NOTHING ' +
        'and must not be read as a run that compared and passed; 1 private package(s) ' +
        'carrying 1 in-scope subpath(s) were skipped, because a private package publishes no ' +
        'tarball. Exiting 0 because having nothing in scope to examine is a legitimate state, ' +
        'not because anything was checked.',
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: the failure text explains the boundary when a longer sibling is what is present', () => {
  // The match became bounded when `mentionsSpecifier` landed, but the failure text still
  // described the check as plain presence of the name. On this fixture that reading is
  // actively wrong in the unsafe direction: the README contains the specifier as a
  // substring, so a maintainer who greps concludes the check should have passed and that
  // the gate is broken. The message has to name the boundary itself.
  const dir = buildFixture(NEAR_SIBLING_FIXTURE)
  try {
    const { status, stderr } = runScript(dir)
    assert.equal(status, 1)
    assert.match(stderr, /@navecss\/eta\/cx \(packages\/eta\/README\.md\)/)
    assert.match(stderr, /whole name/)
    assert.match(stderr, /not only inside a longer one/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: the zero-scope line explains itself without claiming the tree is all-private', () => {
  // Measured by the licensing steward: this tree has ZERO private packages, so any
  // explanation naming privateness as the cause is false here while the census beside it
  // reads `0 private package(s)`. The rider's load-bearing half must still be present.
  const dir = buildFixture(NO_IN_SCOPE_SUBPATHS_FIXTURE)
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(
      stdout.trim(),
      'README export coverage: 0 in-scope subpath(s) examined, so this run compared NOTHING ' +
        'and must not be read as a run that compared and passed; 0 private package(s) ' +
        'carrying 0 in-scope subpath(s) were skipped, because a private package publishes no ' +
        'tarball. Exiting 0 because having nothing in scope to examine is a legitimate state, ' +
        'not because anything was checked.',
    )
    assert.doesNotMatch(stdout, /all-private/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: the real workspace exits 0 and its green line matches the documented shape', () => {
  // The SHAPE, never a hardcoded count: the counts are a property of the tree, and a copy of
  // them here would be a second census of exactly the kind an earlier ruling forbids.
  const { status, stdout } = runScript(ROOT)
  assert.equal(status, 0)
  assert.match(stdout.trim(), SUCCESS_LINE_SHAPE)
})
