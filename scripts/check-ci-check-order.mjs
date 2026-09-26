#!/usr/bin/env node
/**
 * Tripwire for keeping CONTRIBUTING.md's documented CI chain in sync with package.json.
 *
 * `.github/CONTRIBUTING.md`'s "`ci:check` runs, in order:" section is a hand transcription of
 * `package.json`'s own `ci:check` script chain: one numbered item per step, each opening with a
 * bold code span naming one `pnpm run <script>` step. It has decayed twice already, on two
 * different axes, both caught only by a person reading it against the manifest during a
 * review that happened to run a merged-with-`main` certification (commit
 * `a6555fd`): once on MEMBERSHIP (the `scripts:check` item's own inner enumeration missed
 * a ninth gate for one pull request) and once on ORDER (items 5 and 6 transposed against the
 * chain, false for days). Nothing re-checked either until a person happened to look.
 *
 * This gate is possible for the OUTER items and was correctly declined for the `scripts:check`
 * item's own inner enumeration: the outer labels ARE the
 * script names, verbatim and in order (`typecheck`, `lint`, `test`, ...), so comparing them to
 * `package.json`'s chain needs no mapping table. The `scripts:check` item's inner members are
 * prose names for scripts ("the licence allow-list gate") that are NOT their filenames
 * (`check-license-allowlist.mjs`), so a gate for that would need a mapping that is itself a
 * hand transcription and the same defect class one level down — declined for exactly that
 * reason and not reached here.
 *
 * PROPERTY ASSERTED: the ordered sequence of bold code-span labels under the "`ci:check` runs,
 * in order:" heading in `.github/CONTRIBUTING.md`, read as an ordered list, equals the ordered
 * sequence of `pnpm run <script>` invocations chained by `package.json`'s own `ci:check`
 * script, by POSITION as well as by membership — a transposition fails this check exactly as
 * a dropped or added member does, because both defect classes have already occurred.
 *
 * FAILS CLOSED on the unparseable case: if the heading cannot be
 * found, the numbered list under it cannot be parsed, or `package.json`'s `ci:check` script
 * cannot be parsed into a `pnpm run` chain, this gate exits 1 rather than reporting nothing to
 * compare — a gate that silently finds nothing to compare is worse than no gate, because it
 * reports green about a list it never read.
 *
 * NO MAPPING TABLE, EVER. The moment this needs one it has become the thing correctly declined
 * for the `scripts:check` item's inner list, and the fix is to leave the outer items alone, not
 * to grow a table here.
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const HEADING = '`ci:check` runs, in order:'

/**
 * Extracts the ordered bold code-span labels (`` **`label`** ``) from the numbered list under
 * `HEADING` in `contributingText`. Returns `null` if the heading is absent or no numbered item
 * with a bold code-span label follows it — the fail-closed signal `main()` checks for.
 *
 * BOUNDED TO THE HEADING'S OWN SECTION, which is the property the module docblock asserts. The
 * heading is matched against a line whose TRIMMED TEXT EQUALS it,
 * not by `indexOf` over the whole document, so a prose mention of the same string cannot hijack
 * the scan; and the scan ends at the first line after it that is neither a matching item, nor
 * blank, nor an indented continuation of one, nor a MALFORMED numbered item (the paragraph
 * below, which is a refusal rather than an end). The previous shape guarded its blank-line
 * `break` on having already seen a matching item, so if the intended list ever stopped matching
 * the regex (a restyle that drops the bold) the scan ran to END OF FILE and adopted the first
 * later numbered bold list in the document: measured, a de-bolded intended list carrying the
 * `a6555fd` transposition plus an unrelated later list printed "matches ... in order" and
 * exited 0. A blank line inside the list is now skipped rather than ending it, so a CommonMark
 * LOOSE list reads correctly instead of reporting three of eleven labels against the chain (a
 * lesson worth restating: a text-extraction boundary anchors on the structure's marker grammar,
 * never on whitespace).
 *
 * ENDING the section and REFUSING are deliberately different outcomes, and the malformed item
 * gets the second. A numbered item whose bold code span is not first on the line
 * (`4. The **\`x\`** step`) makes the whole extraction return null, so the gate refuses to run.
 * Ending the section there instead would make every documented step AFTER the stop invisible,
 * leaving the gate comparing a PREFIX of the documented list against the chain, and a chain that
 * happens to BE that surviving prefix then AGREES with it: measured at exit 0 printing
 * "3-step list matches ... in order" over an eleven-step documented list.
 * A silent truncation is the earlier silent SKIP one step further
 * along rather than an improvement on it, which is why this direction is not left to the
 * repository's current proportions to make safe.
 */
