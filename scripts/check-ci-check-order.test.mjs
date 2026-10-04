/**
 * Coverage for check-ci-check-order.mjs, run with Node's built-in test
 * runner.
 *
 * Armed-not-vacuous is the whole point of this gate (a rule existing in source proves it is
 * configured, never that it would fire), so the first two tests reproduce the two real defects
 * this class has actually produced: a MEMBERSHIP drop (a gate landed with no corresponding list
 * entry) and an ORDER transposition (`a6555fd`, items 5 and 6 swapped, false for days). Both
 * must turn a real `equal: True` into `equal: False`, or this gate is decorative.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chainsAgree, extractContributingChain, main } from './check-ci-check-order.mjs'
import { STEPS } from './run-ci-check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BASELINE_TEXT = `
Some preamble.

\`ci:check\` runs these steps:

1. **\`typecheck\`** — type checking.
2. **\`lint\`** — linting.
3. **\`test\`** — unit tests.

Trailing paragraph, unrelated.
`

const BASELINE_CHAIN = ['typecheck', 'lint', 'test']

test('extractContributingChain reads the ordered bold code-span labels', () => {
  assert.deepEqual(extractContributingChain(BASELINE_TEXT), ['typecheck', 'lint', 'test'])
})

test('extractContributingChain returns null when the heading is absent', () => {
  assert.equal(extractContributingChain('No such heading here.'), null)
})

test('baseline: matching chains agree', () => {
  const contributing = extractContributingChain(BASELINE_TEXT)
  const ciCheck = BASELINE_CHAIN
  assert.equal(chainsAgree(contributing, ciCheck), true)
})

test('ARMED — a MEMBERSHIP drop (the real shape this gate is filed against) is caught', () => {
  const droppedText = BASELINE_TEXT.replace('3. **`test`** — unit tests.\n', '')
  const contributing = extractContributingChain(droppedText)
  const ciCheck = BASELINE_CHAIN
  assert.deepEqual(contributing, ['typecheck', 'lint'])
  assert.equal(chainsAgree(contributing, ciCheck), false)
})

test('ARMED — an ORDER transposition (the a6555fd shape) is caught', () => {
  const transposedText = BASELINE_TEXT.replace(
    '2. **`lint`** — linting.\n3. **`test`** — unit tests.',
    '2. **`test`** — unit tests.\n3. **`lint`** — linting.',
  )
  const contributing = extractContributingChain(transposedText)
  const ciCheck = BASELINE_CHAIN
  assert.deepEqual(contributing, ['typecheck', 'test', 'lint'])
  // same set, different order — a set-difference check would miss this and it must not.
  assert.deepEqual([...contributing].sort(), [...ciCheck].sort())
  assert.equal(chainsAgree(contributing, ciCheck), false)
})

test('DISARM CHECK — reverting the transposition goes green again', () => {
  const contributing = extractContributingChain(BASELINE_TEXT)
  const ciCheck = BASELINE_CHAIN
  assert.equal(chainsAgree(contributing, ciCheck), true)
})

test('end to end: the real repo tree passes today', () => {
  const contributingText = readFileSync(path.join(ROOT, '.github', 'CONTRIBUTING.md'), 'utf8')

  const contributing = extractContributingChain(contributingText)
  const ciCheck = STEPS.map((step) => step.name)

  assert.ok(contributing !== null, 'CONTRIBUTING.md heading/list must parse')
  assert.equal(
    chainsAgree(contributing, ciCheck),
    true,
    `CONTRIBUTING.md: ${contributing?.join(', ')}\nrun-ci-check.mjs: ${ciCheck.join(', ')}`,
  )
})

/**
Builds a throwaway repo root with the given CONTRIBUTING.md text.
 */
function fixtureRoot(contributing) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-order-'))
  mkdirSync(path.join(dir, '.github'), { recursive: true })
  writeFileSync(path.join(dir, '.github', 'CONTRIBUTING.md'), contributing)
  return dir
}

/**
Runs `main()` against a fixture root, capturing its exit code and output without leaking either.
 */
function runMain(rootDir, steps) {
  const priorExit = process.exitCode
  const priorLog = console.log
  const priorError = console.error
  const out = []
  const err = []
  process.exitCode = 0
  console.log = (...args) => out.push(args.join(' '))
  console.error = (...args) => err.push(args.join(' '))
  try {
    main(rootDir, steps)
  } finally {
    console.log = priorLog
    console.error = priorError
  }
  const code = process.exitCode ?? 0
  process.exitCode = priorExit
  return { code, out: out.join('\n'), err: err.join('\n') }
}

