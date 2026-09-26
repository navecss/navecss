#!/usr/bin/env node
/**
 * Tripwire for `.github/workflows/pr-title.yml`'s `types:`/`scopes:` inputs drifting from
 * `commitlint.config.js`'s own `type-enum`/`scope-enum`.
 *
 * This repository squash-merges, so a pull request's title becomes the commit subject on `main`.
 * GitHub creates that commit itself, so the local `commit-msg` hook (`commitlint.config.js`)
 * never runs against it — the workflow's `amannn/action-semantic-pull-request` step is the only
 * thing that ever checks that subject at all. Passing it no `types:`/`scopes:` inputs made it
 * fall back to the action's own defaults, which accept any scope whatsoever; the workflow now
 * passes both lists explicitly, and this script is what keeps them from drifting away from
 * commitlint's again unnoticed — `readCommitlintEnums` (imported from
 * `./check-dependabot-commit-scope.mjs`, the canonical live read of those arrays) is compared
 * against what the workflow actually declares.
 *
 * `amannn/action-semantic-pull-request`'s own `action.yml` documents `types` and `scopes` as
 * newline-delimited lists where EACH ENTRY IS COMPILED AS A REGULAR EXPRESSION (auto-wrapped in
 * `^ $`) rather than compared as a literal string. A list that is otherwise identical to
 * commitlint's but carries an entry that is not a plain word — `.*`, `deps.*`, `co(re|ff)` — would
 * still "contain" every name it is meant to and pass a naive set comparison, while at the same
 * time matching titles no scope on the list was ever meant to allow. So this check refuses any
 * entry that is not a literal matching `^[a-z][a-z0-9-]*$`, in addition to comparing both lists
 * to commitlint's as sets.
 *
 * Parsed as plain text, not a YAML parser, following every sibling `scripts/check-*.mjs`
 * (`check-actions-pinned-shas.mjs`'s docblock states the reason once): the shape this reads is a
 * single step's `uses:` line, a `with:` mapping, and two `key: |` block scalars under it, and a
 * full parse buys nothing over anchoring on that shape directly. Every regex here is anchored,
 * uses `[ \t]` rather than `\s` (so a literal newline inside a captured remainder can never widen
 * what a quantifier consumes), and never places two quantifiers adjacent to each other that could
 * both match the same run of characters — a line that fails to match is rejected in one pass
 * rather than explored across every possible split between two overlapping quantifiers.
 *
 * Fails closed (exit 1, "refusing to run") when `.github/workflows/pr-title.yml` is missing, no
 * step in it uses `amannn/action-semantic-pull-request`, or `commitlint.config.js` cannot be read
 * — each of those means there is nothing sound to compare, and a script that printed "0 checked"
 * in any of those cases would read as a clean run indistinguishable from a genuinely empty one.
 * A missing `with:` block, or a missing `types:`/`scopes:` input under it, is not one of those
 * three: it is a real, nameable violation (an input is entirely absent) and is reported as one,
 * exiting 1 without the "refusing to run" wording those three reserve.
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readCommitlintEnums } from './check-dependabot-commit-scope.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ACTION_SPECIFIER = 'amannn/action-semantic-pull-request'

/**
A plain, lower-case word: what `action.yml` documents as safe to compile as a regular
expression without matching more than its own literal text.
 */
const LITERAL_WORD = /^[a-z][a-z0-9-]*$/

/**
 * Slices `workflowText` down to the single step whose `uses:` line names
 * `amannn/action-semantic-pull-request` — from that step's own `- uses:` line up to (but not
 * including) the next line at the SAME leading-whitespace length that itself starts a new step
 * (`-` followed by `[ \t]`), or to the end of the file when this is the last step. Returns `null`
 * when no `uses:` line anywhere in the file names that action.
 */
export function findActionStepBlock(workflowText) {
  const lines = workflowText.split('\n')
  const usesLine = /^([ \t]*)-[ \t]+uses:(.*)$/

  let dashIndent = null
  let startIndex = null
  for (const [index, line] of lines.entries()) {
    const match = usesLine.exec(line)
    if (match === null) continue
    if (!match[2].includes(ACTION_SPECIFIER)) continue
    dashIndent = match[1]
    startIndex = index
    break
  }
  if (startIndex === null) return null

  const siblingStepLine = new RegExp(String.raw`^${dashIndent}-[ \t]`)
  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (siblingStepLine.test(lines[index])) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex, endIndex).join('\n')
}

/**
 * The text of the `with:` mapping inside `stepBlock` (everything strictly deeper than the
 * `with:` line itself, up to the first line at or above its own indentation), or `null` when
 * `stepBlock` carries no `with:` key at all.
 */
export function findWithBlockText(stepBlock) {
  const lines = stepBlock.split('\n')
  const withLine = /^([ \t]*)with:[ \t]*$/

  let withIndent = null
  let startIndex = null
  for (const [index, line] of lines.entries()) {
    const match = withLine.exec(line)
    if (match === null) continue
    withIndent = match[1]
    startIndex = index
    break
  }
  if (startIndex === null) return null

  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = /^([ \t]*)/.exec(line)[1]
    if (indent.length <= withIndent.length) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex + 1, endIndex).join('\n')
}