export function extractContributingChain(contributingText) {
  const allLines = contributingText.split('\n')
  const headingIndex = allLines.findIndex((line) => line.trim() === HEADING)
  if (headingIndex === -1) return null

  const lines = allLines.slice(headingIndex + 1)

  const labels = []
  for (const line of lines) {
    const match = /^\d+\.\s+\*\*`([^`]+)`\*\*/.exec(line)
    if (match) {
      labels.push(match[1])
      continue
    }
    if (line.trim() === '') continue
    if (/^\s/.test(line)) continue
    if (/^\d+\./.test(line)) return null
    break
  }

  return labels.length > 0 ? labels : null
}

/**
 * Extracts the ordered `pnpm run <script>` sequence from `packageJson`'s own `ci:check`
 * script string. Returns `null` if the field is missing, not a string, or contains no `pnpm
 * run` invocation — the fail-closed signal `main()` checks for.
 */
export function extractCiCheckChain(packageJson) {
  const script = packageJson?.scripts?.['ci:check']
  if (typeof script !== 'string' || script.length === 0) return null

  const matches = [...script.matchAll(/pnpm run ([\w:-]+)/g)].map((m) => m[1])
  return matches.length > 0 ? matches : null
}

/**
The ordered-sequence comparison itself: membership AND position both matter.
 */
export function chainsAgree(contributingChain, ciCheckChain) {
  if (contributingChain.length !== ciCheckChain.length) return false
  return contributingChain.every((label, index) => label === ciCheckChain[index])
}

/**
 * Runs the property asserted in the header comment above and exits non-zero on any mismatch,
 * or if either source cannot be read or parsed. `rootDir` defaults to this repository's own
 * root but is a parameter so a test can drive it over a scratch tree.
 */
export function main(rootDir = ROOT) {
  const contributingPath = path.join(rootDir, '.github', 'CONTRIBUTING.md')
  const packageJsonPath = path.join(rootDir, 'package.json')

  let contributingText
  try {
    contributingText = readFileSync(contributingPath, 'utf8')
  } catch (error) {
    console.error(
      `ci:check order gate: refusing to run. Could not read ${contributingPath} (${error.message}).`,
    )
    process.exitCode = 1
    return
  }

  const contributingChain = extractContributingChain(contributingText)
  if (contributingChain === null) {
    console.error(
      `ci:check order gate: refusing to run. Could not find a numbered list of bold ` +
        `code-span labels under "${HEADING}" in ${contributingPath}. If that section's shape ` +
        'moved, update this gate to match; do not delete the check to get a green run.',
    )
    process.exitCode = 1
    return
  }

  let packageJson
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  } catch (error) {
    console.error(
      `ci:check order gate: refusing to run. ${packageJsonPath} is not valid JSON (${error.message}).`,
    )
    process.exitCode = 1
    return
  }

  const ciCheckChain = extractCiCheckChain(packageJson)
  if (ciCheckChain === null) {
    console.error(
      `ci:check order gate: refusing to run. Could not parse a \`pnpm run\` chain out of ` +
        `${packageJsonPath}'s "ci:check" script.`,
    )
    process.exitCode = 1
    return
  }

  if (!chainsAgree(contributingChain, ciCheckChain)) {
    console.error(
      '.github/CONTRIBUTING.md\'s "ci:check runs, in order:" list does not match ' +
        "package.json's own ci:check chain:\n",
    )
    console.error(`  CONTRIBUTING.md: ${contributingChain.join(', ')}`)
    console.error(`  package.json:    ${ciCheckChain.join(', ')}`)
    console.error(
      '\nEither the list was hand-edited out of step with the chain, or a step was added, ' +
        'removed or reordered in package.json without updating the list to match. Fix the ' +
        'list to match the chain.',
    )
    process.exitCode = 1
    return
  }

  console.log(
    `ci:check order gate: CONTRIBUTING.md's ${contributingChain.length}-step list matches ` +
      "package.json's ci:check chain, in order.",
  )
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href` —
// `import.meta.url` is percent-encoded and symlink-resolved by Node, `process.argv[1]` is
// neither, so an invocation through a symlinked absolute path makes the two sides disagree
// and `main()` silently never fires.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
