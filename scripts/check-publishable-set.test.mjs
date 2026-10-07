/**
 * Unit coverage for the pure classification logic in
 * check-publishable-set.mjs, run with Node's
 * built-in test runner, matching check-bundling-guard-coverage's own
 * "no dependency, no counterparty" framing. Synthetic manifests only.
 *
 * A second layer adds: `main()` itself, run against mkdtemp fixture
 * trees, covering the workspace-glob guard this script now shares with
 * check-license-parity.mjs (imported as `findWorkspaceGlobViolation`).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  composeChangesetConfigUnusableMessage,
  composeManifestNotAnObjectMessage,
  composeManifestUnreadableMessage,
  composePackageListUnreadableMessage,
  findMismatches,
  isPublishable,
  main,
  PUBLISHABLE_SET,
  WORKSPACE_GLOB_VIOLATION_MESSAGE,
} from './check-publishable-set.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VALID_WORKSPACE_YAML = "packages:\n  - 'packages/*'\n"

/**
 * A qualified tracker reference, `<slug>#<digits>`: what a bare number turns into when someone
 * "fixes" it by putting a repository in front of it. One constant, read by every row below that
 * asks this question, so a later narrowing cannot reach one row and miss the others.
 *
 * IT DELIBERATELY DOES NOT FENCE THE LEFT SIDE, and that is a reverted decision rather than an
 * omission, so the next reader does not re-attempt it. Unfenced, the shape accepts one known
 * false-positive class: the tail of a digit-initial URL fragment, `https://example.com/docs#3`.
 * That class is UNREACHABLE in the messages this gate prints, because neither a CSS id selector
 * nor an XML id may begin with a digit and no message here carries a fragment. A lookbehind
 * keyed on `/` was tried and reverted, because every slash-keyed fence also excludes the
 * TWO-SEGMENT spelling, `owner/repo#632` — which is reachable, and which the repository-wide
 * bare-form guard already skips by its own identical fence, so fencing here would leave that
 * spelling seen by no check in this repository at all. This gate's messages interpolate
 * absolute PATHS, which is where a slash-keyed fence would have bitten hardest. An unreachable
 * false positive is the cheaper of the two.
 */
const TRACKER_REFERENCE_PATTERN = /[\w-]+#\d+/

/**
 * A throwaway workspace `main(rootDir)` can be pointed at directly: LICENSE is irrelevant to
 * this gate, so the fixture holds only `pnpm-workspace.yaml`, `packages/` and Changesets'
 * `config.json` (omitted means an empty `ignore` list, a string is written verbatim, `null` writes no file).
 */
function buildFixture(workspaceYaml, packages, changesetConfig) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-publishable-set-'))
  mkdirSync(path.join(dir, 'packages'), { recursive: true })
  if (changesetConfig !== null) {
    const config = changesetConfig === undefined ? { ignore: [] } : changesetConfig
    mkdirSync(path.join(dir, '.changeset'), { recursive: true })
    writeFileSync(
      path.join(dir, '.changeset', 'config.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    )
  }
  if (workspaceYaml !== null) {
    writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), workspaceYaml)
  }
  for (const [dirName, manifest] of Object.entries(packages)) {
    const packageDir = path.join(dir, 'packages', dirName)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest))
  }
  return dir
}

test('a manifest with no private field is publishable', () => {
  assert.equal(isPublishable({ name: '@navecss/tokens' }), true)
})

test('a manifest with private: true is not publishable', () => {
  assert.equal(isPublishable({ name: '@navecss/cli', private: true }), false)
})

test('a manifest with private: false is publishable (changesets checks strict !== true)', () => {
  assert.equal(isPublishable({ name: '@navecss/bridge', private: false }), true)
})

