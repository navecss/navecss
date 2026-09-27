/**
 * Coverage for run-gate-main.mjs, run with Node's built-in test runner.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runGateMain } from './run-gate-main.mjs'

test('returns the exit code, stdout and stderr lines the gate produced', async () => {
  const r = await runGateMain(async (rootDir) => {
    console.log('checked', rootDir)
    console.error('first problem')
    console.error('second problem')
    process.exitCode = 1
  }, '/fixture')
  assert.deepEqual(r, {
    code: 1,
    out: 'checked /fixture',
    err: 'first problem\nsecond problem',
  })
})

test('reports 0 when the gate sets no exit code, even if the runner already had one', async () => {
  process.exitCode = 3
  try {
    const r = await runGateMain(async () => {}, '/fixture')
    assert.equal(r.code, 0)
    assert.equal(process.exitCode, 3)
  } finally {
    process.exitCode = 0
  }
})

test('restores the console and the prior exit code when the gate throws', async () => {
  const priorLog = console.log
  const priorError = console.error
  process.exitCode = 0
  await assert.rejects(
    runGateMain(async () => {
      process.exitCode = 1
      throw new Error('gate crashed')
    }, '/fixture'),
    /gate crashed/,
  )
  assert.equal(console.log, priorLog)
  assert.equal(console.error, priorError)
  assert.equal(process.exitCode, 0)
})