/**
 * Every entry of the `${key}: |` block scalar in `withBlockText`: the non-blank lines that
 * follow the `${key}: |` line and are indented DEEPER than it, each trimmed. Returns `null` when
 * `withBlockText` carries no `${key}: |` line — the caller's "input missing" signal.
 */
export function extractBlockScalarEntries(withBlockText, key) {
  const lines = withBlockText.split('\n')
  const keyLine = new RegExp(String.raw`^([ \t]*)${key}:[ \t]*\|[ \t]*$`)

  let keyIndent = null
  let startIndex = null
  for (const [index, line] of lines.entries()) {
    const match = keyLine.exec(line)
    if (match === null) continue
    keyIndent = match[1]
    startIndex = index
    break
  }
  if (startIndex === null) return null

  const entries = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = /^([ \t]*)/.exec(line)[1]
    if (indent.length <= keyIndent.length) break
    entries.push(line.trim())
  }

  return entries
}

/**
 * Violations for one input (`label` is the workflow key, e.g. `types`; `enumName` is commitlint's
 * name for the same list, e.g. `type-enum`), comparing `workflowEntries` (from
 * `extractBlockScalarEntries`, or `null` when the input is entirely absent) against
 * `commitlintEntries` (from `readCommitlintEnums`). Empty means this input is sound.
 */
export function findScopeViolations(workflowEntries, commitlintEntries, label, enumName) {
  if (workflowEntries === null) {
    return [`the action step carries no \`${label}: |\` input at all.`]
  }

  const violations = []
  const seen = new Set()
  for (const entry of workflowEntries) {
    if (!LITERAL_WORD.test(entry)) {
      violations.push(
        `${label}: entry '${entry}' is not a plain word matching ^[a-z][a-z0-9-]*$ -- ` +
          'amannn/action-semantic-pull-request reads every entry as a regular expression, so ' +
          'anything else could match titles this list was never meant to allow.',
      )
    }
    if (seen.has(entry)) {
      violations.push(`${label}: entry '${entry}' is duplicated.`)
    }
    seen.add(entry)
  }

  const workflowSet = new Set(workflowEntries)
  const commitlintSet = new Set(commitlintEntries)

  for (const entry of workflowEntries) {
    if (!commitlintSet.has(entry)) {
      violations.push(
        `${label}: '${entry}' is in the workflow but not in commitlint.config.js's ${enumName}.`,
      )
    }
  }
  for (const entry of commitlintEntries) {
    if (!workflowSet.has(entry)) {
      violations.push(
        `${label}: '${entry}' is in commitlint.config.js's ${enumName} but not in the workflow.`,
      )
    }
  }

  return violations
}

/**
 * Runs the gate against `rootDir` (defaults to this repository's own root; a parameter so a test
 * can drive it over a scratch tree). Reads `.github/workflows/pr-title.yml` and
 * `commitlint.config.js`, compares the workflow's `types:`/`scopes:` inputs against commitlint's
 * `type-enum`/`scope-enum`, and sets `process.exitCode` non-zero on any refusal or violation.
 */
export async function main(rootDir = ROOT) {
  const workflowPath = path.join(rootDir, '.github', 'workflows', 'pr-title.yml')

  let workflowText
  try {
    workflowText = readFileSync(workflowPath, 'utf8')
  } catch (error) {
    console.error(
      `PR-title scopes gate: refusing to run. Could not read ${workflowPath} (${error.message}).`,
    )
    process.exitCode = 1
    return
  }

  const stepBlock = findActionStepBlock(workflowText)
  if (stepBlock === null) {
    console.error(
      'PR-title scopes gate: refusing to run. Could not find a step using ' +
        `${ACTION_SPECIFIER} in ${workflowPath}. If that action moved or was renamed, update ` +
        'this gate to match; do not delete the check to get a green run.',
    )
    process.exitCode = 1
    return
  }

  let commitlintEnums
  try {
    commitlintEnums = await readCommitlintEnums(rootDir)
  } catch (error) {
    console.error(`PR-title scopes gate: refusing to run. ${error.message}`)
    process.exitCode = 1
    return
  }

  const withBlockText = findWithBlockText(stepBlock)
  const workflowTypes =
    withBlockText === null ? null : extractBlockScalarEntries(withBlockText, 'types')
  const workflowScopes =
    withBlockText === null ? null : extractBlockScalarEntries(withBlockText, 'scopes')

  const violations = [
    ...findScopeViolations(workflowTypes, commitlintEnums.typeEnum, 'types', 'type-enum'),
    ...findScopeViolations(workflowScopes, commitlintEnums.scopeEnum, 'scopes', 'scope-enum'),
  ]

  if (violations.length > 0) {
    const violationLines = violations.map((v) => `  - ${v}`).join('\n')
    console.error(
      `PR-title scopes gate: ${violations.length} violation(s) in ${workflowPath}:\n${violationLines}`,
    )
    process.exitCode = 1
    return
  }

  console.log(
    `PR-title scopes gate: ${workflowTypes.length} type(s) and ${workflowScopes.length} ` +
      "scope(s) in pr-title.yml match commitlint.config.js's type-enum and scope-enum exactly.",
  )
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  await main()
}
