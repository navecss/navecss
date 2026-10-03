#!/usr/bin/env node
/**
 * The local `pnpm run ci:check` gate: every check CI runs, in one command, as fast as the
 * machine allows.
 *
 * Each step is one root `package.json` script, run as `pnpm run <step>`, and CI runs each of
 * them as its own job (`.github/workflows/code-quality.yml`;
 * `check-ci-jobs-match-ci-check.mjs` keeps the two in step). Locally they run CONCURRENTLY: a
 * step starts as soon as every step it names in `after` has passed, so the whole gate takes
 * about as long as its slowest chain rather than the sum of its steps. A step whose `after`
 * did not pass is skipped rather than run against output that was never produced, and named in
 * the summary.
 *
 * `after` is not a preference about order, it is a statement that two steps would otherwise
 * collide, so each edge carries its reason:
 *
 * - build first, for every step that reads `dist/`. The turbo tasks among them already depend
 *   on `build` in `turbo.json`, but two turbo processes building the same package at once would
 *   both write its `dist/`. Once `build` has finished, the others find it in turbo's cache with
 *   the same files already on disk and leave them untouched.
 * - `test:browser` after `test`: both run core's fixture generators, which rewrite
 *   `packages/core/test/browser/fixtures/` while the other suite may be reading it.
 * - `scripts:test` after `check:pack`: one of its tests runs core's own `check:pack`, which
 *   packs a tarball inside the package directory, the same place the `check:pack` step packs.
 *
 * `TURBO_FORCE=1 pnpm run ci:check` still runs everything uncached: see `stepEnvironment`.
 *
 * Output is kept per step: each step's combined stdout and stderr is printed as one block when
 * it finishes, then a summary lists every step in the order below with its result and time.
 * The order of `STEPS` is also the order `.github/CONTRIBUTING.md` documents them in
 * (`check-ci-check-order.mjs`).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const STEPS = [
  { after: ['build'], name: 'typecheck' },
  { after: ['build'], name: 'lint' },
  { after: ['build'], name: 'test' },
  { after: ['build', 'test'], name: 'test:browser' },
  { after: [], name: 'build' },
  { after: ['build'], name: 'check:pack' },
  { after: [], name: 'knip' },
  { after: [], name: 'deps:lint' },
  { after: [], name: 'deps:dedupe-check' },
  { after: ['build', 'check:pack'], name: 'scripts:test' },
  { after: ['build'], name: 'scripts:check' },
]

/**
 * How many steps run at once. Every step already runs its own work in parallel (turbo across
 * packages, vitest across files), so running all eleven at once does not finish sooner: it
 * overloads the machine until the suites' own timeouts fire.
 */
const CONCURRENT_STEPS = 2

/**
 * Throws if `steps` cannot all be run: a name declared twice, an `after` naming no step, or a
 * cycle, which would leave its members waiting forever.
 */
export function validateSteps(steps) {
  const names = new Set()
  for (const step of steps) {
    if (names.has(step.name)) throw new Error(`${step.name} is declared twice.`)
    names.add(step.name)
  }
  for (const step of steps) {
    for (const name of step.after) {
      if (!names.has(name)) throw new Error(`${step.name} waits on ${name}, which is not a step.`)
    }
  }
  const reachable = new Set()
  let grew = true
  while (grew) {
    grew = false
    for (const step of steps) {
      if (reachable.has(step.name) || step.after.some((name) => !reachable.has(name))) continue
      reachable.add(step.name)
      grew = true
    }
  }
  const stuck = steps.filter((step) => !reachable.has(step.name)).map((step) => step.name)
  if (stuck.length > 0) {
    throw new Error(`these steps wait on each other and would never start: ${stuck.join(', ')}.`)
  }
}

/**
 * Runs `steps` through `runStep(name)` (a promise of `{ code, output }`), each as soon as
 * everything in its `after` has passed. Resolves to a Map of name to
 * `{ status: 'passed' | 'failed' | 'skipped', durationMs?, output?, reason? }`, and calls
 * `onStepDone(name, result)` once per step as its result is known. At most `limit` steps run at
 * once; when more are ready, the earliest in `steps` goes first.
 */
export function runSteps(steps, runStep, { limit = Infinity, onStepDone }) {
  const results = new Map()
  const started = new Set()
  let running = 0
  const { promise: finished, resolve: finish } = Promise.withResolvers()

  const settle = (name, result) => {
    results.set(name, result)
    onStepDone(name, result)
  }

  const execute = async (name) => {
    const startedAt = Date.now()
    const { code, output } = await runStep(name)
    running -= 1
    settle(name, {
      durationMs: Date.now() - startedAt,
      output,
      status: code === 0 ? 'passed' : 'failed',
    })
    advance()
  }

  const advance = () => {
    // A skip can unblock (and skip) a step earlier in the list, so sweep until nothing moves.
    let skipped = true
    while (skipped) {
      skipped = false
      for (const step of steps) {
        if (started.has(step.name)) continue
        const blocker = step.after.find(
          (name) => results.has(name) && results.get(name).status !== 'passed',
        )
        if (blocker !== undefined) {
          started.add(step.name)
          settle(step.name, { reason: `${blocker} did not pass`, status: 'skipped' })
          skipped = true
          continue
        }
        if (running >= limit || step.after.some((name) => !results.has(name))) continue
        started.add(step.name)
        running += 1
        // Never rejects: a step's failure is a result, settled inside `execute`.
        void execute(step.name)
      }
    }
    if (results.size === steps.length) finish(results)
  }

  advance()
  return finished
}

