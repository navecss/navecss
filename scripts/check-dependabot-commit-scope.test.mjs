/**
 * Coverage for check-dependabot-commit-scope.mjs, run with Node's built-in test runner.
 *
 * Armed-not-vacuous is the point (a lesson generalised from an earlier finding: a rule existing
 * in source proves it is configured, never that it would fire), so the ARMED tests below
 * reproduce the actual defect this gate exists to catch — a `deps-dev` scope commitlint's
 * scope-enum rejects — and must turn a real pass into a real failure, or this gate is
 * decorative.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  extractCommitMessageConfig,
  extractNpmEcosystemBlock,
  findCommitScopeViolations,
  main,
} from './check-dependabot-commit-scope.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const COMMITLINT_RULES = {
  typeEnum: ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'perf', 'ci', 'build', 'style'],
  scopeEnum: ['tokens', 'core', 'bridge', 'cli', 'repo', 'deps', 'release'],
}

const BASELINE_YAML = `version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps)'
    groups:
      dev-dependencies:
        dependency-type: 'development'

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
`

test('extractNpmEcosystemBlock slices from the npm entry up to the next ecosystem entry', () => {
  const block = extractNpmEcosystemBlock(BASELINE_YAML)
  assert.match(block, /package-ecosystem: 'npm'/)
  assert.match(block, /prefix: 'chore\(deps\)'/)
  assert.doesNotMatch(block, /github-actions/)
})

test('extractNpmEcosystemBlock returns null when there is no npm entry', () => {
  assert.equal(
    extractNpmEcosystemBlock("version: 2\nupdates:\n  - package-ecosystem: 'github-actions'\n"),
    null,
  )
})

test('extractCommitMessageConfig reads prefix and prefix-development', () => {
  const block = extractNpmEcosystemBlock(BASELINE_YAML)
  assert.deepEqual(extractCommitMessageConfig(block), {
    prefix: 'chore(deps)',
    prefixDevelopment: 'chore(deps)',
    includeScope: false,
  })
})

test('extractCommitMessageConfig returns null when commit-message is absent', () => {
  const noCommitMessage = `  - package-ecosystem: 'npm'
    directory: '/'
`
  assert.equal(extractCommitMessageConfig(noCommitMessage), null)
})

test('extractCommitMessageConfig detects include: scope', () => {
  const withIncludeScope = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps)'
      include: 'scope'
`
  assert.equal(extractCommitMessageConfig(withIncludeScope).includeScope, true)
})

test('baseline: a matching prefix/prefix-development pair has no violations', () => {
  const config = { prefix: 'chore(deps)', prefixDevelopment: 'chore(deps)', includeScope: false }
  assert.deepEqual(findCommitScopeViolations(config, COMMITLINT_RULES), [])
})

test('ARMED — the real defect: prefix-development left to default inference (deps-dev) is caught', () => {
  // Dependabot's own inferred shape for a development-dependency update when no
  // prefix-development is set — the scope commitlint's scope-enum does not list.
  const config = {
    prefix: 'chore(deps)',
    prefixDevelopment: 'chore(deps-dev)',
    includeScope: false,
  }
  const violations = findCommitScopeViolations(config, COMMITLINT_RULES)
  assert.ok(violations.length > 0)
  assert.match(violations.join('\n'), /differ/)
  assert.match(violations.join('\n'), /deps-dev.*not in commitlint\.config\.js's.*scope-enum/s)
})

test('ARMED — include: scope is flagged even when prefix/prefix-development match', () => {
  const config = { prefix: 'chore(deps)', prefixDevelopment: 'chore(deps)', includeScope: true }
  const violations = findCommitScopeViolations(config, COMMITLINT_RULES)
  assert.match(violations.join('\n'), /include is 'scope'/)
})

test('ARMED — a type outside type-enum is caught', () => {
  const config = { prefix: 'bump(deps)', prefixDevelopment: 'bump(deps)', includeScope: false }
  const violations = findCommitScopeViolations(config, COMMITLINT_RULES)
  assert.match(violations.join('\n'), /type 'bump', not in commitlint\.config\.js's/)
})

test('ARMED — a scope outside scope-enum is caught', () => {
  const config = {
    prefix: 'chore(vendor)',
    prefixDevelopment: 'chore(vendor)',
    includeScope: false,
  }
  const violations = findCommitScopeViolations(config, COMMITLINT_RULES)
  assert.match(violations.join('\n'), /scope 'vendor', not in commitlint\.config\.js's/)
})

test('ARMED — an unparseable prefix (no parenthesised scope) is caught', () => {
  const config = { prefix: 'chore', prefixDevelopment: 'chore', includeScope: false }
  const violations = findCommitScopeViolations(config, COMMITLINT_RULES)
  assert.match(violations.join('\n'), /does not parse as/)
})

/**
Builds a throwaway repo root with the given dependabot.yml text and a real, minimal
commitlint.config.js exporting the given rules.
 */
function fixtureRoot(dependabotYaml, rules = COMMITLINT_RULES) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dependabot-scope-'))
  mkdirSync(path.join(dir, '.github'), { recursive: true })
  writeFileSync(path.join(dir, '.github', 'dependabot.yml'), dependabotYaml)
  writeFileSync(
    path.join(dir, 'commitlint.config.js'),
    `export default { rules: { 'scope-enum': [2, 'always', ${JSON.stringify(
      rules.scopeEnum,
    )}], 'type-enum': [2, 'always', ${JSON.stringify(rules.typeEnum)}] } }\n`,
  )
  return dir
}

/**
Runs `main()` against a fixture root, capturing its exit code and output without leaking either.
 */
async function runMain(rootDir) {
  const priorExit = process.exitCode
  const priorLog = console.log
  const priorError = console.error
  const out = []
  const err = []
  process.exitCode = 0
  console.log = (...args) => out.push(args.join(' '))
  console.error = (...args) => err.push(args.join(' '))
  try {
    await main(rootDir)
  } finally {
    console.log = priorLog
    console.error = priorError
  }
  const code = process.exitCode ?? 0
  process.exitCode = priorExit
  return { code, out: out.join('\n'), err: err.join('\n') }
}

test('main() exits 0 on a sound baseline fixture', async () => {
  const r = await runMain(fixtureRoot(BASELINE_YAML))
  assert.equal(r.code, 0)
  assert.match(r.out, /no include: scope present/)
  assert.equal(r.err, '')
})

test('main() EXITS 1 on the real deps-dev defect shape, end to end', async () => {
  const brokenYaml = BASELINE_YAML.replace(
    "prefix-development: 'chore(deps)'",
    "prefix-development: 'chore(deps-dev)'",
  )
  const r = await runMain(fixtureRoot(brokenYaml))
  assert.equal(r.code, 1)
  assert.equal(r.out, '')
  assert.match(r.err, /violation/)
})

test('FAILS CLOSED: main() EXITS 1 when there is no npm ecosystem entry', async () => {
  const r = await runMain(
    fixtureRoot("version: 2\nupdates:\n  - package-ecosystem: 'github-actions'\n"),
  )
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('FAILS CLOSED: main() EXITS 1 when the npm entry carries no commit-message block', async () => {
  const r = await runMain(
    fixtureRoot("version: 2\nupdates:\n  - package-ecosystem: 'npm'\n    directory: '/'\n"),
  )
  assert.equal(r.code, 1)
  assert.match(r.err, /carries no commit-message/)
})

test('end to end: the real repo tree passes today', async () => {
  const r = await runMain(ROOT)
  assert.equal(r.code, 0, r.err)
  assert.equal(r.err, '')
})
