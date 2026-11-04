/**
 * The `test:browser` job downloads three browser engines before it runs a test, and that download
 * has stalled to the job's cap on three runs in one day, each passing on a re-run. The step
 * therefore has its own `timeout-minutes`, well under the job's, and runs the install twice, each
 * attempt under `timeout`, so a stalled mirror fails fast and the second attempt gets a chance
 * instead of eating the job. Read as plain text, as `workflow-timeouts.test.mjs` does; the step's
 * script is run against stand-ins for `pnpm` and `timeout` to see what it does on each outcome.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'code-quality.yml')
const STEP = "- name: Install Playwright's browser engines"

/**
 * The lines of the step `STEP` in `text`, from its `- name:` line to the line before the next step
 * of the same job.
 */
function stepLines(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === STEP)
  if (start === -1) return []
  const indent = lines[start].indexOf('-')
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(
    (line) =>
      line.trim() !== '' && line.search(/\S/) <= indent && !line.trimStart().startsWith('#'),
  )
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))]
}

/**
 * The step's `timeout-minutes`, or `undefined`.
 */
function stepTimeout(lines) {
  const found = lines.map((line) => /^\s+timeout-minutes:\s*(\d+)\s*$/.exec(line)).find(Boolean)
  return found ? Number(found[1]) : undefined
}

/**
 * The step's `run` script, dedented: a block (`run: |`) or a single line. `undefined` when the step
 * has none.
 */
function stepScript(lines) {
  const single = lines.map((line) => /^\s+run:\s+([^|\s].*)$/.exec(line)).find(Boolean)
  if (single) return single[1]
  const start = lines.findIndex((line) => /^\s+run:\s*\|\s*$/.test(line))
  if (start === -1) return undefined
  const body = lines.slice(start + 1).filter((line) => !line.trimStart().startsWith('#'))
  const indent = body[0]?.search(/\S/) ?? 0
  return body.map((line) => line.slice(indent)).join('\n')
}

const lines = stepLines(readFileSync(WORKFLOW, 'utf8'))

test('control: the step is found, and a workflow without it has no lines', () => {
  assert.ok(lines.length > 1)
  assert.deepEqual(stepLines('jobs:\n  a:\n    steps:\n      - run: x\n'), [])
})

test('the install step has its own timeout, well under the job’s', () => {
  const minutes = stepTimeout(lines)

  assert.ok(minutes !== undefined, 'the step sets no timeout-minutes')
  assert.ok(minutes <= 15, `the step's ${minutes} minutes is not well under the job's 30`)
})

test('the install step still installs the three engines in one command', () => {
  assert.match(stepScript(lines) ?? '', /playwright install --with-deps chromium firefox webkit/)
})

/**
 * Runs the step's script with a `pnpm` that exits with the next of `codes` and a `timeout` that
 * records its arguments and runs the command it wraps. Resolves to the script's exit code, how
 * many times the install ran and what `timeout` was given.
 */
function runScript(codes) {
  const script = stepScript(lines)
  assert.ok(script !== undefined, 'the step has no run script')
  const directory = mkdtempSync(path.join(tmpdir(), 'playwright-step-'))
  try {
    const bin = (name, body) => {
      writeFileSync(path.join(directory, name), `#!/bin/bash\n${body}\n`)
      chmodSync(path.join(directory, name), 0o755)
    }
    writeFileSync(path.join(directory, 'codes'), codes.join('\n'))
    bin(
      'pnpm',
      [
        `echo run >> "${directory}/runs"`,
        `n=$(wc -l < "${directory}/runs")`,
        `exit "$(sed -n "\${n}p" "${directory}/codes")"`,
      ].join('\n'),
    )
    bin(
      'timeout',
      `echo "$*" >> "${directory}/timeouts"\nwhile [[ "$1" == -* ]]; do shift; done\nshift\nexec "$@"`,
    )
    const file = path.join(directory, 'step.sh')
    writeFileSync(file, `PATH="${directory}:$PATH"\n${script}`)
    // The runner's shell for a step with no `shell:` key.
    const result = spawnSync('bash', ['-e', file], { encoding: 'utf8' })
    const read = (name) => {
      try {
        return readFileSync(path.join(directory, name), 'utf8').split('\n').filter(Boolean)
      } catch {
        return []
      }
    }
    return { code: result.status, runs: read('runs').length, timeouts: read('timeouts') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('an install that succeeds runs once', () => {
  const outcome = runScript([0])

  assert.equal(outcome.code, 0)
  assert.equal(outcome.runs, 1)
})

test('an install that stalls once runs again, and the step passes when the second attempt does', () => {
  const outcome = runScript([124, 0])

  assert.equal(outcome.code, 0)
  assert.equal(outcome.runs, 2)
})

test('an install that fails twice fails the step after two attempts and no more', () => {
  const outcome = runScript([124, 124, 0])

  assert.notEqual(outcome.code, 0)
  assert.equal(outcome.runs, 2)
})

test('each attempt runs under timeout, cut off after five minutes and killed thirty seconds later', () => {
  const outcome = runScript([124, 0])

  assert.equal(outcome.timeouts.length, 2)
  for (const given of outcome.timeouts) assert.match(given, /^--kill-after=30s 5m pnpm /)
})

test('the step’s own limit outlasts both attempts and their kill-after grace', () => {
  const given = /timeout --kill-after=(\d+)s (\d+)m /.exec(stepScript(lines) ?? '')
  assert.ok(given, 'no timeout with --kill-after and a limit in minutes')
  const [graceSeconds, attemptMinutes] = [Number(given[1]), Number(given[2])]
  const minutes = stepTimeout(lines)
  assert.ok(minutes !== undefined, 'the step sets no timeout-minutes')
  assert.ok(
    minutes * 60 > 2 * (attemptMinutes * 60 + graceSeconds),
    `the step's ${minutes} minutes cut off the second attempt (2 x (${attemptMinutes} min + ${graceSeconds} s))`,
  )
})

test('the step names no shell, so the runner gives it bash -e', () => {
  assert.ok(lines.every((line) => !/^\s+shell:/.test(line)))
})
