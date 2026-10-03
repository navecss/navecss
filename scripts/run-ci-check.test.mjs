/**
 * Coverage for run-ci-check.mjs, run with Node's built-in test runner.
 *
 * The scheduler is driven with an injected `runStep`, so these tests prove the ordering and
 * reporting rules without spawning a single real gate: which steps start together, which wait,
 * what a failure does to the steps waiting on it, and what the summary says. The last group
 * reads the real step list and pins the ordering edges that exist because two steps write the
 * same files.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatSummary, runSteps, stepEnvironment, STEPS, validateSteps } from './run-ci-check.mjs'

/**
 * A `runStep` whose steps finish only when the test says so, recording the order they start in.
 * `finish(name, code)` settles one running step.
 */
function controlledRunner() {
  const started = []
  const pending = new Map()
  const runStep = (name) =>
    new Promise((resolve) => {
      started.push(name)
      pending.set(name, resolve)
    })
  const finish = async (name, code = 0) => {
    pending.get(name)({ code, output: `${name} output\n` })
    // Let the scheduler react to the settled step before the test looks again.
    await new Promise((resolve) => setImmediate(resolve))
  }
  return { finish, runStep, started }
}

const quiet = { onStepDone: () => {} }

test('steps with no `after` start together, before anything they do not wait on finishes', async () => {
  const steps = [
    { after: [], name: 'a' },
    { after: [], name: 'b' },
    { after: ['a'], name: 'c' },
  ]
  const { finish, runStep, started } = controlledRunner()
  const done = runSteps(steps, runStep, quiet)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ['a', 'b'])
  await finish('a')
  assert.deepEqual(started, ['a', 'b', 'c'])
  await finish('b')
  await finish('c')
  const results = await done
  assert.deepEqual(
    steps.map((step) => results.get(step.name).status),
    ['passed', 'passed', 'passed'],
  )
})

test('a step waits for EVERY step it names in `after`, not just the first to finish', async () => {
  const steps = [
    { after: [], name: 'build' },
    { after: [], name: 'test' },
    { after: ['build', 'test'], name: 'test:browser' },
  ]
  const { finish, runStep, started } = controlledRunner()
  const done = runSteps(steps, runStep, quiet)
  await new Promise((resolve) => setImmediate(resolve))
  await finish('build')
  assert.deepEqual(started, ['build', 'test'])
  await finish('test')
  assert.deepEqual(started, ['build', 'test', 'test:browser'])
  await finish('test:browser')
  await done
})

test('a failed step skips the steps waiting on it, transitively, and leaves the rest running', async () => {
  const steps = [
    { after: [], name: 'build' },
    { after: ['build'], name: 'test' },
    { after: ['test'], name: 'test:browser' },
    { after: [], name: 'knip' },
  ]
  const { finish, runStep, started } = controlledRunner()
  const done = runSteps(steps, runStep, quiet)
  await new Promise((resolve) => setImmediate(resolve))
  await finish('build', 1)
  await finish('knip')
  const results = await done
  assert.deepEqual(started, ['build', 'knip'])
  assert.equal(results.get('build').status, 'failed')
  assert.equal(results.get('test').status, 'skipped')
  assert.equal(results.get('test').reason, 'build did not pass')
  assert.equal(results.get('test:browser').status, 'skipped')
  assert.equal(results.get('test:browser').reason, 'test did not pass')
  assert.equal(results.get('knip').status, 'passed')
})

