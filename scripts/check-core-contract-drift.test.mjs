import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
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

import { diffContract } from '../packages/tokens/src/theming/core-contract.ts'
import { formatDrift, readRecordedContract, scanSources } from './check-core-contract-drift.mjs'

test('readRecordedContract reads the tokens array from a fixture file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'core-contract-'))
  const file = path.join(dir, 'recorded.json')
  writeFileSync(
    file,
    JSON.stringify({ $comment: 'x', tokens: ['--nave-color-a', '--nave-color-b'] }),
  )
  assert.deepEqual(readRecordedContract(file), ['--nave-color-a', '--nave-color-b'])
})

test('diffContract catches a token added to core real usage without the recorded contract regenerated', () => {
  const recorded = ['--nave-color-surface-base', '--nave-color-content-primary']
  const emitted = new Set([...recorded, '--nave-color-newly-added'])
  const drift = diffContract(recorded, emitted)
  assert.deepEqual(drift, { missing: [], added: ['--nave-color-newly-added'] })
})

test('diffContract catches a token removed from core real usage without the recorded contract regenerated', () => {
  const recorded = ['--nave-color-surface-base', '--nave-color-content-primary']
  const emitted = new Set(['--nave-color-surface-base'])
  const drift = diffContract(recorded, emitted)
  assert.deepEqual(drift, { missing: ['--nave-color-content-primary'], added: [] })
})

test('diffContract reports both directions at once, the shape AC-theming-32 names', () => {
  const recorded = ['--nave-color-surface-base', '--nave-color-removed-one']
  const emitted = new Set(['--nave-color-surface-base', '--nave-color-added-one'])
  const drift = diffContract(recorded, emitted)
  assert.deepEqual(drift, {
    missing: ['--nave-color-removed-one'],
    added: ['--nave-color-added-one'],
  })
})

test('diffContract reports no drift when the recorded contract and the emitted set agree', () => {
  const recorded = ['--nave-color-a', '--nave-color-b']
  const emitted = new Set(recorded)
  assert.deepEqual(diffContract(recorded, emitted), { missing: [], added: [] })
})

test('formatDrift names every added and every missing token, not just a count', () => {
  const lines = formatDrift({ missing: ['--nave-color-x'], added: ['--nave-color-y'] })
  assert.equal(lines.length, 2)
  assert.ok(lines.some((l) => l.includes('--nave-color-x')))
  assert.ok(lines.some((l) => l.includes('--nave-color-y')))
})

test('formatDrift returns no lines when there is no drift', () => {
  assert.deepEqual(formatDrift({ missing: [], added: [] }), [])
})

// A review finding: every test above exercises `diffContract` / `formatDrift` /
// `readRecordedContract` DIRECTLY, and nothing runs `main()`, so the gate's PASS LINE count
// (`recorded.length`) is held by nothing at all. Measured 2026-09-12, one mutation at a time,
// before this row existed: the whole `pnpm run scripts:test` suite stayed GREEN and the gate
// exited 0 on every one: a hardcoded `21`; `recorded.length + 2` (prints "23 tokens");
// `drift.added.length` (prints "0 tokens"); and `emitted.size`. The first three print a WRONG
// number on the real repository today. The fourth is the pair row 5 names and it is genuinely
// latent: at the pass line the two
// are equal by construction (the gate got there by finding no drift), so they separate only
// where `recorded` carries a DUPLICATE, which the real recorded contract does not (21 entries,
// 21 distinct). Two differently-sized fixtures close the first three; the duplicate closes the
// fourth.
const CONTRACT_SCRIPT = 'check-core-contract-drift.mjs'
const CONTRACT_MODULE = path.join('packages', 'tokens', 'src', 'theming', 'core-contract.ts')
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Builds a self-contained tree the real script can run against: the script itself, the one
 * module it imports (node builtins only, so nothing else follows), a `packages/core/src` whose
 * real `var(--nave-*)` usage is the DISTINCT set of `recordedTokens`, and the recorded contract
 * exactly as given, duplicates included.
 *
 * `realpathSync(tmpdir())` matches the sibling fixtures' shape. It is DEFENSIVE, not
 * load-bearing: this script's entry-point guard already realpaths BOTH sides,
 * and the fixture was measured passing without it.
 */