test('the shipped set (tokens + core + stylelint-config + eslint-plugin publishable, bridge + cli private) matches with no mismatches', () => {
  const manifests = [
    { name: '@navecss/tokens' },
    { name: '@navecss/core' },
    { name: '@navecss/stylelint-config' },
    { name: '@navecss/eslint-plugin' },
    { name: '@navecss/bridge', private: true },
    { name: '@navecss/cli', private: true },
  ]
  assert.deepEqual(findMismatches(manifests), {
    unexpectedlyPublishable: [],
    unexpectedlyPrivate: [],
  })
})

test('a package outside the expected set losing "private: true" is caught as unexpectedly publishable', () => {
  const manifests = [
    { name: '@navecss/tokens' },
    { name: '@navecss/core' },
    { name: '@navecss/bridge' }, // no private: true — the defect this guards against
    { name: '@navecss/cli', private: true },
  ]
  const { unexpectedlyPublishable } = findMismatches(manifests)
  assert.deepEqual(unexpectedlyPublishable, ['@navecss/bridge'])
})

test('an expected-set member gaining "private: true" by mistake is caught as unexpectedly private', () => {
  const manifests = [
    { name: '@navecss/tokens', private: true },
    { name: '@navecss/core' },
    { name: '@navecss/stylelint-config' },
    { name: '@navecss/eslint-plugin' },
    { name: '@navecss/bridge', private: true },
    { name: '@navecss/cli', private: true },
  ]
  const { unexpectedlyPrivate } = findMismatches(manifests)
  assert.deepEqual(unexpectedlyPrivate, ['@navecss/tokens'])
})

test('PUBLISHABLE_SET is exactly {tokens, core, stylelint-config, eslint-plugin} today', () => {
  assert.deepEqual([...PUBLISHABLE_SET].sort(), [
    '@navecss/core',
    '@navecss/eslint-plugin',
    '@navecss/stylelint-config',
    '@navecss/tokens',
  ])
})

/**
 * Runs `main(rootDir)`, capturing console output and the exit code it sets, restoring both
 * afterward so a failing assertion cannot leak a patched global into a later test.
 */
function runMain(rootDir) {
  const calls = { error: [], log: [] }
  const originalError = console.error
  const originalLog = console.log
  const originalExitCode = process.exitCode
  console.error = (message) => calls.error.push(message)
  console.log = (message) => calls.log.push(message)
  let exitCode
  try {
    main(rootDir)
    exitCode = process.exitCode
  } finally {
    console.error = originalError
    console.log = originalLog
    process.exitCode = originalExitCode
  }
  return { calls, exitCode }
}

test('main(): the real repository workspace confirms scope and reports the expected publishable set', () => {
  const { calls, exitCode } = runMain(ROOT)
  assert.equal(exitCode, undefined)
  assert.equal(calls.error.length, 0)
  assert.equal(calls.log.length, 1)
  assert.match(calls.log[0], /^Publishable set: exactly \{.*\} would publish/)
})

