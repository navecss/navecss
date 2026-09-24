import assert from 'node:assert/strict'
/**
 * Coverage for check-actions-pinned-shas.mjs, run with Node's built-in
 * test runner, in two layers.
 *
 * The first layer is the pure classification logic (`extractUsesSpecifiers`,
 * `isPinnedToSha`, `findTagPinnedUses`) against synthetic fixture strings, per the same
 * reasoning as this repo's other `check-*.test.mjs` files: red/green evidence for the
 * comparison logic without depending on (or mutating) the real `.github/workflows/*.yml`
 * files.
 *
 * The second layer drives the SHIPPED script as a child process against a throwaway
 * workflow file, because the counters, the printed text and the exit code all live in
 * `main()`, which is not exported and runs only under the entry-point guard.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  extractUsesSpecifiers,
  findTagPinnedUses,
  isPinnedToSha,
} from './check-actions-pinned-shas.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_NAME = 'check-actions-pinned-shas.mjs'

const REAL_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1'

test('isPinnedToSha: a full 40-hex-character commit SHA passes (GREEN)', () => {
  assert.equal(isPinnedToSha(`actions/checkout@${REAL_SHA}`), true)
})

test('isPinnedToSha: an upper-case commit SHA also passes (kills the "drop the /i flag" mutant)', () => {
  assert.equal(isPinnedToSha(`actions/checkout@${REAL_SHA.toUpperCase()}`), true)
})

test('isPinnedToSha: a mutable tag fails (RED)', () => {
  assert.equal(isPinnedToSha('actions/checkout@v7'), false)
})

test('isPinnedToSha: a branch name fails (RED)', () => {
  assert.equal(isPinnedToSha('actions/checkout@main'), false)
})

test('isPinnedToSha: a ./ local composite action path passes — it has no @ slot to pin (D1)', () => {
  assert.equal(isPinnedToSha('./.github/actions/local-action'), true)
})

test('isPinnedToSha: a Docker reference with no @ segment fails — it is not a ./ path (D2)', () => {
  assert.equal(isPinnedToSha('docker://alpine:3.19'), false)
})

test('isPinnedToSha: a Docker reference pinned to a digest still fails (D2, pinned so this cannot be silently reversed)', () => {
  const sha256Digest = 'a'.repeat(64)
  assert.equal(isPinnedToSha(`docker://alpine@sha256:${sha256Digest}`), false)
})

test('isPinnedToSha: a 39- or 41-character string is not a SHA, even if all hex', () => {
  assert.equal(isPinnedToSha(`actions/checkout@${REAL_SHA.slice(0, 39)}`), false)
  assert.equal(isPinnedToSha(`actions/checkout@${REAL_SHA}a`), false)
})

test('isPinnedToSha: a scoped path resolves the ref from the LAST @, not the first', () => {
  // `owner/repo/sub-path@ref` has no `@` before the ref itself, but this guards the general
  // shape rather than assuming it.
  assert.equal(isPinnedToSha(`owner/repo/path/to/action@${REAL_SHA}`), true)
})

test('isPinnedToSha: a specifier with TWO @ signs resolves from the LAST one (kills the lastIndexOf -> indexOf mutant)', () => {
  // `owner/repo@v1@<sha>` has an earlier, non-ref `@` before the real ref; the scoped-path test
  // above cannot kill lastIndexOf -> indexOf because its fixture has exactly one `@`.
  assert.equal(isPinnedToSha(`owner/repo@v1@${REAL_SHA}`), true)
})

test('extractUsesSpecifiers: finds every uses: line, dropping a trailing # comment', () => {
  const content = [
    'jobs:',
    '  build:',
    '    steps:',
    `      - uses: actions/checkout@${REAL_SHA} # v7`,
    '        with:',
    '          fetch-depth: 0',
    `      - uses: jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c # v4`,
  ].join('\n')
  assert.deepEqual(extractUsesSpecifiers(content), [
    { line: 4, specifier: `actions/checkout@${REAL_SHA}` },
    { line: 7, specifier: 'jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c' },
  ])
})

test('extractUsesSpecifiers: a file with no uses: lines returns an empty list', () => {
  assert.deepEqual(extractUsesSpecifiers('jobs:\n  build:\n    steps: []\n'), [])
})

test('extractUsesSpecifiers: "uses:" inside a run: | block scalar is NOT extracted (D5)', () => {
  const content = [
    '      - run: |',
    '          echo "reminder: this job uses: actions/setup-node@v4 under the hood"',
  ].join('\n')
  assert.deepEqual(extractUsesSpecifiers(content), [])
})

test('extractUsesSpecifiers: a full-line YAML comment containing "uses:" is NOT extracted (D5)', () => {
  const content = '      # this job uses: actions/setup-node@v4 under the hood'
  assert.deepEqual(extractUsesSpecifiers(content), [])
})

test('extractUsesSpecifiers: the dash separator is any run of whitespace, not exactly one space (D5)', () => {
  // The first anchored form of this regex hardcoded `(?:- )?`, so a step written with any
  // other YAML-legal spacing after the dash stopped being seen at all. A MISS here is a
  // false NEGATIVE, which is the direction that matters for this gate: a tag-pinned action
  // written `-   uses: actions/checkout@v7` would pass unflagged.
  assert.deepEqual(extractUsesSpecifiers('      -   uses: actions/checkout@v7'), [
    { line: 1, specifier: 'actions/checkout@v7' },
  ])
  assert.deepEqual(extractUsesSpecifiers('      -\tuses: actions/checkout@v7'), [
    { line: 1, specifier: 'actions/checkout@v7' },
  ])
})

test('extractUsesSpecifiers: a dash with NO separator is not a uses: step (D5)', () => {
  // `-uses:` is not valid YAML for a mapping key, and widening the separator must not widen
  // this far: the anchor still requires the dash to be a sequence marker.
  assert.deepEqual(extractUsesSpecifiers('      -uses: actions/checkout@v7'), [])
})

test('findTagPinnedUses: GREEN when every reference is pinned to a commit SHA', () => {
  const content = `      - uses: actions/checkout@${REAL_SHA} # v7\n`
  assert.deepEqual(findTagPinnedUses(content), [])
})

test('findTagPinnedUses: RED names every tag-pinned reference, not just the first', () => {
  const content = [
    '      - uses: actions/checkout@v7',
    `      - uses: actions/cache@${REAL_SHA} # v6`,
    '      - uses: jdx/mise-action@main',
  ].join('\n')
  assert.deepEqual(findTagPinnedUses(content), [
    { line: 1, specifier: 'actions/checkout@v7' },
    { line: 3, specifier: 'jdx/mise-action@main' },
  ])
})

test('the real workspace passes today: every uses: line in .github/workflows/*.yml is pinned to a commit SHA', () => {
  // Live, not synthetic: reads the real workflow files and applies the shipped predicate.
  // This does NOT exercise the shipped script itself (see the end-to-end tests below for
  // that); it establishes only that the predicate finds no violation in today's tree.
  const workflowsDir = path.join(ROOT, '.github', 'workflows')
  const violations = []
  for (const file of readdirSync(workflowsDir).filter(
    (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
  )) {
    const content = readFileSync(path.join(workflowsDir, file), 'utf8')
    violations.push(...findTagPinnedUses(content).map((v) => `${file}:${v.line}`))
  }
  assert.deepEqual(violations, [])
})

// ── End to end: the SHIPPED script, driven as a child process ────────────────────────────

/**
 * A throwaway workspace: a `scripts/` holding a copy of the script, and (unless
 * `omitWorkflowsDir` is set) a synthetic `.github/workflows/` directory built from `workflows`
 * ({ filename: content }). `omitWorkflowsDir: true` skips creating `.github/workflows/` at all
 * (R9: no workflows directory whatsoever, as opposed to `buildFixture({})`, which creates the
 * directory empty, R8's shape).
 */
