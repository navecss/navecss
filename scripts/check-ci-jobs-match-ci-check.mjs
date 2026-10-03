#!/usr/bin/env node
/**
 * Tripwire for keeping CI's jobs and the local `ci:check` gate the same set of checks.
 *
 * `pnpm run ci:check` runs every step in `run-ci-check.mjs`'s `STEPS` locally, in one command.
 * CI runs the same steps granularly, one job each, so a red run names the check that failed
 * without anyone reading a log. The two drifted once already: CI ran the four commonest steps as
 * jobs and then ran the whole local gate again in a fifth, so those four ran twice (and the
 * suites three times, counting the coverage run and the Node-floor job), while a dozen other
 * checks sat inside one red-or-green job.
 *
 * PROPERTY ASSERTED, over `.github/workflows/code-quality.yml`:
 *
 * 1. every `ci:check` step is run by exactly one job;
 * 2. no job runs the same step twice;
 * 3. every `pnpm run <script>` in that workflow names a `ci:check` step, so the whole gate
 *    (`pnpm run ci:check`) or a script the local gate never runs cannot creep back in.
 *
 * A matrix job counts once: its legs run the same step on purpose (the Node-floor legs of
 * `build` and `test` are the one deliberate repeat, on a different Node).
 *
 * A step counts where it appears in a `run:` value, as `pnpm run <step>` or the `pnpm <step>`
 * shorthand; a step's `name:` and YAML or shell comments do not count. A `pnpm run` whose
 * target is a GitHub expression (`pnpm run ${{ matrix.task }}`) cannot be resolved without
 * evaluating the workflow, so it is refused rather than guessed at: name each step literally.
 *
 * Parsed as plain text, not with a YAML parser, the same choice `check-actions-pinned-shas.mjs`
 * makes: a job is a two-space-indented key under the top-level `jobs:`, and a `run:` value is
 * either inline or a block scalar indented under its key.
 *
 * FAILS CLOSED when the workflow file is missing, when it has no jobs, or when the step list is
 * empty: each of those would otherwise compare nothing and report green.
 *
 * NO MAPPING TABLE: a job's step is read from the command it runs, never from a list naming
 * which job runs which step, because such a list would be one more hand transcription to drift.
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { STEPS } from './run-ci-check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = '.github/workflows/code-quality.yml'

/**
 * The block scalar under a `run: |` key at `keyIndex`: the following lines indented deeper than
 * the key (blank lines included), de-indented and joined. Returns its text and the index of its
 * last line.
 */
function readBlockScalar(lines, keyIndex, keyIndent) {
  const block = []
  let index = keyIndex
  while (index + 1 < lines.length) {
    const next = lines[index + 1]
    if (next.trim() !== '' && next.search(/\S/) <= keyIndent) break
    block.push(next)
    index += 1
  }
  const indent = Math.min(...block.filter((b) => b.trim() !== '').map((b) => b.search(/\S/)))
  const text = block
    .map((b) => b.slice(indent))
    .join('\n')
    .trim()
  return { end: index, text }
}

/**
 * The jobs under the top-level `jobs:` key, in file order, as `{ id, runs: [{ text }] }` where
 * `text` is one `run:` value (a block scalar's lines joined, de-indented). Returns null when
 * there is no `jobs:` section or it holds no job.
 */
export function extractJobs(workflowText) {
  const lines = workflowText.split(/\r?\n/)
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  if (start === -1) return null

  const jobs = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const jobKey = /^ {2}([\w-]+):\s*$/.exec(line)
    if (jobKey) jobs.push({ id: jobKey[1], runs: [] })

    const runKey = /^\s*(?:-\s+)?run:\s*(.*)$/.exec(line)
    if (!runKey || jobs.length === 0) continue
    const value = runKey[1].trim()
    if (/^[|>]/.test(value)) {
      const block = readBlockScalar(lines, index, line.indexOf('run:'))
      jobs.at(-1).runs.push({ text: block.text })
      index = block.end
    } else {
      jobs.at(-1).runs.push({ text: value })
    }
  }
  return jobs.length > 0 ? jobs : null
}

