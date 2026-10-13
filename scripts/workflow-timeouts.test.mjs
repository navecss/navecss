/**
 * Every job in every workflow under `.github/workflows/` sets `timeout-minutes`. Without it a
 * hung step holds a runner for GitHub's default of six hours, and the run stays pending the whole
 * time. Read as plain text, the same choice `release-workflow.test.mjs` and
 * `check-actions-pinned-shas.mjs` make for the same files: comments are removed, the `jobs:` block
 * is split at its two-space-indented keys, and each job's own block must hold a job-level
 * `timeout-minutes:` (four spaces in) with a positive whole number. A key on a step, or in a
 * sibling job, does not count.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = path.join(ROOT, '.github', 'workflows')

/**
 * The workflow's lines with full-line comments and trailing comments removed.
 */
function codeLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''))
}

/**
 * Each job of the workflow `text`, as `{ name, lines }` with the job's own lines, in file order.
 */
function jobsOf(text) {
  const lines = codeLines(text)
  const start = lines.indexOf('jobs:')
  if (start === -1) return []
  const jobs = []
  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) break
    const key = /^ {2}([\w-]+):\s*$/.exec(line)
    if (key) jobs.push({ name: key[1], lines: [] })
    else jobs.at(-1)?.lines.push(line)
  }
  return jobs
}

/**
 * The jobs of `text` that do not set a job-level `timeout-minutes` with a positive whole number,
 * each described with the problem.
 */
function jobsWithoutTimeout(text) {
  return jobsOf(text).flatMap(({ name, lines }) => {
    const values = lines.flatMap((line) => {
      const found = /^ {4}timeout-minutes:\s*(.*?)\s*$/.exec(line)
      return found ? [found[1]] : []
    })
    if (values.length === 0) return [`${name} (no timeout-minutes)`]
    return /^[1-9]\d*$/.test(values[0]) ? [] : [`${name} (timeout-minutes: ${values[0]})`]
  })
}

test('control: a job with a timeout passes', () => {
  assert.deepEqual(
    jobsWithoutTimeout('jobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n'),
    [],
  )
})

test('control: a job without one is named', () => {
  assert.deepEqual(jobsWithoutTimeout('jobs:\n  a:\n    runs-on: ubuntu-latest\n'), [
    'a (no timeout-minutes)',
  ])
})

test('control: a key in a sibling job, or on a step, does not count for this job', () => {
  const sibling =
    'jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n  b:\n    runs-on: x\n    steps:\n      - run: y\n        timeout-minutes: 5\n'

  assert.deepEqual(jobsWithoutTimeout(sibling), ['b (no timeout-minutes)'])
})

test('control: a commented-out key does not count', () => {
  assert.deepEqual(
    jobsWithoutTimeout(
      'jobs:\n  a:\n    runs-on: x\n    # timeout-minutes: 10\n  b:\n    runs-on: x\n    timeout-minutes: 5 # five\n',
    ),
    ['a (no timeout-minutes)'],
  )
})

test('control: a value that is not a positive whole number is named', () => {
  for (const value of ['0', '-5', '1.5', 'ten', '${{ vars.LIMIT }}', '']) {
    assert.deepEqual(
      jobsWithoutTimeout(`jobs:\n  a:\n    runs-on: x\n    timeout-minutes: ${value}\n`),
      [`a (timeout-minutes: ${value})`],
      `timeout-minutes: ${value}`,
    )
  }
})

test('control: every job of a multi-job file is found, and only the jobs block is read', () => {
  const text =
    'name: w\non:\n  push:\n    branches: [main]\njobs:\n  one:\n    runs-on: x\n  two-b:\n    runs-on: x\n  three_c:\n    runs-on: x\npermissions:\n  late:\n    timeout-minutes: 1\n'

  assert.deepEqual(
    jobsOf(text).map((job) => job.name),
    ['one', 'two-b', 'three_c'],
  )
})

test('every job in every workflow sets timeout-minutes', () => {
  const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'))
  const missing = []
  for (const file of files) {
    const text = readFileSync(path.join(WORKFLOWS, file), 'utf8')
    assert.ok(jobsOf(text).length > 0, `${file}: no jobs found`)
    for (const problem of jobsWithoutTimeout(text)) missing.push(`${file}: ${problem}`)
  }

  assert.ok(files.length > 0, 'no workflow files found')
  assert.deepEqual(
    missing,
    [],
    'a job with no timeout holds a runner for six hours when a step hangs',
  )
})