test('no more than `limit` steps run at once; the next ready step starts when one finishes', async () => {
  const steps = [
    { after: [], name: 'a' },
    { after: [], name: 'b' },
    { after: [], name: 'c' },
  ]
  const { finish, runStep, started } = controlledRunner()
  const done = runSteps(steps, runStep, { ...quiet, limit: 2 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ['a', 'b'])
  await finish('b')
  assert.deepEqual(started, ['a', 'b', 'c'])
  await finish('a')
  await finish('c')
  await done
})

test('each finished step is reported once, with its own output, as it finishes', async () => {
  const steps = [
    { after: [], name: 'a' },
    { after: [], name: 'b' },
  ]
  const reported = []
  const { finish, runStep } = controlledRunner()
  const done = runSteps(steps, runStep, {
    onStepDone: (name, result) => reported.push([name, result.status, result.output]),
  })
  await new Promise((resolve) => setImmediate(resolve))
  await finish('b', 2)
  await finish('a')
  await done
  assert.deepEqual(reported, [
    ['b', 'failed', 'b output\n'],
    ['a', 'passed', 'a output\n'],
  ])
})

test('the summary lists every step in declared order and names the ones that did not pass', () => {
  const results = new Map([
    ['lint', { durationMs: 35_000, status: 'failed' }],
    ['test:browser', { reason: 'lint did not pass', status: 'skipped' }],
    ['typecheck', { durationMs: 8100, status: 'passed' }],
  ])
  const summary = formatSummary(['typecheck', 'lint', 'test:browser'], results)
  const lines = summary.split('\n')
  assert.match(lines[1], /passed\s+typecheck\s+8\.1s/)
  assert.match(lines[2], /FAILED\s+lint\s+35\.0s/)
  assert.match(lines[3], /skipped\s+test:browser\s+\(lint did not pass\)/)
  assert.equal(lines.at(-1), 'ci:check: 2 of 3 steps did not pass: lint, test:browser')
})

test('the summary of a clean run says every step passed', () => {
  const results = new Map([
    ['a', { durationMs: 1000, status: 'passed' }],
    ['b', { durationMs: 2000, status: 'passed' }],
  ])
  assert.equal(
    formatSummary(['a', 'b'], results).split('\n').at(-1),
    'ci:check: all 2 steps passed',
  )
})

test('validateSteps refuses an `after` that names no step', () => {
  assert.throws(
    () => validateSteps([{ after: ['biuld'], name: 'test' }]),
    /test waits on biuld, which is not a step/,
  )
})

test('validateSteps refuses a step declared twice', () => {
  assert.throws(
    () =>
      validateSteps([
        { after: [], name: 'lint' },
        { after: [], name: 'lint' },
      ]),
    /lint is declared twice/,
  )
})

test('validateSteps refuses a cycle, which would otherwise leave steps waiting forever', () => {
  assert.throws(
    () =>
      validateSteps([
        { after: ['b'], name: 'a' },
        { after: ['a'], name: 'b' },
      ]),
    /never start: a, b/,
  )
})

test('a forced run (TURBO_FORCE) becomes one fresh, empty turbo cache shared by every step', () => {
  // Forcing each concurrent step would make every turbo step rebuild the dist/ the others are
  // reading. An empty cache directory forces the same thing once: build runs for real, and each
  // step's own tasks still miss the cache and run.
  const env = stepEnvironment({ PATH: '/bin', TURBO_FORCE: '1' }, () => '/tmp/fresh-cache')
  assert.equal(env.TURBO_FORCE, undefined)
  assert.equal(env.TURBO_CACHE_DIR, '/tmp/fresh-cache')
  assert.equal(env.PATH, '/bin')
})

test('TURBO_FORCE=false is not a forced run', () => {
  const env = stepEnvironment({ TURBO_FORCE: 'false' }, () => assert.fail('no cache dir needed'))
  assert.equal(env.TURBO_FORCE, 'false')
  assert.equal(env.TURBO_CACHE_DIR, undefined)
})

test('an ordinary run passes the environment through unchanged', () => {
  const base = { PATH: '/bin' }
  assert.deepEqual(
    stepEnvironment(base, () => assert.fail('no cache dir needed')),
    base,
  )
})

// ── The real step list ───────────────────────────────────────────────────────────────────

const after = (name) => STEPS.find((step) => step.name === name).after

test('the real step list is valid', () => {
  assert.doesNotThrow(() => validateSteps(STEPS))
})

test('every step that reads built output waits for build', () => {
  for (const name of [
    'typecheck',
    'lint',
    'test',
    'test:browser',
    'check:pack',
    'scripts:test',
    'scripts:check',
  ]) {
    assert.ok(after(name).includes('build'), `${name} must wait for build`)
  }
})

test('test:browser waits for test: both regenerate core’s test/browser/fixtures/', () => {
  assert.ok(after('test:browser').includes('test'))
})

test('scripts:test waits for check:pack: it runs core’s check:pack itself, in the same directory', () => {
  assert.ok(after('scripts:test').includes('check:pack'))
})

test('test:coverage is not a step: the test step already measures coverage', () => {
  assert.equal(
    STEPS.some((step) => step.name === 'test:coverage'),
    false,
  )
})
