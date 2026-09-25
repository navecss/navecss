#!/usr/bin/env node
/**
 * Tripwire for `G1 R27`'s (`AC-theming-32`) contract, widened to cover core's full run-time
 * custom-property dependency rather than only its colour subset, per a later ruling.
 *
 * `packages/tokens/src/theming/core-contract.ts` derives the required core
 * contract by scanning `var(--nave-*)` usage across `@navecss/core`'s real
 * source, but nothing before this script ran that scan in CI and compared
 * it against anything: the machinery was unit-tested against synthetic
 * inputs only, so a token added to or removed from core's real usage
 * without the recorded contract being regenerated would ship uncaught.
 * A quality-review read of the AC: this is a genuine build/CI gap,
 * not only a wiring one — the drift check must be symmetric (added OR
 * removed), which is why this script uses `diffContract`, not
 * `validateAgainstManifest` (R28's deliberately one-directional
 * consumer-facing check — see that function's own doc).
 *
 * The scanned FILE SET is discovered by `discoverSourceFiles`, not a hardcoded
 * two-file array (per that ruling's rule 2: a list is a census and goes stale the first
 * time `@navecss/core` grows a file).
 *
 * `packages/tokens/core-contract.recorded.json` is the recorded contract:
 * checked in deliberately, regenerated ONLY with `--write` when a change to
 * core's real usage is intended (the `atomic-css-contract.test.ts` /
 * `tokens-css-contract.test.ts` snapshot convention, expressed as a plain
 * JSON file here rather than a vitest snapshot so this script can run
 * standalone in `scripts:check`, matching its sibling checks' shape).
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  diffContract,
  discoverSourceFiles,
  scanCoreContractFromDisk,
} from '../packages/tokens/src/theming/core-contract.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECORDED_PATH = path.join(ROOT, 'packages/tokens/core-contract.recorded.json')
const CORE_SRC_DIR = path.join(ROOT, 'packages/core/src')

/**
Reads the checked-in recorded contract's `tokens` array.
 */
export function readRecordedContract(recordedPath) {
  const parsed = JSON.parse(readFileSync(recordedPath, 'utf8'))
  return parsed.tokens
}

/**
Formats a drift result as human-readable lines, or `[]` if there is none.
 */
export function formatDrift(drift) {
  const lines = Array.from(
    drift.added,
    (name) => `  + ${name}  (in core's real usage, missing from the recorded contract)`,
  )
  for (const name of drift.missing) {
    lines.push(`  - ${name}  (in the recorded contract, no longer in core's real usage)`)
  }
  return lines
}

/**
 * The real, run-time scan `main()` performs, extracted and parameterised so a test can assert
 * this SEAM rather than only the underlying `discoverSourceFiles` walk in isolation
 * (`core-contract.test.ts` already covers that half). Before this existed, `main()`'s call
 * site — `scanCoreContractFromDisk(discoverSourceFiles(CORE_SRC_DIR))` — was reachable by no
 * test at all: reverting it to the exact old hardcoded two-file census
 * (`[reset.css, atoms.ts]`) left the whole suite, the drift check itself, and the shipped
 * manifest all unchanged, measured directly — today's tree happens to have no third file
 * carrying a real reference, so nothing distinguishes the hardcoded census from the real rule.
 *
 * `dir` defaults to `CORE_SRC_DIR`, the real directory a production run scans — a test MUST
 * assert this default explicitly, not only an injected fixture directory. Parameterising a
 * function to make it testable does not remove the untested surface, it relocates it into the
 * default that only production ever supplies, so the seam this adds is itself the next place
 * to probe: asserting only the injected value would leave the one input production actually
 * takes unverified.
 */
export function scanSources(dir = CORE_SRC_DIR) {
  return new Set(scanCoreContractFromDisk(discoverSourceFiles(dir)))
}

/**
 * With `--write`, regenerates the recorded core contract from core's real source. Otherwise
 * compares the recorded contract against what core actually emits and exits non-zero on any
 * drift between them.
 */
function main() {
  const write = process.argv.includes('--write')
  const emitted = scanSources()

  if (write) {
    const sorted = [...emitted].toSorted((a, b) => a.localeCompare(b))
    writeFileSync(
      RECORDED_PATH,
      `${JSON.stringify(
        {
          $comment: JSON.parse(readFileSync(RECORDED_PATH, 'utf8')).$comment,
          tokens: sorted,
        },
        undefined,
        2,
      )}\n`,
    )
    console.log(`core-contract.recorded.json regenerated: ${sorted.length} tokens.`)
    return
  }

  const recorded = readRecordedContract(RECORDED_PATH)
  const drift = diffContract(recorded, emitted)

  if (drift.added.length > 0 || drift.missing.length > 0) {
    console.error(
      "core's real --nave-* usage disagrees with packages/tokens/core-contract.recorded.json:\n",
    )
    for (const line of formatDrift(drift)) console.error(line)
    console.error(
      '\nIf this is intended, regenerate the recorded contract: ' +
        'node scripts/check-core-contract-drift.mjs --write',
    )
    process.exitCode = 1
    return
  }

  console.log(`Core contract: ${recorded.length} tokens, matches the recorded contract.`)
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`.
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node; `process.argv[1]`
// is neither, so an invocation through a symlinked absolute path (macOS's `/tmp` ->
// `/private/tmp`, for one) makes the two sides disagree even under the fixed
// `pathToFileURL` form — `main()` silently never fires and the script exits 0 having
// printed nothing. `realpathSync` on both sides closes that gap too.
// The `process.argv[1] &&` limb is still load-bearing: `argv[1]` is undefined whenever this
// module is imported rather than run as an entry point.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
