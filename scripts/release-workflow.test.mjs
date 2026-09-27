/**
 * Wiring test for `.github/workflows/release.yml`, the workflow that stages a release on npm.
 *
 * The npm-side trusted publisher for each package names this workflow by FILENAME and allows it
 * to stage only. Nothing on the registry checks the workflow's contents, so the properties that
 * make the arrangement safe live in this file and are pinned here as text: the exact filename,
 * a manual trigger that can only run from `main`, the `release` environment, an OIDC token and
 * no stored one, a GitHub-hosted runner, an exactly pinned npm, no cache a pull request could
 * have written, and a single release step that is the root `release` script. Parsed as plain
 * text, the same choice `check-actions-pinned-shas.mjs` makes for the same files.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'release.yml')

/**
The workflow's lines with full-line comments and trailing comments removed.
 */
function workflowCode() {
  assert.ok(
    existsSync(WORKFLOW),
    'the trusted publisher on npm names .github/workflows/release.yml exactly; it must exist under that name',
  )
  return readFileSync(WORKFLOW, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n')
}

// ROW: an allowlist, not a blocklist of named triggers. A blocklist only catches the triggers it
// names; any other key added under `on:` (a typo, a future trigger nobody thought to list here)
// would pass silently. Reading the whole block and requiring its keys to equal exactly
// `['workflow_dispatch']` catches every one of those instead of only the ones enumerated by hand.
test('the workflow is triggered by hand only', () => {
  const code = workflowCode()
  assert.match(code, /^on:\n {2}workflow_dispatch:/m)
  const lines = code.split('\n')
  const onIndex = lines.indexOf('on:')
  assert.ok(onIndex !== -1, 'release.yml must have an on: block')
  const blockLines = []
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.length > 0 && !line.startsWith(' ')) break
    blockLines.push(line)
  }
  const keys = blockLines
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trim().replace(/:.*$/, ''))
  assert.deepEqual(keys, ['workflow_dispatch'])
})

// ROW: a manual run can target any branch, so the first guard that keeps a release to reviewed
// code on main is in the workflow itself. A branch that edits this file can drop it, which is why
// the next row exists.
test('the staging job runs only from main', () => {
  assert.match(workflowCode(), /^ {4}if: github\.ref == 'refs\/heads\/main'$/m)
})

// ROW: the `if:` above is only the first guard, and a branch that edits this file can drop it.
// The `release` environment is the second, resting on two settings kept outside this repo: the
// environment's deployment branches restricted to `main` (GitHub then refuses to run the job from
// another branch while it names the environment), and each package's npm trusted publisher
// naming the same environment (npm then refuses a token from a run that dropped the line). This
// test pins only the workflow text, `environment: release`; it cannot see either setting.
test('the staging job runs in the release environment', () => {
  assert.match(workflowCode(), /^ {4}environment: release$/m)
})

// ROW: the two rows above match any line indented as a job-level key, which scopes them to the
// staging job only while it is the workflow's one job. A second job would let them pass on its
// lines instead, so adding one has to revisit them.
test('the staging job is the only job in the workflow', () => {
  const lines = workflowCode().split('\n')
  const jobsIndex = lines.indexOf('jobs:')
  assert.ok(jobsIndex !== -1, 'release.yml must have a jobs: block')
  const rest = lines.slice(jobsIndex + 1)
  const end = rest.findIndex((line) => line.length > 0 && !line.startsWith(' '))
  const jobIds = (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trim().replace(/:.*$/, ''))
  assert.deepEqual(jobIds, ['stage'])
})

// ROW: widened past the one form (`secrets.NAME`) the previous pattern caught. `secrets['NAME']`
// (bracket form) reads the same secret and was not matched before, and `NPM_AUTH_TOKEN` /
// `_authToken` are the other two names npm itself reads a credential from.
test('the job asks for an OIDC token and uses no stored npm credential', () => {
  const code = workflowCode()
  assert.match(code, /^ {6}id-token: write$/m)
  assert.doesNotMatch(code, /\bsecrets\s*[.[]|NPM_TOKEN|NODE_AUTH_TOKEN|NPM_AUTH_TOKEN|_authToken/)
})

test('the id-token permission is granted to the job, not to the whole workflow', () => {
  const code = workflowCode()
  assert.match(code, /^permissions:\n {2}contents: read$/m)
  assert.doesNotMatch(code, /^ {2}id-token: write$/m)
})

test('the job runs on a GitHub-hosted runner', () => {
  const code = workflowCode()
  assert.match(code, /^ {4}runs-on: ubuntu-latest$/m)
  assert.doesNotMatch(code, /self-hosted/)
})

test('npm is installed at an exact 12.x version and checked before anything is staged', () => {
  const code = workflowCode()
  assert.match(code, /npm install --global (?:--\S+ )*npm@12\.1\.0$/m)
  assert.match(code, /test "\$\(npm --version\)" = 12\.1\.0$/m)
})

// ROW: this job holds the OIDC permission that can stage a release, so neither install in it may
// run a lifecycle script from the package being installed.
test('both installs in the job run with lifecycle scripts off', () => {
  const code = workflowCode()
  assert.match(code, /^ {8}run: pnpm install --frozen-lockfile --ignore-scripts$/m)
  assert.match(code, /npm install --global --ignore-scripts npm@12\.1\.0$/m)
})

// ROW: widened to the bare word `publish`, so any spelling of a direct publish call (`npm
// publish`, `pnpm publish`, `pnpm -r publish`, `changeset publish`, a future one nobody has
// written yet) is caught rather than only the three forms named by hand. `stage publish` is the
// one lawful use of the word and is the only form the negative lookbehind lets through.
test('the release step is the root release script, and nothing publishes directly', () => {
  const code = workflowCode()
  assert.match(code, /^ {8}run: pnpm run release$/m)
  assert.doesNotMatch(code, /(?<!\bstage )\bpublish\b/)
})

// ROW: the stage job must not be able to hold the one OIDC-capable job open indefinitely; a hung
// registry call needs a ceiling, not an unbounded wait.
test('the stage job has a bounded timeout', () => {
  assert.match(workflowCode(), /^ {4}timeout-minutes: \d+$/m)
})

test('the checkout does not keep a credential and no cache is restored', () => {
  const code = workflowCode()
  assert.match(code, /^ {10}persist-credentials: false$/m)
  assert.doesNotMatch(code, /actions\/cache@/)
})
