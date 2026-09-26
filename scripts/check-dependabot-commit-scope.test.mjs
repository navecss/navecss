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
  extractNpmEcosystemBlocks,
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

test('extractNpmEcosystemBlocks slices from the npm entry up to the next ecosystem entry', () => {
  const [block] = extractNpmEcosystemBlocks(BASELINE_YAML)
  assert.match(block, /package-ecosystem: 'npm'/)
  assert.match(block, /prefix: 'chore\(deps\)'/)
  assert.doesNotMatch(block, /github-actions/)
})

test('extractNpmEcosystemBlocks returns an empty array when there is no npm entry', () => {
  assert.deepEqual(
    extractNpmEcosystemBlocks("version: 2\nupdates:\n  - package-ecosystem: 'github-actions'\n"),
    [],
  )
})

test('extractNpmEcosystemBlocks returns one block per npm entry', () => {
  const twoNpmYaml = `version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
  - package-ecosystem: 'npm'
    directory: '/packages/tokens'
  - package-ecosystem: 'github-actions'
    directory: '/'
`
  const blocks = extractNpmEcosystemBlocks(twoNpmYaml)
  assert.equal(blocks.length, 2)
  assert.match(blocks[0], /directory: '\/'/)
  assert.match(blocks[1], /directory: '\/packages\/tokens'/)
  assert.doesNotMatch(blocks[1], /github-actions/)
})