/**
The summary block: one line per step in `names` order, then a verdict line.
 */
export function formatSummary(names, results) {
  const width = Math.max(...names.map((name) => name.length))
  const lines = ['ci:check summary']
  for (const name of names) {
    const result = results.get(name)
    const label = { failed: 'FAILED ', passed: 'passed ', skipped: 'skipped' }[result.status]
    const detail =
      result.status === 'skipped'
        ? `(${result.reason})`
        : `${(result.durationMs / 1000).toFixed(1).padStart(6)}s`
    lines.push(`  ${label}  ${name.padEnd(width)}  ${detail}`)
  }
  const notPassed = names.filter((name) => results.get(name).status !== 'passed')
  lines.push(
    notPassed.length === 0
      ? `ci:check: all ${names.length} steps passed`
      : `ci:check: ${notPassed.length} of ${names.length} steps did not pass: ${notPassed.join(', ')}`,
  )
  return lines.join('\n')
}

/**
 * The environment every step runs in. A forced run (`TURBO_FORCE=1`, the usual way to certify
 * with turbo's cache off) cannot be passed to concurrent steps as it is: each turbo step would
 * rebuild the packages it depends on, rewriting `dist/` while the others read it. It becomes one
 * fresh, empty cache directory from `makeCacheDir` instead, shared by every step, which forces
 * the same thing once: `build` runs for real, and every step's own tasks miss the cache and run.
 */
export function stepEnvironment(env, makeCacheDir) {
  const forced = env.TURBO_FORCE !== undefined && !['', '0', 'false'].includes(env.TURBO_FORCE)
  if (!forced) return env
  const rest = Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'TURBO_FORCE'))
  return { ...rest, TURBO_CACHE_DIR: makeCacheDir() }
}

/**
 * Runs `pnpm run <name>` in `env` with its stdout and stderr captured, in arrival order, into
 * one string. `pnpm` is the very pnpm that started this gate (`pnpmEntry`, from
 * `npm_execpath`), run by this Node, so no step depends on what `PATH` resolves `pnpm` to.
 */
function runPnpmScript(name, env, pnpmEntry) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [pnpmEntry, 'run', name], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks = []
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => chunks.push(chunk))
    child.on('error', (error) => resolve({ code: 1, output: `${error.message}\n` }))
    child.on('close', (code) =>
      resolve({ code: code ?? 1, output: Buffer.concat(chunks).toString() }),
    )
  })
}

/**
Prints one finished step: a header naming it and its result, then everything it printed.
 */
function printStep(name, result) {
  const header =
    result.status === 'skipped'
      ? `── ${name}: skipped, ${result.reason} ──`
      : `── ${name}: ${result.status} in ${(result.durationMs / 1000).toFixed(1)}s ──`
  console.log(`\n${header}`)
  if (result.output) process.stdout.write(result.output)
}

/**
 * Runs every step, prints each as it finishes and then the summary, and exits 1 unless all
 * passed. `env` is this process's environment, where `pnpm run` puts its own entry point.
 */
async function main(env = process.env) {
  const pnpmEntry = env.npm_execpath
  if (!pnpmEntry) {
    console.error('ci:check: run this as `pnpm run ci:check`, so the steps use the same pnpm.')
    process.exitCode = 1
    return
  }
  validateSteps(STEPS)
  const names = STEPS.map((step) => step.name)
  let freshCacheDir
  const stepEnv = {
    ...stepEnvironment(env, () => {
      freshCacheDir = mkdtempSync(path.join(tmpdir(), 'ci-check-turbo-cache-'))
      return freshCacheDir
    }),
  }
  // The steps write to a pipe, not a terminal, so keep their colour when this process has one.
  if (process.stdout.isTTY) stepEnv.FORCE_COLOR = '1'
  console.log(`ci:check: running ${names.length} steps: ${names.join(', ')}`)
  if (freshCacheDir) console.log(`ci:check: TURBO_FORCE is set, so every step uses an empty cache`)
  try {
    const results = await runSteps(STEPS, (name) => runPnpmScript(name, stepEnv, pnpmEntry), {
      limit: CONCURRENT_STEPS,
      onStepDone: printStep,
    })
    console.log(`\n${formatSummary(names, results)}`)
    if (names.some((name) => results.get(name).status !== 'passed')) process.exitCode = 1
  } finally {
    if (freshCacheDir) rmSync(freshCacheDir, { force: true, recursive: true })
  }
}

// Compare REALPATHS on both sides: `import.meta.url` is symlink-resolved by Node and
// `process.argv[1]` is not, so a symlinked invocation path would otherwise never run `main()`.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  await main()
}
