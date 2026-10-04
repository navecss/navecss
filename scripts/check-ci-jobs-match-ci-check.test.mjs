/**
 * Coverage for check-ci-jobs-match-ci-check.mjs, run with Node's built-in test runner.
 *
 * The pure layer (`extractJobs`, `findStepRuns`, `compareJobsToSteps`) runs against synthetic
 * workflow text. The `main()` layer runs against a throwaway repository root, so the exit code
 * and the printed text are pinned too, and the last test runs it against this repository's own
 * workflow and step list.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  compareJobsToSteps,
  extractJobs,
  findStepRuns,
  main,
} from './check-ci-jobs-match-ci-check.mjs'

const STEP_NAMES = ['build', 'lint', 'test']

const COMPLIANT = `name: code-quality

on:
  pull_request:

jobs:
  build:
    name: build
    runs-on: ubuntu-latest
    steps:
      # pnpm run lint is mentioned in a comment, which is not a run
      - name: Build (pnpm run build)
        run: pnpm run build

  lint:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "linting"
          pnpm run lint

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['22.18.0', '']
    steps:
      - name: Run the suites
        run: pnpm run test
`

test('extractJobs reads each job id and the text of its run: values only', () => {
  const jobs = extractJobs(COMPLIANT)
  assert.deepEqual(
    jobs.map((job) => job.id),
    ['build', 'lint', 'test'],
  )
  assert.deepEqual(
    jobs[1].runs.map((run) => run.text),
    ['echo "linting"\npnpm run lint'],
  )
  // A step's name: and a YAML comment mention `pnpm run`, and neither is a run.
  assert.deepEqual(
    jobs[0].runs.map((run) => run.text),
    ['pnpm run build'],
  )
})

test('extractJobs returns null when the workflow has no jobs: section', () => {
  assert.equal(extractJobs('name: x\non: push\n'), null)
})

test('findStepRuns reads `pnpm run <x>` and the `pnpm <step>` shorthand, and ignores other pnpm commands', () => {
  const text =
    'pnpm install --frozen-lockfile\npnpm run lint && pnpm test\npnpm --filter @navecss/core exec x'
  assert.deepEqual(
    findStepRuns(text, STEP_NAMES).map((run) => run.target),
    ['lint', 'test'],
  )
})

test('findStepRuns counts pnpm only where a command starts, never as text inside another one', () => {
  assert.deepEqual(findStepRuns('echo pnpm run knip', STEP_NAMES), [])
  assert.deepEqual(
    findStepRuns('true && pnpm run lint; pnpm test | tee log', STEP_NAMES).map((run) => run.target),
    ['lint', 'test'],
  )
})

test('findStepRuns does not count a step named inside a quoted string', () => {
  assert.deepEqual(findStepRuns("echo 'notice; pnpm run test # text'", STEP_NAMES), [])
  assert.deepEqual(findStepRuns('echo "a && pnpm run lint"', STEP_NAMES), [])
})

test('findStepRuns joins a line continuation and does not read a redirect as an argument', () => {
  assert.deepEqual(findStepRuns('pnpm run test \\\n  -- --coverage.enabled=false', STEP_NAMES), [
    { args: '-- --coverage.enabled=false', target: 'test' },
  ])
  assert.deepEqual(findStepRuns('pnpm run test > log 2>&1', STEP_NAMES), [
    { args: '', target: 'test' },
  ])
})

test('findStepRuns ignores a commented-out shell line', () => {
  assert.deepEqual(findStepRuns('# pnpm run build\necho ok', STEP_NAMES), [])
})

test('GREEN: one job per step, the matrix job counted once', () => {
  assert.deepEqual(compareJobsToSteps(extractJobs(COMPLIANT), STEP_NAMES), [])
})

test('RED: a step no job runs', () => {
  const text = COMPLIANT.replace('          pnpm run lint', '          echo nothing')
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [
    '`lint` is a ci:check step that no job runs.',
  ])
})

test('RED: a step two jobs run (the old Node-floor job’s build && test)', () => {
  const text = `${COMPLIANT}
  node-floor:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm run build && pnpm run test
`
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [
    '`build` is run by more than one job: build, node-floor.',
    '`test` is run by more than one job: test, node-floor.',
  ])
})

test('RED: one job running the same step twice', () => {
  const text = COMPLIANT.replace(
    '          pnpm run lint',
    '          pnpm run lint\n          pnpm lint',
  )
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [
    'job lint runs `lint` 2 times.',
  ])
})

test('RED: a job running the whole local gate, which is not one of its steps', () => {
  const text = `${COMPLIANT}
  full-gate:
    runs-on: ubuntu-latest
    steps:
      - name: pnpm run ci:check
        run: pnpm run ci:check
`
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [
    'job full-gate mentions `ci:check`, which would run the whole local gate; ' +
      'run each step as `pnpm run <step>` instead.',
    'job full-gate runs `pnpm run ci:check`, which is not a ci:check step.',
  ])
})

test('RED: arguments passed to a step, which turbo hashes into every task it runs, build included', () => {
  const text = COMPLIANT.replace(
    'run: pnpm run test',
    'run: pnpm run test -- --coverage.enabled=false',
  )
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [
    'job test passes arguments to `test` (-- --coverage.enabled=false); run the step as ci:check does, ' +
      'with none, or turbo will not find the build output it was given and builds again.',
  ])
})

test('a step chained with && or followed by a shell comment carries no arguments', () => {
  const text = COMPLIANT.replace(
    'run: pnpm run test',
    'run: pnpm run test && echo done # the suites',
  )
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [])
})

test('RED: a step named by a GitHub expression cannot be read, so it is refused', () => {
  const text = COMPLIANT.replace('run: pnpm run build', 'run: pnpm run ${{ matrix.task }}')
  assert.deepEqual(compareJobsToSteps(extractJobs(text), STEP_NAMES), [
    'job build runs `pnpm run ${{ matrix.task }}`; name the step literally so this check can read it.',
    '`build` is a ci:check step that no job runs.',
  ])
})

/**
 * `COMPLIANT` plus one more job whose only command is `command`.
 */