test('extractCommitMessageConfig reads prefix and prefix-development', () => {
  const [block] = extractNpmEcosystemBlocks(BASELINE_YAML)
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

// R1: prefix and prefix-development carry DIFFERENT literal values, so a field-swap mutation
// (prefixMatch and prefixDevMatch assigned to the wrong output field) would flip them and this
// assertion would catch it. The existing "reads prefix and prefix-development" test above uses
// the SAME value for both fields, so it cannot: swapping two identical values is invisible.
test('R1: extractCommitMessageConfig keeps prefix and prefix-development in their own fields', () => {
  const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(repo)'
`
  assert.deepEqual(extractCommitMessageConfig(block), {
    prefix: 'chore(deps)',
    prefixDevelopment: 'chore(repo)',
    includeScope: false,
  })
})

test('R2: extractCommitMessageConfig parses a prefix line carrying a trailing YAML comment', () => {
  const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: 'chore(deps)' # note
      prefix-development: 'chore(deps)'
`
  assert.equal(extractCommitMessageConfig(block)?.prefix, 'chore(deps)')
})

test('R3: extractCommitMessageConfig detects include: scope with a trailing comment', () => {
  const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps)'
      include: scope # note
`
  assert.equal(extractCommitMessageConfig(block)?.includeScope, true)
})

test('R4: extractNpmEcosystemBlocks finds an unquoted npm ecosystem line', () => {
  const yaml = `version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
`
  assert.equal(extractNpmEcosystemBlocks(yaml).length, 1)
})

test('R4: extractNpmEcosystemBlocks finds a double-quoted npm line with a trailing comment', () => {
  const yaml = `version: 2
updates:
  - package-ecosystem: "npm" # note
    directory: '/'
`
  assert.equal(extractNpmEcosystemBlocks(yaml).length, 1)
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

/**
Builds a throwaway repo root with no `.github/dependabot.yml` at all (R6's fixture).
 */
function fixtureRootMissingDependabot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dependabot-scope-'))
  writeFileSync(
    path.join(dir, 'commitlint.config.js'),
    `export default { rules: { 'scope-enum': [2, 'always', ${JSON.stringify(
      COMMITLINT_RULES.scopeEnum,
    )}], 'type-enum': [2, 'always', ${JSON.stringify(COMMITLINT_RULES.typeEnum)}] } }\n`,
  )
  return dir
}

/**
Builds a throwaway repo root with the given dependabot.yml text and the EXACT given
commitlint.config.js source, for R7/R8's malformed-config fixtures.
 */
function fixtureRootWithCommitlintSource(dependabotYaml, commitlintSource) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dependabot-scope-'))
  mkdirSync(path.join(dir, '.github'), { recursive: true })
  writeFileSync(path.join(dir, '.github', 'dependabot.yml'), dependabotYaml)
  writeFileSync(path.join(dir, 'commitlint.config.js'), commitlintSource)
  return dir
}

const TWO_NPM_YAML = `version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps)'

  - package-ecosystem: 'npm'
    directory: '/packages/tokens'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps-dev)'

  - package-ecosystem: 'github-actions'
    directory: '/'
`

test('R5: main() exits 1 when a SECOND npm entry carries the deps-dev defect, and names it', async () => {
  const r = await runMain(fixtureRoot(TWO_NPM_YAML))
  assert.equal(r.code, 1)
  assert.match(r.err, /packages\/tokens/)
})

test('R6: main() EXITS 1 refusing to run when .github/dependabot.yml is missing', async () => {
  const r = await runMain(fixtureRootMissingDependabot())
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('R7: main() EXITS 1 refusing to run when commitlint.config.js throws on import', async () => {
  const r = await runMain(
    fixtureRootWithCommitlintSource(BASELINE_YAML, "throw new Error('synthetic import failure')\n"),
  )
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('R8: main() EXITS 1 refusing to run when commitlint.config.js exports no type-enum', async () => {
  const r = await runMain(
    fixtureRootWithCommitlintSource(
      BASELINE_YAML,
      "export default { rules: { 'scope-enum': [2, 'always', ['deps']] } }\n",
    ),
  )
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('R9: an empty quoted prefix yields a parse violation, not "carries no prefix"', async () => {
  const brokenYaml = BASELINE_YAML.replace("prefix: 'chore(deps)'", "prefix: ''")
  const r = await runMain(fixtureRoot(brokenYaml))
  assert.equal(r.code, 1)
  assert.doesNotMatch(r.err, /carries no commit-message/)
  assert.match(r.err, /does not parse as/)
})

test('R10: a `!` breaking-change marker on prefix stays a violation (ruled, not a bug)', async () => {
  const brokenYaml = BASELINE_YAML.replace(
    "prefix: 'chore(deps)'\n      prefix-development: 'chore(deps)'",
    "prefix: 'chore(deps)!'\n      prefix-development: 'chore(deps)!'",
  )
  const r = await runMain(fixtureRoot(brokenYaml))
  assert.equal(r.code, 1)
  assert.match(r.err, /does not parse as/)
})

// --- Round 2 rows -----------------------------------------------------------------------

test('N6: a bare prefix value with trailing blanks and no comment still trims cleanly', () => {
  const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: chore(deps)
      prefix-development: chore(deps)
`
  assert.deepEqual(extractCommitMessageConfig(block), {
    prefix: 'chore(deps)',
    prefixDevelopment: 'chore(deps)',
    includeScope: false,
  })
})

test('N2: package-ecosystem: npmx is not an npm entry', () => {
  const yaml = `version: 2
updates:
  - package-ecosystem: npmx
    directory: '/'
`
  assert.deepEqual(extractNpmEcosystemBlocks(yaml), [])
})

