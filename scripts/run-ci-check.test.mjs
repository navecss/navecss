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
import { execFileSync, spawn } from 'node:child_process'
import {
  closeSync,
  constants,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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

test('validateSteps refuses an empty step list, which would otherwise pass with nothing run', () => {
  assert.throws(() => validateSteps([]), /The step list is empty/)
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

test('validateSteps refuses a waitFor that names no step', () => {
  assert.throws(
    () => validateSteps([{ after: [], name: 'a', waitFor: ['ghost'] }]),
    /a waits on ghost, which is not a step/,
  )
})

test('validateSteps refuses a cycle that runs through a waitFor', () => {
  assert.throws(
    () =>
      validateSteps([
        { after: [], name: 'a', waitFor: ['b'] },
        { after: ['a'], name: 'b' },
      ]),
    /never start: a, b/,
  )
})

test('a waitFor step starts once the step has finished, and runs even if that step failed', async () => {
  const steps = [
    { after: [], name: 'a' },
    { after: [], name: 'b', waitFor: ['a'] },
  ]
  const { finish, runStep, started } = controlledRunner()
  const done = runSteps(steps, runStep, quiet)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ['a'])
  await finish('a', 1)
  assert.deepEqual(started, ['a', 'b'])
  await finish('b')
  const results = await done
  assert.equal(results.get('a').status, 'failed')
  assert.equal(results.get('b').status, 'passed')
})

test('an `after` step that failed still skips, while a waitFor step that failed does not', async () => {
  const steps = [
    { after: [], name: 'a' },
    { after: [], name: 'b' },
    { after: ['a'], name: 'needs-a', waitFor: ['b'] },
    { after: [], name: 'after-b', waitFor: ['a', 'b'] },
  ]
  const results = await runSteps(
    steps,
    async (name) => ({ code: name === 'a' ? 1 : 0, output: '' }),
    quiet,
  )
  assert.equal(results.get('needs-a').status, 'skipped')
  assert.equal(results.get('after-b').status, 'passed')
})

test('a forced run (TURBO_FORCE) becomes one fresh, empty turbo cache shared by every step', () => {
  // Forcing each concurrent step would make every turbo step rebuild the dist/ the others are
  // reading. An empty cache directory forces the same thing once: build runs for real, and each
  // step's own tasks still miss the cache and run.
  const env = stepEnvironment({ PATH: '/bin', TURBO_FORCE: '1' }, () => '/tmp/fresh-cache')
  assert.equal(env.TURBO_FORCE, undefined)
  assert.equal(env.TURBO_CACHE_DIR, '/tmp/fresh-cache')
  assert.equal(env.PATH, '/bin')
  // A remote cache would still answer with hits, so a forced run reads and writes local only.
  assert.equal(env.TURBO_CACHE, 'local:rw')
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

const waitsFor = (name) => STEPS.find((step) => step.name === name).waitFor ?? []

test('test:browser waits for test: both regenerate core’s test/browser/fixtures/', () => {
  assert.ok(waitsFor('test:browser').includes('test'))
})

test('scripts:test waits for check:pack: it runs core’s check:pack itself, in the same directory', () => {
  assert.ok(waitsFor('scripts:test').includes('check:pack'))
})

/**
 * Runs the real `STEPS` with `failing` steps exiting 1 and the rest 0, and returns each step's
 * status.
 */
async function statusesWhenFailing(failing) {
  const results = await runSteps(
    STEPS,
    async (name) => ({ code: failing.includes(name) ? 1 : 0, output: '' }),
    { limit: 2, onStepDone: () => {} },
  )
  return Object.fromEntries([...results].map(([name, result]) => [name, result.status]))
}

test('only build is a prerequisite: a failure elsewhere does not skip a step', async () => {
  const statuses = await statusesWhenFailing(['deps:dedupe-check'])
  const others = Object.entries(statuses).filter(([name]) => name !== 'deps:dedupe-check')
  assert.equal(statuses['deps:dedupe-check'], 'failed')
  assert.deepEqual(
    others.filter(([, status]) => status !== 'passed'),
    [],
  )
})

test('a failing test skips nothing: the steps that wait for it still run', async () => {
  const statuses = await statusesWhenFailing(['test'])
  for (const name of [
    'typecheck',
    'lint',
    'check:pack',
    'test:browser',
    'scripts:test',
    'scripts:check',
  ]) {
    assert.equal(statuses[name], 'passed', `${name} was ${statuses[name]}`)
  }
})

test('a failing build skips what reads dist/ and still runs knip and the dependency checks', async () => {
  const statuses = await statusesWhenFailing(['build'])
  for (const name of ['knip', 'deps:lint', 'deps:dedupe-check']) {
    assert.equal(statuses[name], 'passed', `${name} was ${statuses[name]}`)
  }
  for (const name of [
    'typecheck',
    'lint',
    'test',
    'test:browser',
    'check:pack',
    'scripts:test',
    'scripts:check',
  ]) {
    assert.equal(statuses[name], 'skipped', `${name} was ${statuses[name]}`)
  }
})

/**
 * Runs the real `STEPS` through the scheduler with a fake `runStep` that takes a few
 * milliseconds per step, and returns each step's `[start, end]` span as the runner saw it.
 * The durations only shape the schedule: which steps overlap is decided by `after` and the cap.
 */
async function realSchedule() {
  const durations = {
    build: 6,
    'check:pack': 15,
    'deps:dedupe-check': 5,
    'deps:lint': 2,
    knip: 5,
    lint: 45,
    'scripts:check': 10,
    'scripts:test': 30,
    test: 50,
    'test:browser': 20,
    typecheck: 10,
  }
  const spans = new Map()
  await runSteps(
    STEPS,
    (name) => {
      const start = performance.now()
      return new Promise((resolve) => {
        setTimeout(() => {
          spans.set(name, [start, performance.now()])
          resolve({ code: 0, output: '' })
        }, durations[name])
      })
    },
    { limit: 2, onStepDone: () => {} },
  )
  return spans
}

const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]

test('test runs alone: it saturates the machine and writes scratch files into the tree', async () => {
  const spans = await realSchedule()
  const alongside = [...spans]
    .filter(([name, span]) => name !== 'test' && overlaps(span, spans.get('test')))
    .map(([name]) => name)
  assert.deepEqual(alongside, [])
})

test('knip does not run while build does: tsup leaves a transient config file in core', async () => {
  const spans = await realSchedule()
  assert.equal(overlaps(spans.get('knip'), spans.get('build')), false)
})

// ── Interruption, end to end ─────────────────────────────────────────────────────────────

/**
 * A stand-in for the pnpm entry point the runner starts each step with (`npm_execpath`). Every
 * step exits after `FAKE_OTHER_STEPS_MS` except the one named in `FAKE_SLOW_STEP`. That one
 * prints a line, starts a child of its own, records both process ids in `FAKE_PIDS_FILE` once
 * the child is up, ignores SIGINT as pnpm does when it is forwarded one, and then waits far
 * longer than the test does. With `FAKE_TRAP_TERM` set, both processes ignore SIGTERM as well.
 */
const FAKE_PNPM = `
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const [, , , name] = process.argv
if (name !== process.env.FAKE_SLOW_STEP) {
  setTimeout(() => process.exit(0), Number(process.env.FAKE_OTHER_STEPS_MS ?? 0))
  await new Promise(() => {})
}
console.log('the slow step is running')
process.on('SIGINT', () => {})
if (process.env.FAKE_TRAP_TERM) process.on('SIGTERM', () => {})
const child = 'if (process.env.FAKE_TRAP_TERM) process.on("SIGTERM", () => {}); console.log("up"); setInterval(() => {}, 1000)'
const grandchild = spawn(process.execPath, ['-e', child], { stdio: ['ignore', 'pipe', 'ignore'] })
grandchild.stdout.once('data', () => {
  writeFileSync(process.env.FAKE_PIDS_FILE, JSON.stringify([process.pid, grandchild.pid]))
})
setInterval(() => {}, 1000)
`

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const until = async (condition, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return condition()
}

/**
 * Resolves to what `promise` resolves to, or to `fallback` after `ms`. The timer is cleared as
 * soon as the race is settled, so a promise that wins does not leave it holding the process open.
 */
async function within(promise, ms, fallback) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Starts the real runner, in a process group of its own, with every step faked and `build` the
 * slow one, and calls `body({ child, exited, output, pids })` once the slow step is up. `exited`
 * resolves to the runner's exit code (null when a signal killed it). Whatever is still running
 * afterwards is killed by process id. With `closableOutput` the runner's stdout and stderr are a
 * real pipe (a named pipe) instead of the usual socket, and the body gets `closeOutput()`, which
 * closes the reading end the way a terminal that goes away does.
 */
async function withRunningSlowStep({ closableOutput = false, trapTerm = false }, body) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-check-signal-'))
  const pidsFile = path.join(dir, 'pids.json')
  const entry = path.join(dir, 'fake-pnpm.mjs')
  writeFileSync(entry, FAKE_PNPM)
  const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-ci-check.mjs')
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'TURBO_FORCE'),
  )
  let reader
  let stdio = ['ignore', 'pipe', 'pipe']
  if (closableOutput) {
    const fifo = path.join(dir, 'output.fifo')
    execFileSync('mkfifo', [fifo])
    reader = openSync(fifo, constants.O_RDONLY | constants.O_NONBLOCK)
    const writer = openSync(fifo, 'w')
    stdio = ['ignore', writer, writer]
  }
  const child = spawn(process.execPath, [runner], {
    detached: true,
    env: {
      ...env,
      FAKE_PIDS_FILE: pidsFile,
      FAKE_OTHER_STEPS_MS: closableOutput ? '600' : '0',
      FAKE_SLOW_STEP: 'build',
      ...(trapTerm && { FAKE_TRAP_TERM: '1' }),
      npm_execpath: entry,
    },
    stdio,
  })
  if (closableOutput) closeSync(stdio[1])
  const chunks = []
  child.stdout?.on('data', (chunk) => chunks.push(chunk))
  child.stderr?.on('data', (chunk) => chunks.push(chunk))
  const exited = new Promise((resolve) => child.on('close', (code) => resolve(code)))
  let pids = []
  try {
    // The file can be seen before its contents are complete, so wait until it parses.
    const started = await until(() => {
      try {
        pids = JSON.parse(readFileSync(pidsFile, 'utf8'))
        return true
      } catch {
        return false
      }
    }, 10_000)
    assert.ok(started, 'the slow step never started')
    await body({
      child,
      closeOutput: () => closeSync(reader),
      exited,
      output: () => Buffer.concat(chunks).toString(),
      pids,
    })
  } finally {
    try {
      pids = JSON.parse(readFileSync(pidsFile, 'utf8'))
    } catch {
      // The step never got as far as recording its processes.
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    for (const pid of pids) if (isAlive(pid)) process.kill(pid, 'SIGKILL')
    rmSync(dir, { force: true, recursive: true })
  }
}

const allGone = (pids, ms) => until(() => pids.every((pid) => !isAlive(pid)), ms)

test('SIGINT to the runner stops the step that is running, which is never reported as passed', async () => {
  await withRunningSlowStep({}, async ({ child, exited, output, pids }) => {
    const signalledAt = Date.now()
    child.kill('SIGINT')
    const code = await within(exited, 5000, 'still running')
    assert.equal(code, 130, output())
    assert.ok(Date.now() - signalledAt < 5000)
    assert.doesNotMatch(output(), /passed\s+build/)
    assert.match(output(), /FAILED\s+build/)
    assert.match(output(), /stopped: ci:check received SIGINT/)
    assert.ok(await allGone(pids, 2000), 'a step process is left')
  })
})

test('SIGHUP to the runner’s group stops the steps too, with exit code 129', async () => {
  await withRunningSlowStep({}, async ({ child, exited, output, pids }) => {
    // The steps are in sessions of their own, so a hangup on the runner's group (a closed
    // terminal) does not reach them: the runner has to pass it on.
    process.kill(-child.pid, 'SIGHUP')
    const code = await within(exited, 5000, 'still running')
    assert.equal(code, 129, output())
    assert.match(output(), /stopped: ci:check received SIGHUP/)
    assert.ok(await allGone(pids, 3000), 'a step process is left')
  })
})

test('a second signal kills the steps that ignored the first', async () => {
  await withRunningSlowStep({ trapTerm: true }, async ({ child, exited, output, pids }) => {
    child.kill('SIGINT')
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.ok(isAlive(pids[0]), 'the step should have ignored SIGTERM')
    const signalledAt = Date.now()
    child.kill('SIGINT')
    const code = await within(exited, 2000, 'still running')
    assert.equal(code, 130, output())
    assert.ok(Date.now() - signalledAt < 2000)
    assert.ok(await allGone(pids, 2000), 'a step process is left')
  })
})

test('a closed output pipe does not change the exit code of a stopped runner', async () => {
  await withRunningSlowStep(
    { closableOutput: true },
    async ({ child, closeOutput, exited, pids }) => {
      // A terminal that really closes takes the runner's stdout and stderr with it, so its next
      // write fails with EPIPE; the hangup's exit code must survive that.
      closeOutput()
      process.kill(-child.pid, 'SIGHUP')
      const code = await within(exited, 5000, 'still running')
      assert.equal(code, 129)
      assert.ok(await allGone(pids, 3000), 'a step process is left')
    },
  )
})

test('package.json runs this runner as ci:check, and ci:check:fix runs ci:check', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(scripts['ci:check'], 'node scripts/run-ci-check.mjs')
  assert.match(scripts['ci:check:fix'], /&& pnpm run ci:check$/)
})

test('test:coverage is not a step: the test step already measures coverage', () => {
  assert.equal(
    STEPS.some((step) => step.name === 'test:coverage'),
    false,
  )
})
