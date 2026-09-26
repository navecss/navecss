#!/usr/bin/env node
/**
 * Structural checks over every numbered ADR under `docs/04-adr/`, so an ADR that claims to
 * replace or retire another one is checkable by a script rather than by trusting the prose.
 *
 * Three rules:
 *   1. ADR ids (the `NNNN` filename prefix) are unique.
 *   2. `status: superseded` requires a `superseded-by` that resolves to a real ADR AND that
 *      ADR's own `supersedes:` names this one back. A one-way link here is invisible to
 *      anyone who opens only the superseded ADR and never thinks to grep for what replaced
 *      it, so both ends must name each other or a reader is left holding stale guidance
 *      with no forwarding address.
 *   3. `status: deprecated` requires a `## Deprecation` section (`deprecated` and
 *      `superseded` are not interchangeable: the former says nothing replaces it and must
 *      say why and what to do instead).
 *
 * A fourth rule from an earlier design, "no ADR is ever deleted or rewritten in place," is
 * deliberately NOT here: it is a policy about the DIFF, not a tree-scan fact, and belongs in
 * CI against a diff if it is ever enforced. Listing it among tree-scan rules would make it
 * read as checked when it is not.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ADR_DIR = path.join(ROOT, 'docs', '04-adr')

/**
 * Splits a leading `---\n...\n---` YAML-ish frontmatter block off `text`.
 * Returns `{ fields, body }`; `fields` is `{}` when there is no block. Only
 * simple `key: value` lines are read (no multi-line values), a deliberately
 * regex-based parse rather than a full YAML parser (no new dependency).
 */
export function parseFrontmatter(text) {
  // Anchored, lazy scan to a required literal closer: no nested or ambiguous quantifier to
  // backtrack on. Runs only over this repository's own tracked `docs/04-adr/` files as a
  // build-time guard, never over external input. Structurally safe and not consumer-reachable;
  // accepted.
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { fields: {}, body: text }
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z-]+):\s*(.*)$/)
    if (m) fields[m[1]] = m[2]
  }
  return { fields, body: text.slice(match[0].length) }
}

const unquote = (s) => s.trim().replace(/^["'](.*)["']$/, '$1')

/**
 * A frontmatter value, whatever its shape (`"-"`, `'-'`, a bare string, or a
 * `["a", "b"]` list), as an array of unquoted strings. `-`, quoted or bare,
 * is "nothing" - checked AFTER unquoting, not by string-matching every quote
 * style a formatter might choose (prettier rewrites `"-"` to `'-'` in this
 * repo's quote style, and a check that only matched the double-quoted form
 * silently stopped recognizing "nothing" the moment that ran - caught live
 * by this script's own red-then-green pass, not written in from the start).
 */
export function parseListValue(raw) {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '' || unquote(trimmed) === '-') return []
  if (trimmed.startsWith('[')) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf(']'))
    return inner
      .split(',')
      .map(unquote)
      .filter((s) => s.length > 0)
  }
  return [unquote(trimmed)]
}

/**
 * The `NNNN` id from an ADR filename (`0001-slug.md` -> `0001`), or `null`
 * for a file that does not follow the numbered convention (e.g. `index.md`,
 * skipped by the caller before this is reached in practice).
 */
export function adrId(filename) {
  const m = filename.match(/^(\d{4})-/)
  return m ? m[1] : null
}

/**
 * The `- **Status:** <value>` bullet's value, lowercased, or `null` if the
 * bullet is absent. Deliberately reads the ADR's EXISTING bullet rather than
 * a duplicate frontmatter field - one canonical home per fact.
 */
export function extractStatus(body) {
  const m = body.match(/^-\s+\*\*Status:\*\*\s*(\S+)/m)
  return m ? m[1].toLowerCase() : null
}

const ADR_STATUS = new Set(['accepted', 'superseded', 'deprecated'])

/**
 * Reads and parses every numbered ADR file in `dir` (skips `index.md` and
 * anything not matching `NNNN-slug.md`). Returns an array of
 * `{ filename, id, fields, body, status }`.
 */
export function loadAdrs(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && adrId(f) !== null)
    .sort()
    .map((filename) => {
      const text = readFileSync(path.join(dir, filename), 'utf8')
      const { fields, body } = parseFrontmatter(text)
      return {
        filename,
        id: adrId(filename),
        fields,
        body,
        status: extractStatus(body),
      }
    })
}

/**
Rule 1: every ADR id (the `NNNN` prefix) is unique across `adrs`.
 */
export function checkUniqueIds(adrs) {
  const problems = []
  const seen = new Map()
  for (const adr of adrs) {
    if (seen.has(adr.id)) {
      problems.push(`ADR id ${adr.id} is used by both ${seen.get(adr.id)} and ${adr.filename}`)
    } else {
      seen.set(adr.id, adr.filename)
    }
  }
  return problems
}

