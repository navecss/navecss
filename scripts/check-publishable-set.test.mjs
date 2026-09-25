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
 * this gate, so the fixture holds only `pnpm-workspace.yaml` and `packages/`.
 */
function buildFixture(workspaceYaml, packages) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-publishable-set-'))
  mkdirSync(path.join(dir, 'packages'), { recursive: true })
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

test('the shipped 0.1.0 set (tokens + core publishable, bridge + cli private) matches with no mismatches', () => {
  const manifests = [
    { name: '@navecss/tokens' },
    { name: '@navecss/core' },
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
    { name: '@navecss/bridge', private: true },
    { name: '@navecss/cli', private: true },
  ]
  const { unexpectedlyPrivate } = findMismatches(manifests)
  assert.deepEqual(unexpectedlyPrivate, ['@navecss/tokens'])
})

test('PUBLISHABLE_SET is exactly {tokens, core} today', () => {
  assert.deepEqual([...PUBLISHABLE_SET].sort(), ['@navecss/core', '@navecss/tokens'])
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
  const dir = buildFixture(VALID_WORKSPACE_YAML, {
    bridge: { name: '@navecss/bridge', private: true },
    cli: { name: '@navecss/cli', private: true },
    core: { name: '@navecss/core' },
    tokens: { name: '@navecss/tokens' },
  })
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
  // A review fix, mirroring a sibling guard row that holds this gate's three OTHER
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

// A defect found by a reviewer in a terminal verification read.
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

// A prior review round (consulting the licensing steward) named this report as one whose
// docblock made no byte-exact claim, without measuring it. Measured here: the row above (and
// every other test in this file that touches the mismatch path) checks SHAPE and OPACITY, never
// the bytes. The header, the two per-package line templates and the closing guidance are
// composed inline in main() and had no byte-exact anchor anywhere — a paraphrase of any of them
// would pass every existing test in this file. This is the byte-exact backstop, not the gate:
// the primary control is a reviewer reading main()'s own source. CHANGING THIS LITERAL IS A
// WORDING CHANGE TO A CHECK'S OWN OUTPUT, NOT A TEST FIXUP — if this goes red because the
// source message was reworded, restore the wording or get it decided, never edit the literal
// to match. Exercises both per-package line shapes (unexpectedly publishable AND unexpectedly
// private) in one fixture so both are anchored.
test('the mismatch report is byte-exact, not only opacity- and shape-checked', () => {
  const mismatched = buildFixture(VALID_WORKSPACE_YAML, {
    core: { name: '@navecss/core', private: true },
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

// A fix round: this gate's own JSON.parse(readFileSync(...)) was
// unguarded and raw-crashed on a malformed manifest, the same defect class closed in the
// sibling gate. This file states no licensing position (per a licensing-steward consult), so its
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
// raw-crashed main() with an uncaught TypeError reading `.private` off null (measured by the
// quality reviewer, PR comment 5602791504); mirrors the sibling gate's
// composeManifestNotAnObjectMessage guard.
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

// A review pinning row. Three PRINTED
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