/**
 * The scripts one `run:` value runs through pnpm, as `{ target }`: every `pnpm run <x>`, and
 * every `pnpm <step>` shorthand naming one of `stepNames`. Shell comment lines are ignored, and
 * so is any other pnpm command (`pnpm install`, `pnpm --filter ... exec`).
 */
export function findStepRuns(runText, stepNames) {
  const found = []
  for (const line of runText.split('\n')) {
    if (line.trimStart().startsWith('#')) continue
    for (const match of line.matchAll(/\bpnpm\s+(run\s+)?(\$\{\{[^}]*\}\}|[\w:-]+)/g)) {
      const [, run, target] = match
      if (run || stepNames.includes(target)) found.push({ target })
    }
  }
  return found
}

/**
Every way `jobs` departs from the property in the header, as one sentence each; empty when none.
 */
export function compareJobsToSteps(jobs, stepNames) {
  const violations = []
  const jobsByStep = new Map(stepNames.map((name) => [name, []]))

  for (const job of jobs) {
    const counts = new Map()
    for (const run of job.runs) {
      for (const { target } of findStepRuns(run.text, stepNames)) {
        if (target.startsWith('${{')) {
          violations.push(
            `job ${job.id} runs \`pnpm run ${target}\`; name the step literally so this check can read it.`,
          )
        } else if (stepNames.includes(target)) {
          counts.set(target, (counts.get(target) ?? 0) + 1)
        } else {
          violations.push(
            `job ${job.id} runs \`pnpm run ${target}\`, which is not a ci:check step.`,
          )
        }
      }
    }
    for (const [step, count] of counts) {
      jobsByStep.get(step).push(job.id)
      if (count > 1) violations.push(`job ${job.id} runs \`${step}\` ${count} times.`)
    }
  }

  for (const [step, jobIds] of jobsByStep) {
    if (jobIds.length === 0) violations.push(`\`${step}\` is a ci:check step that no job runs.`)
    if (jobIds.length > 1) {
      violations.push(`\`${step}\` is run by more than one job: ${jobIds.join(', ')}.`)
    }
  }
  return violations
}

/**
 * Runs the comparison and exits non-zero on any violation, or when there is nothing to
 * compare. `rootDir` and `stepNames` are parameters so a test can drive a scratch tree.
 */
export function main(rootDir = ROOT, stepNames = STEPS.map((step) => step.name)) {
  if (stepNames.length === 0) {
    console.error('CI jobs gate: refusing to run. The ci:check step list is empty.')
    process.exitCode = 1
    return
  }

  let workflowText
  try {
    workflowText = readFileSync(path.join(rootDir, WORKFLOW), 'utf8')
  } catch (error) {
    console.error(`CI jobs gate: refusing to run. Could not read ${WORKFLOW} (${error.message}).`)
    process.exitCode = 1
    return
  }

  const jobs = extractJobs(workflowText)
  if (jobs === null) {
    console.error(`CI jobs gate: refusing to run. Found no jobs under \`jobs:\` in ${WORKFLOW}.`)
    process.exitCode = 1
    return
  }

  const violations = compareJobsToSteps(jobs, stepNames)
  if (violations.length > 0) {
    console.error(`CI jobs gate: ${WORKFLOW} and the local ci:check gate disagree:\n`)
    for (const violation of violations) console.error(`  - ${violation}`)
    console.error(
      '\nEach step in scripts/run-ci-check.mjs should be run by exactly one job, as ' +
        '`pnpm run <step>`, and no job should run anything else through `pnpm run`.',
    )
    process.exitCode = 1
    return
  }

  console.log(
    `CI jobs gate: each of the ${stepNames.length} ci:check steps is run by exactly one job in ` +
      `${WORKFLOW}, and no job runs a step twice.`,
  )
}

// Compare REALPATHS on both sides: `import.meta.url` is symlink-resolved by Node and
// `process.argv[1]` is not, so a symlinked invocation path would otherwise never run `main()`.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