function buildFixture(workflows, { omitWorkflowsDir = false } = {}) {
  const dir = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'nave-actions-pinned-'))
  mkdirSync(path.join(dir, 'scripts'))
  cpSync(path.join(ROOT, 'scripts', SCRIPT_NAME), path.join(dir, 'scripts', SCRIPT_NAME))
  if (!omitWorkflowsDir) {
    const workflowsDir = path.join(dir, '.github', 'workflows')
    mkdirSync(workflowsDir, { recursive: true })
    for (const [filename, content] of Object.entries(workflows)) {
      writeFileSync(path.join(workflowsDir, filename), content)
    }
  }
  return dir
}

function runScript(cwd) {
  const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
    cwd,
    encoding: 'utf8',
  })
  const printed = result.stdout + result.stderr
  assert.ok(
    printed.includes('GitHub Actions SHA pin gate:'),
    `the child printed nothing recognisable, so main() did not run: ${JSON.stringify(printed)}`,
  )
  return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

test('end to end: a compliant fixture exits 0 and prints the census', () => {
  const dir = buildFixture({
    'ci.yml':
      'jobs:\n  build:\n    steps:\n' +
      `      - uses: actions/checkout@${REAL_SHA} # v7\n` +
      '      - uses: jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c # v4\n',
  })
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(
      stdout.trim(),
      'GitHub Actions SHA pin gate: 2 `uses:` line(s) across 1 workflow file(s) checked, 0 ' +
        'pinned to a tag rather than a commit SHA.',
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a fixture with a tag-pinned reference exits 1 and names the file, line and specifier', () => {
  const dir = buildFixture({
    'ci.yml':
      'jobs:\n  build:\n    steps:\n' +
      `      - uses: actions/checkout@${REAL_SHA} # v7\n` +
      '      - uses: actions/setup-node@v4\n',
  })
  try {
    const { status, stderr, stdout } = runScript(dir)
    assert.equal(status, 1)
    assert.match(stderr, /ci\.yml:5: uses: actions\/setup-node@v4/)
    assert.doesNotMatch(stderr, /actions\/checkout/)
    assert.equal(stdout, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a compliant ci.yml alongside a non-YAML README in .github/workflows/ still exits 0 (kills the "drop the extension filter" mutant, R3)', () => {
  // README.md sits INSIDE .github/workflows/, deliberately not filtered out by the `.yml`/
  // `.yaml` extension check. If that filter were ever dropped, README.md would be counted as a
  // second "workflow file" (2, not 1) even though its text ("see actions/setup-node@v4") never
  // matches the anchored uses: extraction on its own.
  const dir = buildFixture({
    'ci.yml': `jobs:\n  build:\n    steps:\n      - uses: actions/checkout@${REAL_SHA} # v7\n`,
    'README.md': 'For an example, see actions/setup-node@v4.\n',
  })
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(
      stdout.trim(),
      'GitHub Actions SHA pin gate: 1 `uses:` line(s) across 1 workflow file(s) checked, 0 ' +
        'pinned to a tag rather than a commit SHA.',
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a fixture whose only step is a ./ local action exits 0 (D1, R6)', () => {
  const dir = buildFixture({
    'ci.yml': 'jobs:\n  build:\n    steps:\n      - uses: ./.github/actions/local-action\n',
  })
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(
      stdout.trim(),
      'GitHub Actions SHA pin gate: 1 `uses:` line(s) across 1 workflow file(s) checked, 0 ' +
        'pinned to a tag rather than a commit SHA.',
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: an EMPTY .github/workflows/ exits non-zero with the fail-closed message (D3, R8)', () => {
  const dir = buildFixture({})
  try {
    const { status, stderr, stdout } = runScript(dir)
    assert.notEqual(status, 0)
    assert.match(stderr, /GitHub Actions SHA pin gate:.*contains no `\.yml` or `\.yaml` file/s)
    assert.equal(stdout, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a .github/workflows/ holding only a non-YAML file exits non-zero with the same fail-closed message (D3, R8)', () => {
  const dir = buildFixture({ 'README.md': 'not a workflow\n' })
  try {
    const { status, stderr, stdout } = runScript(dir)
    assert.notEqual(status, 0)
    assert.match(stderr, /GitHub Actions SHA pin gate:.*contains no `\.yml` or `\.yaml` file/s)
    assert.equal(stdout, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a MISSING .github/workflows/ directory exits non-zero, cleanly, with no raw ENOENT stack trace (D3, R9)', () => {
  const dir = buildFixture({}, { omitWorkflowsDir: true })
  try {
    const { status, stderr, stdout } = runScript(dir)
    assert.notEqual(status, 0)
    assert.match(stderr, /GitHub Actions SHA pin gate:.*does not exist or could not be read/s)
    // A raw uncaught-exception stack trace prints one or more "    at " frame lines; a clean,
    // caught failure never does.
    assert.doesNotMatch(stderr, /\n\s+at /)
    assert.equal(stdout, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: a violation with no @ at all does not tell the reader to replace the ref after @ (D4, R11)', () => {
  const dir = buildFixture({
    'ci.yml': 'jobs:\n  build:\n    steps:\n      - uses: docker://alpine:3.19\n',
  })
  try {
    const { status, stderr } = runScript(dir)
    assert.equal(status, 1)
    assert.match(stderr, /a `uses:` reference is not pinned to a full commit SHA/)
    assert.match(stderr, /ci\.yml:4: uses: docker:\/\/alpine:3\.19/)
    assert.doesNotMatch(stderr, /ref after `@`/)
    assert.match(stderr, /Pin `uses:` to the full 40-character commit SHA it should resolve to/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test("end to end: an unreadable entry that passes the extension filter fails closed through survey()'s own catch, with no raw stack trace", () => {
  // `main()`'s catch is otherwise reached only through the two throws `listWorkflowFiles`
  // crafts, never through a failure inside `survey()`'s own read loop. A DIRECTORY named
  // `sub.yml` passes the `.yml` filter and then makes `readFileSync` throw `EISDIR`, which is
  // the one input that exercises that path. Pins that the gate still reports through its own
  // prefix and a non-zero exit rather than dying with a stack.
  const dir = buildFixture({ 'real.yml': 'jobs: {}\n' })
  mkdirSync(path.join(dir, '.github', 'workflows', 'sub.yml'))
  try {
    const { status, stderr, stdout } = runScript(dir)
    assert.notEqual(status, 0)
    assert.match(stderr, /GitHub Actions SHA pin gate:/)
    assert.doesNotMatch(stderr, /\n\s+at /)
    assert.equal(stdout, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: the real workspace exits 0 and its green line matches the documented shape', () => {
  const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0)
  assert.match(
    result.stdout.trim(),
    /^GitHub Actions SHA pin gate: \d+ `uses:` line\(s\) across \d+ workflow file\(s\) checked, 0 pinned to a tag rather than a commit SHA\.$/,
  )
})
