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
 * Slices `dependabotText` into one block per top-level list item under `updates:` (any
 * ecosystem), keeping only the ones that are `npm`. An entry starts at every `- ` list-item
 * line whose indentation matches the FIRST such list item under `updates:` EXACTLY
 * (`findEntryIndent`): a deeper list nested inside an entry — an `ignore:` item, a `groups:`
 * pattern — is indented further and so is never mistaken for a new entry boundary, and this is
 * true regardless of which key (if any) sits on the dash line itself, since a boundary is a
 * property of indentation, not of naming an ecosystem. Whether an entry IS `npm` is then read
 * from ANY line inside its block (`isNpmBlock`), because YAML key order inside a mapping is not
 * part of its schema and Dependabot accepts `package-ecosystem` in any position within an
 * entry, not only as the first key on the dash line. Returns an empty array when there is no
 * `updates:` key, no list item follows it, or no entry in the list is `npm` — the fail-closed
 * signal `main()` checks for.
 */
export function extractNpmEcosystemBlocks(dependabotText) {
  const lines = dependabotText.split('\n')
  const entryIndent = findEntryIndent(lines)
  if (entryIndent === null) return []

  const entryStartPattern = new RegExp(String.raw`^${entryIndent}-[ \t]`)
  const entryStartIndexes = []
  for (const [index, line] of lines.entries()) {
    if (entryStartPattern.test(line)) entryStartIndexes.push(index)
  }

  const npmBlocks = []
  for (const [position, startIndex] of entryStartIndexes.entries()) {
    const nextStartIndex = entryStartIndexes[position + 1] ?? lines.length
    const block = lines.slice(startIndex, nextStartIndex).join('\n')
    if (isNpmBlock(block)) npmBlocks.push(block)
  }

  return npmBlocks
}

/**
 * The exact leading-whitespace string of the FIRST `- ` list item found after the `updates:`
 * line — the indentation every top-level entry boundary must match EXACTLY, so that a deeper
 * nested list is never mistaken for one. Returns `null` when there is no `updates:` key, or no
 * list item follows it.
 */
function findEntryIndent(lines) {
  const updatesIndex = lines.findIndex((line) => /^[ \t]*updates:[ \t]*$/.test(line))
  if (updatesIndex === -1) return null

  for (const line of lines.slice(updatesIndex + 1)) {
    const match = /^([ \t]*)-[ \t]/.exec(line)
    if (match !== null) return match[1]
  }
  return null
}

/**
 * Whether any line in `block` — the dash line itself, or a sibling key line at any deeper
 * indentation — sets `package-ecosystem` to `npm`, in any of the three scalar styles YAML
 * allows (single-quoted, double-quoted, bare), tolerating a trailing comment. The lookahead
 * after the bare form stops it matching a longer word that merely starts with `npm`.
 */
function isNpmBlock(block) {
  const npmEcosystemLine =
    /^[ \t]*(?:-[ \t]*)?package-ecosystem:[ \t]*(?:'npm'|"npm"|npm(?=[ \t#]|$))/
  return block.split('\n').some((line) => npmEcosystemLine.test(line))
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

  const includeScope = extractYamlScalar(ecosystemBlock, 'include') === 'scope'

  return { prefix, prefixDevelopment, includeScope }
}

/**
 * Reads the first `key: <value>` line's scalar value out of `text`, tolerating a trailing YAML
 * comment, by scanning ONE line at a time and matching each against a single anchored,
 * non-multiline pattern, rather than searching the whole (possibly multi-line) text with one
 * pattern. The key may sit on a list item's dash line or a sibling line at any indentation
 * (the optional leading `-`), since which is which is not this function's concern. Returns
 * `null` when no line sets `key` at all — the caller's fail-closed signal; otherwise the parsed
 * value (`parseYamlScalarRemainder`), which is `''` for a key present with an empty quoted
 * value, and — deliberately — the raw, unparsed remainder for a line whose value cannot be made
 * sense of, so the caller's own `<type>(<scope>)` check reports "does not parse" rather than
 * this function guessing at a value.
 *
 * Parsed one line at a time with a single anchored match per line and a hand-written scan of
 * the value, rather than one multi-line pattern: a pattern whose leading blanks, bare value and
 * trailing blanks can all match the same run of spaces backtracks polynomially on a line that
 * fails to match, so a malformed line could stall this check instead of failing it.
 */
function extractYamlScalar(text, key) {
  const lineMatcher = new RegExp(String.raw`^[ \t]*(?:-[ \t]*)?${key}:(.*)$`)
  for (const line of text.split('\n')) {
    const match = lineMatcher.exec(line)
    if (match !== null) return parseYamlScalarRemainder(match[1])
  }
  return null
}

/**
 * Parses the remainder of a `key:<remainder>` line into its scalar value: leading blanks are
 * trimmed, then a leading `'` or `"` scans character by character for its closing quote (a
 * doubled `''` inside a single-quoted value is an escaped literal `'`; a double-quoted value
 * carries no such escape here), or, with no leading quote, the bare value runs up to the first
 * unquoted ` #` (a comment) or end of line, trimmed at the end. Text after a closing quote must
 * itself be blanks and optionally a `#` comment; anything else, or a quote that never closes,
 * means this line does not parse as a scalar this reader understands, and the leading-blank-
 * trimmed remainder is returned AS IS instead, so the caller's own parse check reports the
 * failure rather than this reader silently guessing at a value.
 */
function parseYamlScalarRemainder(remainder) {
  const value = remainder.replace(/^[ \t]+/, '')
  const quote = value[0]

  if (quote === "'" || quote === '"') {
    let scanned = ''
    let index = 1
    while (index < value.length) {
      const char = value[index]
      if (char === quote) {
        if (quote === "'" && value[index + 1] === "'") {
          scanned += "'"
          index += 2
          continue
        }
        const trailing = value.slice(index + 1).replace(/^[ \t]+/, '')
        return trailing === '' || trailing[0] === '#' ? scanned : value
      }
      scanned += char
      index += 1
    }
    return value // unclosed quote: unparseable, return the raw remainder
  }

  const commentIndex = value.indexOf(' #')
  const bare = commentIndex === -1 ? value : value.slice(0, commentIndex)
  return bare.trimEnd()
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
