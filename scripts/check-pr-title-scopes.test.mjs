/**
 * Coverage for check-pr-title-scopes.mjs, run with Node's built-in test runner.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { main } from './check-pr-title-scopes.mjs'
import { runGateMain } from './run-gate-main.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const COMMITLINT_RULES = {
  typeEnum: [
    'feat',
    'fix',
    'chore',
    'docs',
    'test',
    'refactor',
    'perf',
    'ci',
    'build',
    'style',
    'revert',
  ],
  scopeEnum: ['tokens', 'core', 'base-ui', 'cli', 'repo', 'deps', 'release'],
}

const TYPES_BLOCK = `          types: |
            feat
            fix
            chore
            docs
            test
            refactor
            perf
            ci
            build
            style
            revert
`

const SCOPES_BLOCK = `          scopes: |
            tokens
            core
            base-ui
            cli
            repo
            deps
            release
`

/**
Builds a full pr-title.yml body from a `with:` inner block (already indented as it would
appear in the real file), so each test only has to state the one input list it is varying.
 */
function workflowWithInner(withInner) {
  return `name: pr-title

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50 # v6
        with:
${withInner}        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`
}

const BASELINE_WORKFLOW = workflowWithInner(TYPES_BLOCK + SCOPES_BLOCK)

/**
Builds a throwaway repo root with the given pr-title.yml text and a real, minimal
commitlint.config.js exporting the given rules.
 */
function fixtureRoot(workflowYaml, rules = COMMITLINT_RULES) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-title-scopes-'))
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
  if (workflowYaml !== null) {
    writeFileSync(path.join(dir, '.github', 'workflows', 'pr-title.yml'), workflowYaml)
  }
  writeFileSync(
    path.join(dir, 'commitlint.config.js'),
    `export default { rules: { 'scope-enum': [2, 'always', ${JSON.stringify(
      rules.scopeEnum,
    )}], 'type-enum': [2, 'always', ${JSON.stringify(rules.typeEnum)}] } }\n`,
  )
  return dir
}

/**
Builds a throwaway repo root with the given pr-title.yml text and the EXACT given
commitlint.config.js source, for the malformed-config fixtures.
 */
function fixtureRootWithCommitlintSource(workflowYaml, commitlintSource) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-title-scopes-'))
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })
  writeFileSync(path.join(dir, '.github', 'workflows', 'pr-title.yml'), workflowYaml)
  writeFileSync(path.join(dir, 'commitlint.config.js'), commitlintSource)
  return dir
}

const runMain = (rootDir) => runGateMain(main, rootDir)

test('a workflow whose types and scopes match commitlint exactly passes', async () => {
  const r = await runMain(fixtureRoot(BASELINE_WORKFLOW))
  assert.equal(r.code, 0, r.err)
  assert.match(r.out, /11 type\(s\) and 7 scope\(s\)/)
  assert.equal(r.err, '')
})

test('a workflow missing the scopes input entirely is flagged by name, not silently skipped', async () => {
  const r = await runMain(fixtureRoot(workflowWithInner(TYPES_BLOCK)))
  assert.equal(r.code, 1)
  assert.match(r.err, /no `scopes: \|` input/)
})

test('a scope entry that is not a plain word is flagged, naming the entry and the regex risk', async () => {
  const badScopes = SCOPES_BLOCK.replace('deps', 'de.*s')
  const r = await runMain(fixtureRoot(workflowWithInner(TYPES_BLOCK + badScopes)))
  assert.equal(r.code, 1)
  assert.match(r.err, /'de\.\*s'/)
  assert.match(r.err, /regular expression/)
})

test('a duplicated scope entry is flagged, naming the entry that repeats', async () => {
  const dupedScopes = SCOPES_BLOCK.replace(
    '            release\n',
    '            release\n            release\n',
  )
  const r = await runMain(fixtureRoot(workflowWithInner(TYPES_BLOCK + dupedScopes)))
  assert.equal(r.code, 1)
  assert.match(r.err, /'release' is duplicated/)
})

test('a scope present in the workflow but absent from commitlint is flagged by name', async () => {
  const extraScopes = SCOPES_BLOCK.replace(
    '            release\n',
    '            release\n            vendor\n',
  )
  const r = await runMain(fixtureRoot(workflowWithInner(TYPES_BLOCK + extraScopes)))
  assert.equal(r.code, 1)
  assert.match(r.err, /'vendor' is in the workflow but not in commitlint\.config\.js's scope-enum/)
})

test('a scope present in commitlint but missing from the workflow is flagged by name', async () => {
  const shortScopes = SCOPES_BLOCK.replace('            release\n', '')
  const r = await runMain(fixtureRoot(workflowWithInner(TYPES_BLOCK + shortScopes)))
  assert.equal(r.code, 1)
  assert.match(r.err, /'release' is in commitlint\.config\.js's scope-enum but not in the workflow/)
})

test('a type in commitlint but missing from the workflow is flagged against type-enum', async () => {
  const shortTypes = TYPES_BLOCK.replace('            revert\n', '')
  const r = await runMain(fixtureRoot(workflowWithInner(shortTypes + SCOPES_BLOCK)))
  assert.equal(r.code, 1)
  assert.match(
    r.err,
    /types: 'revert' is in commitlint\.config\.js's type-enum but not in the workflow/,
  )
})

test('refuses to run when pr-title.yml is missing entirely', async () => {
  const r = await runMain(fixtureRoot(null))
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
  assert.match(r.err, /Could not read/)
})

test('refuses to run when no step in the workflow uses the semantic-pull-request action', async () => {
  const noActionYaml = `name: pr-title

on:
  pull_request:
    types: [opened]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
`
  const r = await runMain(fixtureRoot(noActionYaml))
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
  assert.match(r.err, /Could not find a step using/)
})

test('refuses to run when commitlint.config.js throws on import', async () => {
  const r = await runMain(
    fixtureRootWithCommitlintSource(
      BASELINE_WORKFLOW,
      "throw new Error('synthetic import failure')\n",
    ),
  )
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('the real repository workflow matches the real repository commitlint config', async () => {
  const r = await runMain(ROOT)
  assert.equal(r.code, 0, r.err)
  assert.equal(r.err, '')
})

const TIMING_BUDGET_MS = 2000
const TIMING_TEST_TIMEOUT_MS = 5000

test(
  'a scopes block with one pathological line of spaces followed by a quote returns within budget',
  { timeout: TIMING_TEST_TIMEOUT_MS },
  async () => {
    const pathologicalLine = `${' '.repeat(60_000)}'`
    const pathologicalScopes = `${SCOPES_BLOCK}${pathologicalLine}\n`
    const rootDir = fixtureRoot(workflowWithInner(TYPES_BLOCK + pathologicalScopes))
    const start = performance.now()
    const r = await runMain(rootDir)
    const elapsed = performance.now() - start
    assert.ok(elapsed < TIMING_BUDGET_MS, `took ${elapsed}ms, budget ${TIMING_BUDGET_MS}ms`)
    assert.equal(r.code, 1)
  },
)

test('a run script that merely mentions the action is not a step using it, so the gate refuses', async () => {
  const mentionOnlyYaml = `name: pr-title

on:
  pull_request:
    types: [opened]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: |
          - uses: amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50
            with:
              scopes: |
                .*
`
  const r = await runMain(fixtureRoot(mentionOnlyYaml))
  assert.equal(r.code, 1)
  assert.match(r.err, /Could not find a step using/)
})