/**
 * Rules 2 and 3: status-driven checks, entirely self-contained within
 * `docs/04-adr/`. `byId` maps ADR id -> the loaded ADR record.
 */
export function checkStatusRules(adrs, byId) {
  const problems = []
  for (const adr of adrs) {
    if (adr.status === null) {
      problems.push(`${adr.filename}: no '- **Status:**' bullet found`)
      continue
    }
    if (!ADR_STATUS.has(adr.status)) {
      problems.push(
        `${adr.filename}: status '${adr.status}' not in the set ${[...ADR_STATUS].sort((a, b) => a.localeCompare(b)).join(', ')}`,
      )
    }

    const supersededBy = parseListValue(adr.fields['superseded-by'])
    if (adr.status === 'superseded') {
      if (supersededBy.length === 0) {
        problems.push(
          `${adr.filename}: status:superseded with an empty superseded-by - 'superseded' means ` +
            `replaced by a SPECIFIC later ADR; if nothing replaces it the status is 'deprecated'`,
        )
      }
      for (const ref of supersededBy) {
        const target = byId.get(adrId(ref) ?? ref)
        if (!target) {
          problems.push(
            `${adr.filename}: superseded-by names ${ref}, which resolves to no ADR file`,
          )
          continue
        }
        const targetSupersedes = parseListValue(target.fields['supersedes']).map(
          (r) => adrId(r) ?? r,
        )
        if (!targetSupersedes.includes(adr.id)) {
          problems.push(
            `${adr.filename}: superseded-by names ${target.filename}, but ${target.filename} does ` +
              `not name ${adr.filename} in its supersedes (one-way link)`,
          )
        }
      }
    }

    for (const ref of parseListValue(adr.fields['supersedes'])) {
      const target = byId.get(adrId(ref) ?? ref)
      if (!target) {
        problems.push(`${adr.filename}: supersedes names ${ref}, which resolves to no ADR file`)
        continue
      }
      if (target.status !== 'superseded') {
        problems.push(
          `${adr.filename}: supersedes ${target.filename}, but ${target.filename} reads ` +
            `status:${target.status ?? '-'} not 'superseded' - a reader who opens it is told it is live`,
        )
      }
      const targetSupersededBy = parseListValue(target.fields['superseded-by']).map(
        (r) => adrId(r) ?? r,
      )
      if (!targetSupersededBy.includes(adr.id)) {
        problems.push(
          `${adr.filename}: supersedes ${target.filename}, but ${target.filename} does not name ` +
            `${adr.filename} in its superseded-by (one-way link)`,
        )
      }
    }

    if (adr.status === 'deprecated' && !/^##\s+Deprecation\s*$/m.test(adr.body)) {
      problems.push(
        `${adr.filename}: status:deprecated with no '## Deprecation' section - 'no longer applies' ` +
          `has to say why and what to do instead, or it strands every reader who arrives from a citation`,
      )
    }
  }
  return problems
}

/**
 * The closing GREEN summary line, as its own pure function so it is
 * unit-testable without a real filesystem.
 */
export function formatSummary(adrCount) {
  return `ADR structural check: ${adrCount} ADR(s); ids unique, supersession links reciprocal, deprecations documented.`
}

/**
 * The whole check, as a pure function of an already-resolved `adrDir`, so a test can drive it
 * with no real filesystem resolution and no console/exitCode side effects. Returns the
 * composed `summary` string alongside `problems`, so a test can assert the exact printed
 * sentence rather than a boolean proxy for it.
 */
export function runCheck(adrDir = ADR_DIR) {
  const adrs = loadAdrs(adrDir)
  const byId = new Map(adrs.map((adr) => [adr.id, adr]))

  const problems = [...checkUniqueIds(adrs), ...checkStatusRules(adrs, byId)]

  return { problems, summary: formatSummary(adrs.length) }
}

/**
 * Runs the ADR structural check and prints its summary; on any violation, prints each one and
 * exits non-zero instead.
 */
function main() {
  const { problems, summary } = runCheck()

  if (problems.length > 0) {
    console.error('ADR structural check: violations found:\n')
    for (const problem of problems) {
      console.error(`  - ${problem}`)
    }
    process.exitCode = 1
    return
  }

  console.log(summary)
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`. `import.meta.url` is both
// percent-encoded AND symlink-resolved by Node; `process.argv[1]` is neither, so an
// invocation through a symlinked absolute path (macOS's `/tmp` -> `/private/tmp`, for one)
// makes the two sides disagree even under the fixed `pathToFileURL` form - `main()` silently
// never fires and the script exits 0 having printed nothing. `realpathSync` on both sides
// closes that gap too. The `process.argv[1] &&` limb is still load-bearing: `argv[1]` is
// undefined whenever this module is IMPORTED rather than run as an entry point, and this file
// exports `parseFrontmatter` precisely so it can be imported. The limb is what keeps the guard
// from throwing on an import; it is not conditional on there being an importer today.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