test('main() exits 0 and says so when the list matches the chain', () => {
  const r = runMain(fixtureRoot(BASELINE_TEXT), BASELINE_CHAIN)
  assert.equal(r.code, 0)
  assert.match(r.out, /3-step list matches/)
  assert.equal(r.err, '')
})

test('main() EXITS 1 on a mismatch, the exit code and not just the comparison', () => {
  const r = runMain(fixtureRoot(BASELINE_TEXT), [...BASELINE_CHAIN, 'scripts:check'])
  assert.equal(r.code, 1)
  assert.equal(r.out, '')
  assert.match(r.err, /does not match/)
})

test('FAILS CLOSED: main() EXITS 1 when the list under the heading cannot be parsed', () => {
  const unparseable = BASELINE_TEXT.replaceAll(/^\d+\. \*\*(`[^`]+`)\*\*/gm, '- $1')
  const r = runMain(fixtureRoot(unparseable), BASELINE_CHAIN)
  assert.equal(r.code, 1)
  assert.equal(r.out, '')
  assert.match(r.err, /refusing to run/)
})

test('FAILS CLOSED: main() EXITS 1 when the heading is absent', () => {
  const r = runMain(fixtureRoot('No heading at all.\n'), BASELINE_CHAIN)
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('FAILS CLOSED: main() EXITS 1 when the step list is empty', () => {
  const r = runMain(fixtureRoot(BASELINE_TEXT), [])
  assert.equal(r.code, 1)
  assert.match(r.err, /refusing to run/)
})

test('ARMED — an ADDITION (a documented step the chain does not run) is caught', () => {
  const extraText = BASELINE_TEXT.replace(
    '3. **`test`** — unit tests.',
    '3. **`test`** — unit tests.\n4. **`check:pack`** — packaging.',
  )
  const contributing = extractContributingChain(extraText)
  const ciCheck = BASELINE_CHAIN
  assert.deepEqual(contributing, ['typecheck', 'lint', 'test', 'check:pack'])
  assert.equal(chainsAgree(contributing, ciCheck), false)
})

test('the scan is BOUNDED to the heading’s own section, not to end of file', () => {
  const restructured = `
\`ci:check\` runs these steps:

- \`typecheck\` — the list was restyled and no longer carries bold labels.
- \`lint\` — so this section is now unparseable by this gate.

## An unrelated later section

1. **\`typecheck\`** — decoy.
2. **\`lint\`** — decoy.
3. **\`test\`** — decoy.
`
  // The gate must not reach past the heading's own section and adopt a foreign list:
  // that is a green run about a list the section does not contain.
  assert.equal(extractContributingChain(restructured), null)
  assert.equal(runMain(fixtureRoot(restructured), BASELINE_CHAIN).code, 1)
})

// Phase 3 round-3 pinning rows. All three pin
// properties of the round-2 extractor that nothing else in this file holds; the third is the
// VERIFIER for the malformed-item repair and was RED before it.

test('the heading is anchored to a whole LINE, never matched inside a prose sentence', () => {
  const decoyed = `The section headed \`ci:check\` runs these steps: is reproduced below.

1. **\`alpha\`** — decoy under a PROSE mention of the heading.
2. **\`beta\`** — decoy.
${BASELINE_TEXT}`
  // The prose mention must not anchor the scan: the labels come from the real section.
  assert.deepEqual(extractContributingChain(decoyed), ['typecheck', 'lint', 'test'])
})

test('a numbered item whose code-span label is not BOLD is not a label', () => {
  const debolded = BASELINE_TEXT.replaceAll(/\*\*(`[^`]+`)\*\*/g, '$1')
  assert.equal(extractContributingChain(debolded), null)
  assert.equal(runMain(fixtureRoot(debolded), BASELINE_CHAIN).code, 1)
})

test('a MALFORMED numbered item fails closed rather than truncating the list silently', () => {
  const restyled = BASELINE_TEXT.replace(
    '2. **`lint`** — linting.',
    '2. The **`lint`** step runs next.',
  )
  // Ending the section at item 1 would make items 2 and 3 invisible, and a chain that happens
  // to BE that surviving prefix would then read as agreeing with an 11-item documented list.
  assert.equal(extractContributingChain(restyled), null)
  assert.equal(runMain(fixtureRoot(restyled), ['typecheck']).code, 1)
})