test("main(): refuses on a bad pnpm-workspace.yaml before scanning any package, printing this gate's own message", () => {
  const dir = buildFixture("packages:\n  - 'apps/*'\n", {
    // If the guard did not fire first, this fixture would instead report a mismatch against
    // PUBLISHABLE_SET, not the workspace-glob refusal, which is the ordering this test pins.
    tokens: { name: '@navecss/tokens' },
  })
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.deepEqual(calls.error, [WORKSPACE_GLOB_VIOLATION_MESSAGE])
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main(): refuses when pnpm-workspace.yaml is missing entirely, comparing nothing', () => {
  const dir = buildFixture(null, { tokens: { name: '@navecss/tokens' } })
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.deepEqual(calls.error, [WORKSPACE_GLOB_VIOLATION_MESSAGE])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main(): a confirmed workspace with the expected publishable set passes with no mismatches', () => {
  const dir = buildFixture(
    VALID_WORKSPACE_YAML,
    {
      bridge: { name: '@navecss/bridge', private: true },
      cli: { name: '@navecss/cli', private: true },
      core: { name: '@navecss/core' },
      'eslint-plugin': { name: '@navecss/eslint-plugin' },
      'stylelint-config': { name: '@navecss/stylelint-config' },
      tokens: { name: '@navecss/tokens' },
    },
    // Private packages on the list are the intended state; only a set member there is a fault.
    { ignore: ['@navecss/cli', '@navecss/bridge'] },
  )
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, undefined)
    assert.equal(calls.error.length, 0)
    assert.equal(calls.log.length, 1)
    assert.match(calls.log[0], /^Publishable set: exactly \{.*\} would publish/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("composePackageListUnreadableMessage composes this gate's own bytes, never the license-parity gate's cleared ones", () => {
  const message = composePackageListUnreadableMessage('/repo/packages', 'ENOENT')
  assert.equal(
    message,
    'Publishable-set gate: refusing to run. /repo/packages could not be read (ENOENT). ' +
      'Nothing has been compared against the set this repository intends to publish. Repair the tree and ' +
      're-run.',
  )
  assert.ok(!message.includes('License parity gate'))
  // This mirrors a sibling guard row that holds this gate's three OTHER
  // printed messages to the same rule on `main`. The predicate rides here, inside this
  // message's own byte pin, rather than in a second copy of that row: that sibling row's array
  // is hand-enumerated, so a fourth printed message added on a branch that predates it passes
  // the row by not being in it, which is exactly how this defect reached review. A printed
  // string names no tracker a reader cannot open — the shape below is the qualified form,
  // `<slug>#<digits>`, which is what a bare number turns into when someone "fixes" it by
  // putting a repository in front of it. The bare form is held to zero repository-wide by
  // `check-no-bare-issue-refs.test.mjs`.
  assert.ok(
    !TRACKER_REFERENCE_PATTERN.test(message),
    `a message this gate prints names a tracker its reader cannot open: ${message}`,
  )
})

// This gate shares
// `listPackageDirs`'s unguarded readdirSync/statSync with the sibling parity gate, so a
// missing packages/ directory used to raw-crash with an uncaught ENOENT before any manifest
// was examined.
test("main(): a missing packages/ directory refuses with this gate's own message, never an uncaught ENOENT", () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-publishable-set-'))
  writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
  // Deliberately no packages/ directory created at all.
  try {
    let result
    assert.doesNotThrow(() => {
      result = runMain(dir)
    })
    const { calls, exitCode } = result
    assert.equal(exitCode, 1)
    assert.equal(calls.error.length, 1)
    assert.match(calls.error[0], /could not be read/)
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Every other brain-ref-freedom row in this file works by NAMING composers one at a
// time, so the print sites composed inline in main() -- the mismatch report's header, its
// per-package lines, its closing guidance, and the success line -- belong to no composer and
// can be named by no such row. That enumeration weakness is not hypothetical: it is how a
// fourth printed message reached review carrying an issue-tracker citation, passing the
// existing row by not being in it. This row asks the GATE instead of asking a list, driving
// main() down both remaining paths and reading everything it actually printed.
test('nothing this gate prints down ANY path names a tracker a reader cannot open', () => {
  const mismatched = buildFixture(VALID_WORKSPACE_YAML, {
    core: { name: '@navecss/core' },
    surprise: { name: '@navecss/surprise' },
    tokens: { name: '@navecss/tokens' },
  })
  try {
    const report = runMain(mismatched)
    assert.equal(report.exitCode, 1, 'the fixture must reach the mismatch report')
    const success = runMain(ROOT)
    assert.equal(success.exitCode, undefined, 'the real workspace must reach the success line')

    const printed = [
      ...report.calls.error,
      ...report.calls.log,
      ...success.calls.error,
      ...success.calls.log,
    ]
    assert.ok(printed.length >= 2, 'both paths must have printed something to read')
    for (const message of printed) {
      assert.ok(
        !TRACKER_REFERENCE_PATTERN.test(message),
        `a message this gate prints names a tracker its reader cannot open: ${message}`,
      )
    }
  } finally {
    rmSync(mismatched, { recursive: true, force: true })
  }
})

// This report's docblock made no byte-exact claim, and none was
// measured. Measured here: the row above (and
// every other test in this file that touches the mismatch path) checks SHAPE and OPACITY, never
// the bytes. The header, the two per-package line templates and the closing guidance are
// composed inline in main() and had no byte-exact anchor anywhere — a paraphrase of any of them
// would pass every existing test in this file. This is the byte-exact backstop, not the gate:
// the primary control is review of main()'s own source. CHANGING THIS LITERAL IS A
// WORDING CHANGE TO A CHECK'S OWN OUTPUT, NOT A TEST FIXUP — if this goes red because the
// source message was reworded, restore the wording or get it decided, never edit the literal
// to match. Exercises both per-package line shapes (unexpectedly publishable AND unexpectedly
// private) in one fixture so both are anchored.
test('the mismatch report is byte-exact, not only opacity- and shape-checked', () => {
  const mismatched = buildFixture(VALID_WORKSPACE_YAML, {
    core: { name: '@navecss/core', private: true },
    'eslint-plugin': { name: '@navecss/eslint-plugin' },
    'stylelint-config': { name: '@navecss/stylelint-config' },
    surprise: { name: '@navecss/surprise' },
    tokens: { name: '@navecss/tokens' },
  })
  try {
    const { calls, exitCode } = runMain(mismatched)
    assert.equal(exitCode, 1)
    assert.deepEqual(calls.error, [
      'The publishable package set does not match the set this repository intends to publish:\n',
      '  - @navecss/surprise: publishable (no "private": true) but not in the expected set',
      '  - @navecss/core: "private": true but expected to publish at 0.1.0',
      '\nIf this is a deliberate scope change, update PUBLISHABLE_SET in ' +
        'scripts/check-publishable-set.mjs alongside the manifest change. Making a package ' +
        'publish for the first time is a release decision and not only a manifest edit: do not ' +
        'flip it in a pull request on its own, open an issue proposing it.',
    ])
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(mismatched, { recursive: true, force: true })
  }
})

test("composeManifestUnreadableMessage composes this gate's own bytes, never the license-parity gate's cleared ones", () => {
  const message = composeManifestUnreadableMessage(
    '/repo/packages/tokens/package.json',
    'Unexpected token',
  )
  assert.equal(
    message,
    'Publishable-set gate: refusing to run. /repo/packages/tokens/package.json is not valid ' +
      'JSON (Unexpected token). Nothing has been compared against the set this repository intends to publish. ' +
      'Repair the manifest and re-run.',
  )
  assert.ok(!message.includes('License parity gate'))
})

test("composeChangesetConfigUnusableMessage composes this gate's own bytes, never the license-parity gate's cleared ones", () => {
  const message = composeChangesetConfigUnusableMessage(
    '/repo/.changeset/config.json',
    'is not valid JSON (Unexpected token)',
  )
  assert.equal(
    message,
    'Publishable-set gate: refusing to run. /repo/.changeset/config.json is not valid JSON ' +
      '(Unexpected token). Nothing has been compared against the Changesets "ignore" list. ' +
      'Repair the file and re-run.',
  )
  assert.ok(!message.includes('License parity gate'))
})

// This gate's own JSON.parse(readFileSync(...)) was
// unguarded and raw-crashed on a malformed manifest, the same defect class closed in the
// sibling gate. This file states no licensing position, so its
// message is ordinary mechanism prose and must not borrow the license-parity gate's cleared
// bytes.
test("main(): a malformed package manifest under a confirmed workspace refuses with this gate's own message, never an uncaught exception", () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, {})
  const manifestPath = path.join(dir, 'packages', 'broken', 'package.json')
  mkdirSync(path.dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, '{ invalid json')
  try {
    let result
    assert.doesNotThrow(() => {
      result = runMain(dir)
    })
    const { calls, exitCode } = result
    assert.equal(exitCode, 1)
    assert.equal(calls.error.length, 1)
    // The JSON.parse error text itself is engine/version-dependent (mirrors the sibling gate's
    // own malformed-manifest test, check-license-parity.test.mjs), so this pins the composed
    // WRAPPER exactly, by content and not by re-deriving it from the actual output, and leaves
    // only the interpolated reason to a regex.
    const escapedManifestPath = manifestPath.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
    assert.match(
      calls.error[0],
      new RegExp(
        String.raw`^Publishable-set gate: refusing to run\. ${escapedManifestPath} is not valid JSON ` +
          String.raw`\(.+\)\. Nothing has been compared against the set this repository intends to publish\. Repair ` +
          String.raw`the manifest and re-run\.$`,
      ),
    )
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("composeManifestNotAnObjectMessage composes this gate's own bytes, never the license-parity gate's cleared ones", () => {
  const message = composeManifestNotAnObjectMessage('/repo/packages/tokens/package.json', 'null')
  assert.equal(
    message,
    'Publishable-set gate: refusing to run. /repo/packages/tokens/package.json is valid JSON ' +
      'but is not a package manifest (it parsed to null, not an object). Nothing has been ' +
      'compared against the set this repository intends to publish. Repair the manifest and re-run.',
  )
  assert.ok(!message.includes('License parity gate'))
})

// A corpus-gated tail fix: this gate's manifest guard
// only covered SYNTAX errors (JSON.parse throwing), while the sibling gate's identical-shaped
// guard also covers a manifest that parses fine but is not a usable object. A `null` manifest
// raw-crashed main() with an uncaught TypeError reading `.private` off null (measured); mirrors the
// sibling gate's composeManifestNotAnObjectMessage guard.
test("main(): a package manifest that is valid JSON but not a usable object refuses, never an uncaught exception (mirrors the sibling gate's guard)", () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, {})
  const manifestPath = path.join(dir, 'packages', 'broken', 'package.json')
  mkdirSync(path.dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, 'null')
  try {
    let result
    assert.doesNotThrow(() => {
      result = runMain(dir)
    })
    assert.equal(result.exitCode, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Pinning row. Three PRINTED
// strings moved off an internal issue number; two are pinned byte-exact elsewhere in this file
// and the third (WORKSPACE_GLOB_VIOLATION_MESSAGE) was asserted only by IDENTITY against the
// imported constant, which pins ROUTING and nothing about the bytes: reverting it, or emptying
// it, left the suite 15/15 green. One row holds all three at once.
test('no message this gate PRINTS names a tracker a consumer cannot read', () => {
  const printed = [
    WORKSPACE_GLOB_VIOLATION_MESSAGE,
    composeManifestUnreadableMessage('/repo/packages/tokens/package.json', 'Unexpected token'),
    composeManifestNotAnObjectMessage('/repo/packages/tokens/package.json', 'null'),
  ]
  for (const message of printed) {
    assert.ok(
      !TRACKER_REFERENCE_PATTERN.test(message),
      `a message this gate prints names a tracker its reader cannot open: ${message}`,
    )
  }
})

const EXPECTED_SET_PACKAGES = {
  core: { name: '@navecss/core' },
  'eslint-plugin': { name: '@navecss/eslint-plugin' },
  'stylelint-config': { name: '@navecss/stylelint-config' },
  tokens: { name: '@navecss/tokens' },
}

// Changesets' `version` skips every package named in `ignore`, private or not, so a package
// promoted to published but left on that list is never bumped.
test('main(): a package in the publishable set that is also on the Changesets ignore list is reported', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, {
    ignore: ['@navecss/cli', '@navecss/eslint-plugin', '@navecss/tokens'],
  })
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.deepEqual(calls.error, [
      'The Changesets "ignore" list names packages this repository intends to publish:\n',
      '  - @navecss/tokens: in the publishable set but listed in "ignore" in .changeset/config.json',
      '  - @navecss/eslint-plugin: in the publishable set but listed in "ignore" in .changeset/config.json',
      '\nChangesets never versions a package on that list. Remove each one from "ignore" in ' +
        '.changeset/config.json, in the same pull request that adds it to PUBLISHABLE_SET.',
    ])
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main(): a Changesets config without an ignore list has nothing to report', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, {})
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, undefined)
    assert.equal(calls.error.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main(): refuses when the Changesets config is missing, comparing nothing', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, null)
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.equal(calls.error.length, 1)
    assert.match(
      calls.error[0],
      /^Publishable-set gate: refusing to run\. .*config\.json could not be read \(ENOENT\)\./,
    )
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main(): refuses when the Changesets config is not valid JSON', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, '{ "ignore": [')
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.equal(calls.error.length, 1)
    assert.match(
      calls.error[0],
      /^Publishable-set gate: refusing to run\. .*config\.json is not valid JSON \(/,
    )
    assert.equal(calls.log.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const [shape, config] of [
  ['an array', '[]'],
  ['null', 'null'],
  ['an ignore field that is not an array', '{ "ignore": "@navecss/cli" }'],
  ['an ignore array with a non-string entry', '{ "ignore": ["@navecss/cli", 1] }'],
]) {
  test(`main(): refuses a Changesets config that is ${shape}, never reading it as an empty ignore list`, () => {
    const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, config)
    try {
      const { calls, exitCode } = runMain(dir)
      assert.equal(exitCode, 1)
      assert.equal(calls.error.length, 1)
      assert.match(
        calls.error[0],
        /^Publishable-set gate: refusing to run\. .*config\.json is not a usable Changesets config/,
      )
      assert.equal(calls.log.length, 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('nothing the ignore-list check prints names a tracker a reader cannot open', () => {
  const printed = []
  for (const config of [
    { ignore: ['@navecss/core'] },
    { ignore: ['@navecss/t*'] },
    '{ "ignore": [',
    null,
    '[]',
    '{ "ignore": "x" }',
  ]) {
    const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, config)
    try {
      const { calls } = runMain(dir)
      assert.ok(calls.error.length > 0, 'every fixture here must reach a printed fault')
      printed.push(...calls.error)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  for (const message of printed) {
    assert.ok(
      !TRACKER_REFERENCE_PATTERN.test(message),
      `a message this gate prints names a tracker its reader cannot open: ${message}`,
    )
  }
})

// Changesets reads each `ignore` entry as a glob (with `!` negation), while this gate compares
// exact names, so a pattern that covers a set member would pass here and still make Changesets
// skip it. The gate refuses any entry that is not a plain package name rather than expanding it.
for (const [title, config, pattern] of [
  [
    'a glob that would cover a package in the publishable set',
    { ignore: ['@navecss/t*'] },
    /config\.json is not a usable Changesets config \("ignore" entry "@navecss\/t\*" is not a plain package name/,
  ],
  [
    'a glob with a negation',
    { ignore: ['@navecss/*', '!@navecss/core'] },
    /"ignore" entry "@navecss\/\*" is not a plain package name/,
  ],
  ['an empty string', '{ "ignore": [""] }', /"ignore" entry "" is not a plain package name/],
]) {
  test(`main(): refuses an ignore entry that is ${title}, comparing nothing`, () => {
    const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, config)
    try {
      const { calls, exitCode } = runMain(dir)
      assert.equal(exitCode, 1)
      assert.equal(calls.error.length, 1)
      assert.match(calls.error[0], pattern)
      assert.equal(calls.log.length, 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('main(): ignore entries that are plain package names, scoped or not, still pass', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, {
    ignore: ['@navecss/cli', '@navecss/bridge', 'left-pad', 'a.b_c~d-e'],
  })
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, undefined)
    assert.equal(calls.error.length, 0)
    assert.equal(calls.log.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The set check runs first: a package set that is wrong is reported on its own, and the Changesets
// config is only read once the set matches. These two tests hold that order so it stays a choice.
const PACKAGES_WITH_TOKENS_PRIVATE = {
  ...EXPECTED_SET_PACKAGES,
  tokens: { name: '@navecss/tokens', private: true },
}

for (const [title, config, unwanted] of [
  ['an ignore list that names a set member', { ignore: ['@navecss/core'] }, 'Changesets "ignore"'],
  ['a config that is not valid JSON', '{ not json', 'config.json'],
]) {
  test(`main(): a wrong package set is reported before ${title} is looked at`, () => {
    const dir = buildFixture(VALID_WORKSPACE_YAML, PACKAGES_WITH_TOKENS_PRIVATE, config)
    try {
      const { calls, exitCode } = runMain(dir)
      assert.equal(exitCode, 1)
      assert.match(calls.error[0], /^The publishable package set does not match/)
      for (const line of calls.error) {
        assert.ok(!line.includes(unwanted), `the set fault must print alone, but saw: ${line}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

// Each way a config can be unusable says which one it is, so a reader is never told the wrong thing.
for (const [title, config, pattern] of [
  [
    'is not an object',
    '[]',
    /config\.json is not a usable Changesets config \(it is not an object\)\./,
  ],
  [
    'has an ignore field that is not an array',
    '{ "ignore": "@navecss/cli" }',
    /config\.json is not a usable Changesets config \("ignore" is not an array of strings\)\./,
  ],
  [
    'has a null ignore field',
    '{ "ignore": null }',
    /config\.json is not a usable Changesets config \("ignore" is not an array of strings\)\./,
  ],
]) {
  test(`main(): a Changesets config that ${title} is refused with the reason that matches`, () => {
    const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, config)
    try {
      const { calls, exitCode } = runMain(dir)
      assert.equal(exitCode, 1)
      assert.equal(calls.error.length, 1)
      assert.match(calls.error[0], pattern)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('main(): a set member listed twice in ignore is reported once', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, {
    ignore: ['@navecss/tokens', '@navecss/tokens'],
  })
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.equal(calls.error.length, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A pattern is refused wherever it sits in the entry, including ones whose tail alone looks like a
// plain package name: Changesets still expands each of these, and the first two make it skip
// `@navecss/tokens`.
for (const entry of ['*@navecss/tokens', '**/tokens', '!@navecss/core']) {
  test(`main(): refuses the ignore entry ${JSON.stringify(entry)}, whose tail alone looks like a plain package name`, () => {
    const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, { ignore: [entry] })
    try {
      const { calls, exitCode } = runMain(dir)
      assert.equal(exitCode, 1)
      assert.equal(calls.error.length, 1)
      assert.ok(
        calls.error[0].includes(`${JSON.stringify(entry)} is not a plain package name`),
        `expected the refusal to name ${JSON.stringify(entry)}, got: ${calls.error[0]}`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('main(): the refusal names the entry that is not a plain package name, not the first one', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, {
    ignore: ['@navecss/cli', '@navecss/t*'],
  })
  try {
    const { calls, exitCode } = runMain(dir)
    assert.equal(exitCode, 1)
    assert.match(calls.error[0], /"ignore" entry "@navecss\/t\*" is not a plain package name/)
    assert.ok(!calls.error[0].includes('"@navecss/cli"'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main(): the refusal for a pattern entry explains itself and says nothing was compared', () => {
  const dir = buildFixture(VALID_WORKSPACE_YAML, EXPECTED_SET_PACKAGES, {
    ignore: ['@navecss/t*'],
  })
  try {
    const { calls } = runMain(dir)
    assert.ok(
      calls.error[0].endsWith(
        'this gate compares exact names without expanding patterns). Nothing has been compared ' +
          'against the Changesets "ignore" list. Repair the file and re-run.',
      ),
      `unexpected ending: ${calls.error[0]}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
