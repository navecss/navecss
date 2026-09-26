/**
 * Bridge's check instrument, chosen before content lands.
 *
 * `@navecss/bridge` ships CSS as source (`files: ["src"]`, `exports` point
 * straight at `src/*.css`): for a source-shipped package the source IS the
 * shipped artifact, so a source-level test plays the role a built-output
 * test plays for `core` and `tokens`. Which shape a package's check
 * instrument takes is settled before content lands, not after, so the
 * instrument is never chosen to fit what was already written.
 *
 * This closes a gap `scale-unlimited/declaration-strict-value` cannot
 * reach even once its bridge override is dropped (`.stylelintrc.json`).
 * Empirically probed rather than assumed: that
 * rule only inspects declarations whose PROPERTY matches its configured
 * list of ordinary CSS properties (`color`, `background-color`, ...); a
 * custom-property declaration such as `--base-ui-color-accent: <value>`
 * is never checked by it, override present or not, because custom
 * properties are outside the rule's matched-property surface entirely.
 * Every documented bridge declaration IS a custom property
 * (`--[base-ui|radix]-[token]: var(--[nave-token])`, per the pattern
 * comment in src/base-ui.css and src/radix.css), so the one rule whose
 * job is "use a token, not a literal" cannot see bridge's actual content
 * shape at all, however it is configured. This test is the guard for
 * that shape; the stylelint rule remains the guard for any ordinary CSS
 * property bridge might also set.
 *
 * Zero declarations today (both files are comment-only placeholders
 * inside an empty `@layer tokens.defaults { :root {} }`) is the expected,
 * correct state, not a vacuous check: this is the instrument chosen BEFORE
 * content lands, so it starts asserting real coverage the moment the
 * first token mapping is written, rather than being bolted on after.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

const srcCssFiles = readdirSync(SRC).filter((file) => file.endsWith('.css'))

/** One bare `var(--token)` reference, the documented bridge mapping pattern's atom. Matched
 * with a global `replace`, never wrapped in a repeated group (see `isVarOnlyValue` below). */
const VAR_TOKEN = /var\(\s*--[a-zA-Z][a-zA-Z0-9-]*\s*\)/g

/**
 * True when `value` is built entirely from one or more bare `var(--token)` references — the
 * documented bridge mapping pattern — with no fallback and no literal content anywhere else in
 * the value.
 *
 * NOT `/^(\s*var\(\s*--[a-zA-Z][a-zA-Z0-9-]*\s*\)\s*)+$/`: wrapping the atom in a repeated
 * group whose OWN inside carries a leading and trailing `\s*` makes the whitespace between two
 * consecutive tokens splittable between the previous repetition's trailing `\s*` and the next
 * repetition's leading `\s*` in as many ways as the run is long, and when the overall match then
 * fails (any value that is not entirely `var()` tokens), the engine walks every one of those
 * splits before giving up — exponential backtracking (CodeQL `js/redos`; a string of many
 * repeated `var(--A)`s missing its final closing shape is exactly the reported trigger shape).
 * Matching each token with a plain, non-repeated pattern and checking that consuming every
 * match (plus trimming the whitespace between and around them) leaves nothing behind has no
 * repeated group to be ambiguous about, so it is linear regardless of input.
 */
function isVarOnlyValue(value: string): boolean {
  if (value.trim() === '') return false
  return value.replace(VAR_TOKEN, '').trim() === ''
}

