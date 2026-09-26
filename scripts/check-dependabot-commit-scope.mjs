#!/usr/bin/env node
/**
 * Tripwire for Dependabot writing a commit prefix that `commitlint.config.js`'s `commit-msg`
 * hook would reject.
 *
 * Dependabot infers a conventional-commit-shaped prefix from the repository's own history when
 * `.github/dependabot.yml` sets none, and for a development-dependency update that inferred
 * prefix is `chore(deps-dev)` — a scope `commitlint.config.js`'s `scope-enum` does not list
 * (only `deps` is). Nothing catches this before merge: Dependabot commits via the GitHub API,
 * never through a local `git commit`, so the `commit-msg` hook that would reject the same
 * subject from a human author never runs against it. `pr-title.yml` does check the pull
 * request title, which a squash merge lands as the commit subject, but it sets no `scopes:`
 * list, so it accepts `deps-dev` there too.
 *
 * The fix lives in `.github/dependabot.yml`'s `commit-message` block: `prefix` AND
 * `prefix-development` set to the SAME literal string (deliberately not `include: scope`, which
 * is what produces the `deps`/`deps-dev` split in the first place). This check reads that
 * literal prefix back out of the YAML and verifies it parses as `<type>(<scope>)` against
 * `commitlint.config.js`'s own `type-enum`/`scope-enum` arrays — the canonical list, imported
 * live rather than restated here, so the two cannot drift apart silently.
 *
 * Parsed as plain text, not a YAML parser, following every sibling `scripts/check-*.mjs`
 * (`check-actions-pinned-shas.mjs`'s docblock states the reason once): the shape this reads is
 * a handful of `key: value` lines, and a full parse buys nothing over anchoring on them
 * directly.
 *
 * Scoped to the `npm` ecosystem block only: that is the one shape this repository has actual
 * evidence of Dependabot miswriting (a merged pull request's own follow-up commit was rejected
 * by the local `commit-msg` hook on exactly this scope). No merged commit from the
 * `github-actions` ecosystem has ever tripped `commitlint`, so extending the check to a block
 * with no observed failure would be inventing a requirement, not fixing one.
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Slices `dependabotText` down to every `package-ecosystem: npm` block (quoted, double-quoted,
 * or bare, with or without a trailing comment): from each such line up to (not including) the
 * next top-level `- package-ecosystem:` entry of ANY ecosystem, or end of file. Returns an
 * empty array if no npm block is found at all — the fail-closed signal `main()` checks for.
 * Dependabot's own schema permits any of the three quoting styles, so a repository free to
 * write `npm` unquoted is not a shape this check may treat as absent.
 */
export function extractNpmEcosystemBlocks(dependabotText) {
  const lines = dependabotText.split('\n')
  const entryStartIndexes = []
  for (const [index, line] of lines.entries()) {
    if (/^\s*-\s*package-ecosystem:/.test(line)) entryStartIndexes.push(index)
  }

  const npmBlocks = []
  for (const [position, startIndex] of entryStartIndexes.entries()) {
    if (!isNpmEcosystemLine(lines[startIndex])) continue
    const nextStartIndex = entryStartIndexes[position + 1] ?? lines.length
    npmBlocks.push(lines.slice(startIndex, nextStartIndex).join('\n'))
  }

  return npmBlocks
}

/**
 * Whether `line` is a `- package-ecosystem:` entry naming `npm`, in any of the three styles
 * YAML allows for a scalar (single-quoted, double-quoted, bare) and tolerating a trailing
 * comment. The lookahead after the bare form stops it matching a longer word that merely
 * starts with `npm` (there is no such ecosystem today, but nothing rules one out).
 */
