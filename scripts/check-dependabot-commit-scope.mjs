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
 * subject from a human author never runs against it, and `pr-title.yml` checks the PR TITLE,
 * not the commits inside it.
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
 * Slices `dependabotText` down to the `package-ecosystem: 'npm'` block: from that line up to
 * (not including) the next top-level `- package-ecosystem:` entry, or end of file. Returns
 * `null` if no npm block is found — the fail-closed signal `main()` checks for.
 */
export function extractNpmEcosystemBlock(dependabotText) {
  const lines = dependabotText.split('\n')
  const startIndex = lines.findIndex((line) => /^\s*-\s*package-ecosystem:\s*'npm'/.test(line))
  if (startIndex === -1) return null

  const rest = lines.slice(startIndex + 1)
  const endOffset = rest.findIndex((line) => /^\s*-\s*package-ecosystem:/.test(line))
  const block = endOffset === -1 ? rest : rest.slice(0, endOffset)

  return [lines[startIndex], ...block].join('\n')
}

/**
 * Reads `prefix:` and `prefix-development:` out of a `commit-message:` block within
 * `ecosystemBlock`, plus whether `include: scope` (or `include: 'scope'`) is present anywhere
 * in it. Returns `null` for a missing prefix (`main()`'s fail-closed signal); `includeScope` is
 * a plain boolean since its absence is not itself a failure to report specially.
 */
export function extractCommitMessageConfig(ecosystemBlock) {
  const prefixMatch = /^\s*prefix:\s*['"]?([^'"\n]+?)['"]?\s*$/m.exec(ecosystemBlock)
  const prefixDevMatch = /^\s*prefix-development:\s*['"]?([^'"\n]+?)['"]?\s*$/m.exec(ecosystemBlock)

  if (prefixMatch === null || prefixDevMatch === null) return null

  const includeScope = /^\s*include:\s*['"]?scope['"]?\s*$/m.test(ecosystemBlock)

  return { prefix: prefixMatch[1], prefixDevelopment: prefixDevMatch[1], includeScope }
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
 * Runs the gate against `rootDir` (defaults to this repository's own root; a parameter so a
 * test can drive it over a scratch tree). Reads `.github/dependabot.yml` and
 * `commitlint.config.js`, verifies the npm ecosystem's `commit-message` block per
 * `findCommitScopeViolations`, and sets `process.exitCode` non-zero on any refusal or violation.
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

  const npmBlock = extractNpmEcosystemBlock(dependabotText)
  if (npmBlock === null) {
    console.error(
      'Dependabot commit-scope gate: refusing to run. Could not find a package-ecosystem: ' +
        `'npm' entry in ${dependabotPath}. If that entry moved or was renamed, update this ` +
        'gate to match; do not delete the check to get a green run.',
    )
    process.exitCode = 1
    return
  }

  const config = extractCommitMessageConfig(npmBlock)
  if (config === null) {
    console.error(
      'Dependabot commit-scope gate: the npm package-ecosystem entry in ' +
        `${dependabotPath} carries no commit-message.prefix / prefix-development pair. Without ` +
        "one, Dependabot infers a prefix and a development-dependency bump gets 'deps-dev', a " +
        "scope commitlint.config.js's scope-enum rejects.",
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

  const violations = findCommitScopeViolations(config, commitlintRules)
  if (violations.length > 0) {
    const violationLines = violations.map((v) => `  - ${v}`).join('\n')
    console.error(
      `Dependabot commit-scope gate: ${violations.length} violation(s) in ${dependabotPath}:\n${violationLines}`,
    )
    process.exitCode = 1
    return
  }

  console.log(
    `Dependabot commit-scope gate: npm ecosystem commit-message.prefix and prefix-development ` +
      `both '${config.prefix}', a valid (type in type-enum)(scope in scope-enum) pair, no ` +
      'include: scope present.',
  )
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  await main()
}