describe('every bridge custom property is a bare reference to a Nave token', () => {
  it.each(srcCssFiles)('src/%s has no custom property with a non-var() value', (file) => {
    const css = readFileSync(path.join(SRC, file), 'utf8')
    const root = postcss.parse(css)
    const offenders: string[] = []

    root.walkDecls((decl) => {
      if (!decl.prop.startsWith('--')) return
      if (!isVarOnlyValue(decl.value)) offenders.push(`${decl.prop}: ${decl.value}`)
    })

    expect(
      offenders,
      `bridge custom properties with a non-var()-only value in src/${file}: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})

/**
 * Runs `VAR_TOKEN.replace(...).trim() === ''` (the body of `isVarOnlyValue`, minus the empty-
 * value guard) inside a worker thread and resolves with the elapsed milliseconds, or `null` if
 * it has not finished within `timeoutMs`: a worker that throws rejects with its own error rather
 * than reading as a timeout. A hard `timeoutMs` bound cannot be enforced on the MAIN thread: the
 * call is synchronous and, when the pattern under test backtracks catastrophically, blocks the
 * event loop outright, so a `setTimeout` racing it on the same thread never gets to fire — but
 * the SAME race on the main thread works fine against a WORKER's result, since the worker's own
 * blocking computation runs on a different thread and never blocks this one. `Promise.race`
 * against a timeout, terminating the worker in `finally` regardless of which side wins, bounds
 * it for real with no manual settled-flag bookkeeping. The regex source and flags are read off
 * the live `VAR_TOKEN` (never re-typed), so this cannot silently stop covering the actual
 * pattern if a future edit changes it.
 */
function measureVarOnlyCheckOnWorker(value: string, timeoutMs: number): Promise<number | null> {
  const workerSource = `
    const { parentPort, workerData } = require('node:worker_threads')
    const re = new RegExp(workerData.source, workerData.flags)
    const t0 = Date.now()
    workerData.value.replace(re, '').trim()
    parentPort.postMessage(Date.now() - t0)
  `
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: { source: VAR_TOKEN.source, flags: VAR_TOKEN.flags, value },
  })
  const result = new Promise<number | null>((resolve, reject) => {
    worker.once('message', resolve)
    worker.once('error', reject)
  })
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return Promise.race([result, timeout]).finally(() => worker.terminate())
}

describe('isVarOnlyValue: the shapes it accepts and refuses, and its linear time bound', () => {
  it('accepts a single bare var() reference', () => {
    expect(isVarOnlyValue('var(--a)')).toBe(true)
  })

  it('accepts several space-separated var() references', () => {
    expect(isVarOnlyValue('var(--a) var(--b) var(--c)')).toBe(true)
  })

  it('accepts internal whitespace inside a var() call and around the whole value', () => {
    expect(isVarOnlyValue('  var( --a )  ')).toBe(true)
  })

  it('accepts tokens with no separating whitespace at all (the old pattern accepted this too)', () => {
    expect(isVarOnlyValue('var(--a)var(--b)')).toBe(true)
  })

  it('refuses a bare literal', () => {
    expect(isVarOnlyValue('red')).toBe(false)
  })

  it('refuses a var() reference mixed with a literal', () => {
    expect(isVarOnlyValue('var(--a) red')).toBe(false)
  })

  it('refuses a var() with a fallback — a fallback is not a bare reference', () => {
    expect(isVarOnlyValue('var(--a, red)')).toBe(false)
  })

  it('refuses the empty string and whitespace-only values', () => {
    expect(isVarOnlyValue('')).toBe(false)
    expect(isVarOnlyValue('   ')).toBe(false)
  })

  // `IS_VAR_ONLY_VALUE` used to be `/^(\s*var\(\s*--[a-zA-Z][a-zA-Z0-9-]*\s*\)\s*)+$/`, tested
  // whole-value with `.test()`. Its repeated group's leading AND trailing `\s*` made the
  // whitespace between two consecutive tokens splittable in as many ways as the run was long, so
  // a value that ultimately fails to match (real CSS values commonly do) walked every split
  // before giving up — exponential backtracking. `isVarOnlyValue` has no repeated group at all
  // (a single global, non-repeating pattern consumed via `replace`), so it has nothing to be
  // ambiguous about. This row is RED against the old pattern (measured: 20, 22, 24 and 26
  // repetitions took ~0.2 s, ~0.9 s, ~3.6 s and ~15 s, doubling with every added repetition) and
  // GREEN here; if a future edit reintroduces a repeated group over this shape, this test times
  // out and reds rather than the next hung CI job doing the catching.
  it('many repeated var() tokens with no valid closing shape must not exponentially backtrack', async () => {
    const TIMEOUT_MS = 3000
    const pathological = 'var(--A) '.repeat(30) + 'X'
    const elapsedMs = await measureVarOnlyCheckOnWorker(pathological, TIMEOUT_MS)
    expect(
      elapsedMs,
      `the var-only check on 30 repeated "var(--A) " tokens did not finish within ` +
        `${TIMEOUT_MS}ms; VAR_TOKEN has regained a repeated group and is catastrophically ` +
        'backtracking again',
    ).not.toBeNull()
    expect(
      elapsedMs,
      `took ${elapsedMs}ms on 30 repeated tokens; a linear-time match finishes in well under a ` +
        'second, and the exponential one it replaced takes over a minute',
    ).toBeLessThan(1000)
  }, 10_000)
})