test("a doubled single-quote escape ('it''s') parses to it's, then fails to parse as <type>(<scope>)", async () => {
  const brokenYaml = BASELINE_YAML.replace("prefix: 'chore(deps)'", "prefix: 'it''s'")
  const r = await runMain(fixtureRoot(brokenYaml))
  assert.equal(r.code, 1)
  assert.match(r.err, /does not parse as/)
  assert.match(r.err, /it's/)
})

const REORDERED_SECOND_NPM_YAML = `version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps)'

  - directory: '/packages/tokens'
    package-ecosystem: npm
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps-dev)'

  - package-ecosystem: 'github-actions'
    directory: '/'
`

test('NEW-1 Row A: a reordered SECOND npm entry (ecosystem key not first) after a good one is still checked and named', async () => {
  const r = await runMain(fixtureRoot(REORDERED_SECOND_NPM_YAML))
  assert.equal(r.code, 1)
  assert.match(r.err, /packages\/tokens/)
  assert.match(r.err, /scope-enum/)
})

const REORDERED_ALONE_NPM_YAML = `version: 2
updates:
  - directory: '/packages/tokens'
    package-ecosystem: npm
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps-dev)'
`

test('NEW-1 Row B: a reordered npm entry ALONE is found and its defect named, not a not-found refusal', async () => {
  const r = await runMain(fixtureRoot(REORDERED_ALONE_NPM_YAML))
  assert.equal(r.code, 1)
  assert.doesNotMatch(r.err, /refusing to run/)
  assert.match(r.err, /scope-enum/)
})

const TIMING_BUDGET_MS = 2000
const TIMING_TEST_TIMEOUT_MS = 5000

test(
  'R2-1b: 5000 blank lines then a bare "x" line returns within budget (quadratic-but-small at this n)',
  { timeout: TIMING_TEST_TIMEOUT_MS },
  () => {
    const block = `${'\n'.repeat(5000)}x`
    const start = performance.now()
    extractCommitMessageConfig(block)
    const elapsed = performance.now() - start
    assert.ok(elapsed < TIMING_BUDGET_MS, `took ${elapsed}ms, budget ${TIMING_BUDGET_MS}ms`)
  },
)

test(
  'R2-1a: a 5000-space unclosed-quote prefix line returns within budget, not cubically',
  { timeout: TIMING_TEST_TIMEOUT_MS },
  () => {
    const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: ${' '.repeat(5000)}'
      prefix-development: 'chore(deps)'
`
    const start = performance.now()
    extractCommitMessageConfig(block)
    const elapsed = performance.now() - start
    assert.ok(elapsed < TIMING_BUDGET_MS, `took ${elapsed}ms, budget ${TIMING_BUDGET_MS}ms`)
  },
)

test(
  'R2-1c: a block with valid prefix lines plus one line of 60_000 blanks then "x" returns within budget',
  { timeout: TIMING_TEST_TIMEOUT_MS },
  () => {
    const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: 'chore(deps)'
${' '.repeat(60_000)}x
`
    const start = performance.now()
    extractCommitMessageConfig(block)
    const elapsed = performance.now() - start
    assert.ok(elapsed < TIMING_BUDGET_MS, `took ${elapsed}ms, budget ${TIMING_BUDGET_MS}ms`)
  },
)

test(
  'R2-1d: a prefix-development line with 60_000 trailing blanks before a bare tail returns within budget',
  { timeout: TIMING_TEST_TIMEOUT_MS },
  () => {
    const block = `  - package-ecosystem: 'npm'
    commit-message:
      prefix: 'chore(deps)'
      prefix-development: x${' '.repeat(60_000)}y
`
    const start = performance.now()
    extractCommitMessageConfig(block)
    const elapsed = performance.now() - start
    assert.ok(elapsed < TIMING_BUDGET_MS, `took ${elapsed}ms, budget ${TIMING_BUDGET_MS}ms`)
  },
)

test(
  'R2-1e: extractNpmEcosystemBlocks returns within budget when a line of 60_000 blanks then "z" ' +
    'precedes the package-ecosystem line (so isNpmBlock cannot short-circuit on an earlier match)',
  { timeout: TIMING_TEST_TIMEOUT_MS },
  () => {
    // The spam line sits BEFORE the matching package-ecosystem line: isNpmBlock's `.some()`
    // stops at the first matching line, so if the spam line came after a match `.some()` would
    // never test it and this row would be vacuous regardless of the regex's own cost.
    const yaml = `version: 2
updates:
  - directory: '/'
${' '.repeat(60_000)}z
    package-ecosystem: 'npm'
`
    const start = performance.now()
    extractNpmEcosystemBlocks(yaml)
    const elapsed = performance.now() - start
    assert.ok(elapsed < TIMING_BUDGET_MS, `took ${elapsed}ms, budget ${TIMING_BUDGET_MS}ms`)
  },
)