function contractFixtureDir(recordedTokens) {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-core-contract-'))
  mkdirSync(path.join(dir, 'scripts'))
  cpSync(
    path.join(REPO_ROOT, 'scripts', CONTRACT_SCRIPT),
    path.join(dir, 'scripts', CONTRACT_SCRIPT),
  )
  mkdirSync(path.dirname(path.join(dir, CONTRACT_MODULE)), { recursive: true })
  cpSync(path.join(REPO_ROOT, CONTRACT_MODULE), path.join(dir, CONTRACT_MODULE))
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'core-contract-fixture', private: true, type: 'module' }, undefined, 2)}\n`,
  )
  mkdirSync(path.join(dir, 'packages', 'core', 'src'), { recursive: true })
  writeFileSync(
    path.join(dir, 'packages', 'core', 'src', 'fixture.ts'),
    `${[...new Set(recordedTokens)].map((name) => `export const use${name.replaceAll('-', '')} = 'var(${name})'`).join('\n')}\n`,
  )
  writeFileSync(
    path.join(dir, 'packages', 'tokens', 'core-contract.recorded.json'),
    `${JSON.stringify({ $comment: 'fixture', tokens: recordedTokens }, undefined, 2)}\n`,
  )
  return dir
}

const runContractGate = (dir) =>
  spawnSync(process.execPath, [path.join('scripts', CONTRACT_SCRIPT)], {
    cwd: dir,
    encoding: 'utf8',
  })

for (const tokens of [
  ['--nave-color-a', '--nave-color-b', '--nave-color-c'],
  [
    '--nave-color-a',
    '--nave-color-b',
    '--nave-color-c',
    '--nave-color-d',
    '--nave-color-e',
    '--nave-color-f',
    '--nave-color-g',
  ],
]) {
  test(`end to end: the pass line's count tracks a ${tokens.length}-token fixture, not a stale, hardcoded or offset value`, () => {
    const dir = contractFixtureDir(tokens)
    try {
      const result = runContractGate(dir)
      assert.equal(result.status, 0, `expected a clean pass, got stderr: ${result.stderr}`)
      assert.ok(
        (result.stdout ?? '').includes(
          `Core contract: ${tokens.length} tokens, matches the recorded contract.`,
        ),
        `expected the pass line to print the real count ${tokens.length}, got: ${JSON.stringify(result.stdout)}`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('end to end: the pass line reports the recorded array it read, not the de-duplicated emitted set', () => {
  // `diffContract` builds a Set from `recorded` before comparing, so a duplicated recorded token
  // is NOT drift and the gate still passes: here `recorded.length` is 4 and `emitted.size` is 3.
  // This is the only fixture shape that separates that pair.
  const dir = contractFixtureDir([
    '--nave-color-a',
    '--nave-color-b',
    '--nave-color-b',
    '--nave-color-c',
  ])
  try {
    const result = runContractGate(dir)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (result.status === 0) {
      assert.ok(
        output.includes('Core contract: 4 tokens, matches the recorded contract.'),
        `the pass line must report the recorded array it read (4), not the emitted set (3); got: ${JSON.stringify(output)}`,
      )
    } else {
      // A later change may lawfully REJECT a duplicated recorded contract outright. That is a
      // different and better answer, not a regression of this pin, so it passes on one
      // condition: the failure must NAME the duplicate rather than be incidental. Do not delete
      // this branch to silence a red; the pair above is unprotected the moment it goes.
      assert.match(output, /--nave-color-b/)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// `main()`'s own scan call site had no seam a test could reach, so reverting it to the
// pre-#219 hardcoded two-file census (`[reset.css, atoms.ts]`) was invisible to the whole
// suite, the drift check itself, and the shipped manifest — measured directly, one mutation
// at a time. `scanSources` is the extracted seam; these two tests assert both halves a
// parameterised default needs: the DEFAULT (what a real, unparameterised call — the shape
// `main()` actually uses — resolves to), and the INJECTED value (proving the walk is a real
// recursive directory scan, not a disguised list). Asserting only the injected value would
// leave the default — the one input production actually supplies — unverified.

test('scanSources with no argument resolves to the real packages/core/src directory (the default a production run actually takes)', () => {
  const realManifest = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'packages/tokens/core-contract.recorded.json'), 'utf8'),
  )
  const emitted = scanSources()
  assert.deepEqual([...emitted].toSorted(), [...realManifest.tokens].toSorted())
})

test('scanSources(dir) walks dir recursively rather than reading a hardcoded file list — a file the old two-file census would have missed is picked up', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'core-contract-scan-'))
  try {
    writeFileSync(path.join(dir, 'reset.css'), ':root { color: var(--nave-color-old); }')
    writeFileSync(path.join(dir, 'atoms.ts'), "const x = 'var(--nave-color-also-old)'")
    const nested = path.join(dir, 'nested')
    mkdirSync(nested)
    writeFileSync(
      path.join(nested, 'new-file.ts'),
      "const y = 'var(--nave-radius-pill)' // not in the old two-file census",
    )
    const emitted = scanSources(dir)
    assert.ok(
      emitted.has('--nave-radius-pill'),
      'a var(--nave-*) reference in a file outside the old hardcoded census must still be scanned',
    )
    assert.deepEqual(
      [...emitted].toSorted(),
      ['--nave-color-also-old', '--nave-color-old', '--nave-radius-pill'].toSorted(),
    )
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})
