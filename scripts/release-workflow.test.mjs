/**
 * Wiring test for `.github/workflows/release.yml`, the workflow that stages a release on npm.
 *
 * The npm-side trusted publisher for each package names this workflow by FILENAME and allows it
 * to stage only. Nothing on the registry checks the workflow's contents, so the properties that
 * make the arrangement safe live in this file and are pinned here as text: the exact filename,
 * a manual trigger that can only run from `main`, an OIDC token and no stored one, a
 * GitHub-hosted runner, an exactly pinned npm, no cache a pull request could have written, and a
 * single release step that is the root `release` script. Parsed as plain text, the same choice
 * `check-actions-pinned-shas.mjs` makes for the same files.
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

test('the workflow is triggered by hand only', () => {
  const code = workflowCode()
  assert.match(code, /^on:\n {2}workflow_dispatch:/m)
  for (const trigger of [
    'push',
    'pull_request',
    'pull_request_target',
    'schedule',
    'workflow_run',
    'release',
  ]) {
    assert.doesNotMatch(
      code,
      new RegExp(`^ {2}${trigger}:`, 'm'),
      `release.yml must not run on ${trigger}`,
    )
  }
})

// ROW: a manual run can target any branch, and the trusted publisher does not restrict the ref,
// so the guard that keeps a release to reviewed code on main has to be in the workflow.
test('the staging job runs only from main', () => {
  assert.match(workflowCode(), /^ {4}if: github\.ref == 'refs\/heads\/main'$/m)
})

test('the job asks for an OIDC token and uses no stored npm credential', () => {
  const code = workflowCode()
  assert.match(code, /^ {6}id-token: write$/m)
  assert.doesNotMatch(code, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./)
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

test('the release step is the root release script, and nothing publishes directly', () => {
  const code = workflowCode()
  assert.match(code, /^ {8}run: pnpm run release$/m)
  assert.doesNotMatch(code, /(?<!stage )\bnpm publish\b|pnpm publish|changeset publish/)
})

test('the checkout does not keep a credential and no cache is restored', () => {
  const code = workflowCode()
  assert.match(code, /^ {10}persist-credentials: false$/m)
  assert.doesNotMatch(code, /actions\/cache@/)
})
