import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  diffStyleProperties,
  sortedEntries,
} from './check-eslint-plugin-style-properties-drift.mjs'

test('diffStyleProperties reports no drift when both copies agree', () => {
  const copy = { ignoreValues: { 'font-size': 'a', gap: 'b' } }
  assert.deepEqual(diffStyleProperties(copy, copy), { added: [], missing: [], changed: [] })
})

test('diffStyleProperties catches a property added to the shipped config, missing from the recorded copy', () => {
  const recorded = { ignoreValues: { 'font-size': 'a' } }
  const emitted = { ignoreValues: { 'font-size': 'a', gap: 'b' } }
  assert.deepEqual(diffStyleProperties(recorded, emitted), {
    added: ['gap'],
    missing: [],
    changed: [],
  })
})

test('diffStyleProperties catches a property removed from the shipped config, still in the recorded copy', () => {
  const recorded = { ignoreValues: { 'font-size': 'a', gap: 'b' } }
  const emitted = { ignoreValues: { 'font-size': 'a' } }
  assert.deepEqual(diffStyleProperties(recorded, emitted), {
    added: [],
    missing: ['gap'],
    changed: [],
  })
})

test("diffStyleProperties catches a property's ignoreValues pattern changing without the recorded copy regenerated", () => {
  const recorded = { ignoreValues: { gap: 'old-pattern' } }
  const emitted = { ignoreValues: { gap: 'new-pattern' } }
  assert.deepEqual(diffStyleProperties(recorded, emitted), {
    added: [],
    missing: [],
    changed: ['gap'],
  })
})

test('diffStyleProperties catches a property missing from the recorded properties list, even when its ignoreValues entry is still present', () => {
  const recorded = {
    properties: ['font-size'],
    ignoreValues: { 'font-size': 'a', fill: 'b' },
  }
  const emitted = {
    properties: ['font-size', 'fill'],
    ignoreValues: { 'font-size': 'a', fill: 'b' },
  }
  assert.deepEqual(diffStyleProperties(recorded, emitted), {
    added: ['fill'],
    missing: [],
    changed: [],
  })
})

test('diffStyleProperties catches a property removed from the recorded properties list only', () => {
  const recorded = {
    properties: ['font-size', 'fill'],
    ignoreValues: { 'font-size': 'a', fill: 'b' },
  }
  const emitted = {
    properties: ['font-size'],
    ignoreValues: { 'font-size': 'a', fill: 'b' },
  }
  assert.deepEqual(diffStyleProperties(recorded, emitted), {
    added: [],
    missing: ['fill'],
    changed: [],
  })
})

test('sortedEntries orders keys alphabetically for a stable diff-friendly file', () => {
  assert.deepEqual(sortedEntries({ zebra: 1, apple: 2 }), { apple: 2, zebra: 1 })
})

const SCRIPT = 'check-eslint-plugin-style-properties-drift.mjs'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Builds a self-contained tree the real script can run against: the script itself, a stand-in
 * `packages/stylelint-config/index.js` exporting the given property list under the same rule
 * key the script reads, and a recorded copy exactly as given.
 */
function driftFixtureDir(shippedIgnoreValues, recordedIgnoreValues) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-style-drift-'))
  mkdirSync(path.join(dir, 'scripts'))
  writeFileSync(
    path.join(dir, 'scripts', SCRIPT),
    readFileSync(path.join(REPO_ROOT, 'scripts', SCRIPT)),
  )
  mkdirSync(path.join(dir, 'packages', 'stylelint-config'), { recursive: true })
  const properties = Object.keys(shippedIgnoreValues)
  writeFileSync(
    path.join(dir, 'packages', 'stylelint-config', 'index.js'),
    `export default { rules: { 'scale-unlimited/declaration-strict-value': [${JSON.stringify(properties)}, { ignoreValues: ${JSON.stringify(shippedIgnoreValues)} }] } }\n`,
  )
  mkdirSync(path.join(dir, 'packages', 'eslint-plugin', 'src', 'generated'), { recursive: true })
  writeFileSync(
    path.join(
      dir,
      'packages',
      'eslint-plugin',
      'src',
      'generated',
      'style-properties.recorded.json',
    ),
    JSON.stringify({
      $comment: 'fixture',
      properties: Object.keys(recordedIgnoreValues),
      ignoreValues: recordedIgnoreValues,
    }),
  )
  return dir
}

const runDriftGate = (dir, args = []) =>
  spawnSync(process.execPath, [path.join('scripts', SCRIPT), ...args], {
    cwd: dir,
    encoding: 'utf8',
  })

test('end to end: a matching recorded copy passes', () => {
  const shape = { 'font-size': '/^(?:inherit)$/i', gap: '/^(?:0)$/i' }
  const dir = driftFixtureDir(shape, shape)
  try {
    const result = runDriftGate(dir)
    assert.equal(result.status, 0, `expected a clean pass, got stderr: ${result.stderr}`)
    assert.match(result.stdout, /2 entries, matches the recorded copy/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('end to end: a property added to the shipped config fails the run and names it', () => {
  const dir = driftFixtureDir(
    { 'font-size': '/^(?:inherit)$/i', gap: '/^(?:0)$/i' },
    { 'font-size': '/^(?:inherit)$/i' },
  )
  try {
    const result = runDriftGate(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /gap/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('end to end: --write regenerates the recorded copy from the shipped config', () => {
  const dir = driftFixtureDir({ 'font-size': '/^(?:inherit)$/i' }, {})
  try {
    const result = runDriftGate(dir, ['--write'])
    assert.equal(result.status, 0, `expected --write to succeed, got stderr: ${result.stderr}`)
    const written = JSON.parse(
      readFileSync(
        path.join(
          dir,
          'packages',
          'eslint-plugin',
          'src',
          'generated',
          'style-properties.recorded.json',
        ),
        'utf8',
      ),
    )
    assert.deepEqual(written.properties, ['font-size'])
    assert.equal(runDriftGate(dir).status, 0, 'a second run after --write must pass with no drift')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