const withExtraRun = (command) => `${COMPLIANT}
  extra:
    runs-on: ubuntu-latest
    steps:
      - run: ${command}
`

for (const command of [
  'pnpm -s run ci:check',
  'pnpm ci:check',
  'node scripts/run-ci-check.mjs',
  'pnpm --silent run test',
  'pnpm -w run build',
  'pnpm --filter @navecss/core run test',
]) {
  test(`RED: \`${command}\` in an extra job is refused, naming the job`, () => {
    const violations = compareJobsToSteps(extractJobs(withExtraRun(command)), STEP_NAMES)
    assert.ok(
      violations.some((violation) => violation.startsWith('job extra ')),
      `no violation names job extra for \`${command}\`: ${JSON.stringify(violations)}`,
    )
  })
}

test('RED: a flag before `run` is refused with the form to write instead', () => {
  const violations = compareJobsToSteps(
    extractJobs(withExtraRun('pnpm --silent run test')),
    STEP_NAMES,
  )
  assert.ok(violations.some((violation) => violation.includes('pnpm run <step>')))
})

test('RED: mentioning ci:check or run-ci-check in a run is refused, in any command', () => {
  for (const command of [
    'npm run ci:check',
    'pnpm ci:check:fix',
    'node ./scripts/run-ci-check.mjs --help',
  ]) {
    const violations = compareJobsToSteps(extractJobs(withExtraRun(command)), STEP_NAMES)
    assert.ok(
      violations.some((violation) => violation.startsWith('job extra ')),
      `\`${command}\` was not refused`,
    )
  }
})

test('commands that only look similar stay clean', () => {
  for (const command of [
    'pnpm install --frozen-lockfile',
    'pnpm store path --silent',
    'pnpm --filter @navecss/core exec playwright install --with-deps chromium',
    'echo pnpm run knip',
    'echo "ci:check"',
  ]) {
    const violations = compareJobsToSteps(extractJobs(withExtraRun(command)), STEP_NAMES)
    assert.deepEqual(violations, [], command)
  }
})

/**
Builds a throwaway repository root holding the given workflow text, or none.
 */
function fixtureRoot(workflowText) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-jobs-'))
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
  if (workflowText !== undefined) {
    writeFileSync(path.join(dir, '.github', 'workflows', 'code-quality.yml'), workflowText)
  }
  return dir
}

/**
Runs `main()` against a root, capturing its exit code and output without leaking either.
 */
function runMain(rootDir, stepNames = STEP_NAMES) {
  const priorExit = process.exitCode
  const priorLog = console.log
  const priorError = console.error
  const out = []
  const err = []
  process.exitCode = 0
  console.log = (...args) => out.push(args.join(' '))
  console.error = (...args) => err.push(args.join(' '))
  try {
    main(rootDir, stepNames)
  } finally {
    console.log = priorLog
    console.error = priorError
  }
  const code = process.exitCode ?? 0
  process.exitCode = priorExit
  return { code, err: err.join('\n'), out: out.join('\n') }
}

test('main() exits 0 and gives the census on a compliant workflow', () => {
  const r = runMain(fixtureRoot(COMPLIANT))
  assert.equal(r.code, 0)
  assert.equal(
    r.out,
    'CI jobs gate: each of the 3 ci:check steps is run by exactly one job in ' +
      '.github/workflows/code-quality.yml, and no job runs a step twice.',
  )
  assert.equal(r.err, '')
})

test('main() EXITS 1 and lists every violation', () => {
  const r = runMain(
    fixtureRoot(COMPLIANT.replace('          pnpm run lint', '          pnpm run test')),
  )
  assert.equal(r.code, 1)
  assert.equal(r.out, '')
  assert.match(r.err, /`lint` is a ci:check step that no job runs./)
  assert.match(r.err, /`test` is run by more than one job: lint, test./)
})

test('FAILS CLOSED: a missing workflow file', () => {
  const r = runMain(fixtureRoot())
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('FAILS CLOSED: a workflow with no jobs', () => {
  const r = runMain(fixtureRoot('name: x\non: push\n'))
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('FAILS CLOSED: an empty step list', () => {
  const r = runMain(fixtureRoot(COMPLIANT), [])
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('end to end: this repository’s workflow runs each ci:check step in exactly one job', () => {
  const priorExit = process.exitCode
  const priorLog = console.log
  const priorError = console.error
  const err = []
  process.exitCode = 0
  console.log = () => {}
  console.error = (...args) => err.push(args.join(' '))
  try {
    main()
  } finally {
    console.log = priorLog
    console.error = priorError
  }
  const code = process.exitCode ?? 0
  process.exitCode = priorExit
  assert.equal(code, 0, err.join('\n'))
})