function isNpmEcosystemLine(line) {
  return /^\s*-\s*package-ecosystem:\s*(?:'npm'|"npm"|npm(?=[\s#]|$))/.test(line)
}

/**
 * Reads the first `prefix:` and `prefix-development:` lines anywhere in `ecosystemBlock` (a
 * trailing YAML comment on the line is ignored), without checking that they sit under
 * `commit-message:`: Dependabot's schema allows those keys nowhere else, so an entry that
 * places them elsewhere is one Dependabot itself rejects. Also reports whether `include: scope`
 * (quoted, unquoted, or followed by a trailing comment) is present anywhere in the block.
 * Returns `null` when either key's line is entirely absent (`main()`'s fail-closed signal); an
 * empty string is a valid, present return for a key with an empty quoted value (`prefix: ''`),
 * which is NOT the same as absent and must not be reported as one. `includeScope` is a plain
 * boolean since its absence is not itself a failure to report specially.
 */
export function extractCommitMessageConfig(ecosystemBlock) {
  const prefix = extractYamlScalar(ecosystemBlock, 'prefix')
  const prefixDevelopment = extractYamlScalar(ecosystemBlock, 'prefix-development')

  if (prefix === null || prefixDevelopment === null) return null

  const includeScope = /^\s*include:\s*['"]?scope['"]?\s*(?:#.*)?$/m.test(ecosystemBlock)

  return { prefix, prefixDevelopment, includeScope }
}

/**
 * Reads the first `key: value` line's scalar value out of `text`, tolerating a trailing YAML
 * comment. Handles a single-quoted, double-quoted, or bare scalar. Returns `null` when no such
 * line exists at all; returns `''` when the line is present with an empty quoted value.
 *
 * Each alternative uses a single, non-overlapping greedy quantifier (no alternative can start
 * where another left off ambiguously), so a pathological line — many quote characters, or many
 * spaces before the value — cannot make the match backtrack super-linearly: measured against
 * adversarial 10k/50k/200k-character single lines, this stays linear (see the checker's test
 * timings, run and reported alongside its change).
 */
function extractYamlScalar(text, key) {
  const pattern = new RegExp(
    String.raw`^\s*${key}:\s*(?:'([^'\n]*)'|"([^"\n]*)"|([^'"#\n]*))\s*(?:#.*)?$`,
    'm',
  )
  const match = pattern.exec(text)
  if (match === null) return null

  const [, single, double, bare] = match
  return single ?? double ?? bare.trimEnd()
}

/**
 * Verifies `config` (from `extractCommitMessageConfig`) against `commitlintRules`
 * (`commitlint.config.js`'s live `type-enum`/`scope-enum` arrays). Returns an array of
 * violation strings; empty means the config is sound. `include: scope` is flagged unconditionally
 * because it defeats the whole point of an identical literal prefix — Dependabot would append
 * its own `deps`/`deps-dev` scope after it regardless of what `prefix`/`prefix-development` say.
 */
export function findCommitScopeViolations(config, commitlintRules) {
  const violations = []

  if (config.includeScope) {
    violations.push(
      "commit-message.include is 'scope', which appends dependabot's own deps/deps-dev " +
        'scope after prefix/prefix-development regardless of their literal value — remove it.',
    )
  }

  if (config.prefix !== config.prefixDevelopment) {
    violations.push(
      `commit-message.prefix ('${config.prefix}') and prefix-development ` +
        `('${config.prefixDevelopment}') differ, so a development-dependency update would get a ` +
        'different scope than a production one instead of the identical treatment this repo wants.',
    )
  }

  for (const [field, value] of [
    ['prefix', config.prefix],
    ['prefix-development', config.prefixDevelopment],
  ]) {
    const parsed = /^([\w-]+)\(([\w-]+)\)$/.exec(value)
    if (parsed === null) {
      violations.push(
        `commit-message.${field} ('${value}') does not parse as '<type>(<scope>)', the shape ` +
          "commitlint.config.js's scope-enum requires a Dependabot-authored subject to carry.",
      )
      continue
    }

    const [, type, scope] = parsed
    if (!commitlintRules.typeEnum.includes(type)) {
      violations.push(
        `commit-message.${field} ('${value}') uses type '${type}', not in commitlint.config.js's ` +
          `type-enum (${commitlintRules.typeEnum.join(', ')}).`,
      )
    }
    if (!commitlintRules.scopeEnum.includes(scope)) {
      violations.push(
        `commit-message.${field} ('${value}') uses scope '${scope}', not in commitlint.config.js's ` +
          `scope-enum (${commitlintRules.scopeEnum.join(', ')}).`,
      )
    }
  }

  return violations
}

/**
 * Human-locatable label for one npm entry in a violation message: its `directory:` value when
 * the entry sets a non-empty one, else its 1-based position among the npm entries this check
 * found (`ordinal`) — either way, enough for a reader to find the entry `main()` is complaining
 * about among several.
 */
function labelNpmEntry(block, ordinal) {
  const directory = extractYamlScalar(block, 'directory')
  return directory ? `npm entry (directory: '${directory}')` : `npm entry #${ordinal}`
}

/**
 * Runs the gate against `rootDir` (defaults to this repository's own root; a parameter so a
 * test can drive it over a scratch tree). Reads `.github/dependabot.yml` and
 * `commitlint.config.js`, verifies EVERY npm ecosystem entry's `commit-message` block per
 * `findCommitScopeViolations`, and sets `process.exitCode` non-zero on any refusal or on any
 * violation in ANY entry — a defect in a second or later npm entry fails the run exactly as one
 * in the first would, since Dependabot writes a separate commit per entry it manages.
 */
export async function main(rootDir = ROOT) {
  const dependabotPath = path.join(rootDir, '.github', 'dependabot.yml')
  const commitlintPath = path.join(rootDir, 'commitlint.config.js')

  let dependabotText
  try {
    dependabotText = readFileSync(dependabotPath, 'utf8')
  } catch (error) {
    console.error(
      `Dependabot commit-scope gate: refusing to run. Could not read ${dependabotPath} ` +
        `(${error.message}).`,
    )
    process.exitCode = 1
    return
  }

  const npmBlocks = extractNpmEcosystemBlocks(dependabotText)
  if (npmBlocks.length === 0) {
    console.error(
      'Dependabot commit-scope gate: refusing to run. Could not find a package-ecosystem: ' +
        `npm entry in ${dependabotPath}. If that entry moved or was renamed, update this gate ` +
        'to match; do not delete the check to get a green run.',
    )
    process.exitCode = 1
    return
  }

  let commitlintModule
  try {
    commitlintModule = await import(pathToFileURL(commitlintPath).href)
  } catch (error) {
    console.error(
      `Dependabot commit-scope gate: refusing to run. Could not import ${commitlintPath} ` +
        `(${error.message}).`,
    )
    process.exitCode = 1
    return
  }

  const commitlintRules = {
    typeEnum: commitlintModule.default?.rules?.['type-enum']?.[2] ?? [],
    scopeEnum: commitlintModule.default?.rules?.['scope-enum']?.[2] ?? [],
  }
  if (commitlintRules.typeEnum.length === 0 || commitlintRules.scopeEnum.length === 0) {
    console.error(
      `Dependabot commit-scope gate: refusing to run. ${commitlintPath} does not export the ` +
        "expected rules['type-enum'][2] / rules['scope-enum'][2] arrays.",
    )
    process.exitCode = 1
    return
  }

  const taggedViolations = []
  npmBlocks.forEach((block, index) => {
    const entryLabel = labelNpmEntry(block, index + 1)
    const config = extractCommitMessageConfig(block)
    if (config === null) {
      taggedViolations.push(
        `${entryLabel}: carries no commit-message.prefix / prefix-development pair. Without ` +
          "one, Dependabot infers a prefix and a development-dependency bump gets 'deps-dev', " +
          "a scope commitlint.config.js's scope-enum rejects.",
      )
      return
    }
    for (const violation of findCommitScopeViolations(config, commitlintRules)) {
      taggedViolations.push(`${entryLabel}: ${violation}`)
    }
  })

  if (taggedViolations.length > 0) {
    const violationLines = taggedViolations.map((v) => `  - ${v}`).join('\n')
    console.error(
      `Dependabot commit-scope gate: ${taggedViolations.length} violation(s) in ` +
        `${dependabotPath}:\n${violationLines}`,
    )
    process.exitCode = 1
    return
  }

  const entryWord = npmBlocks.length === 1 ? 'entry' : 'entries'
  console.log(
    `Dependabot commit-scope gate: ${npmBlocks.length} npm ecosystem ${entryWord} checked, ` +
      'every commit-message.prefix / prefix-development pair valid, no include: scope present.',
  )
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  await main()
}
