import { ESLint } from 'eslint'
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * A prior review round (finding 2): `no-regex-spaces`, `unicorn/prefer-string-repeat`,
 * `unicorn/no-array-from-fill` and `unicorn/no-duplicate-loops` used to be `'off'` for the whole
 * `scripts/**\/*.mjs` directory, even though every real violation that review found for all four
 * sits inside a `.test.mjs` fixture, never in a gate. They are now scoped to
 * `scripts/**\/*.test.mjs` only, which means a GATE module (a non-`.test.mjs` file under
 * `scripts/`) carrying the same defect must be reported, not silently passed the way it was
 * before the narrowing.
 *
 * This drives `eslint.config.js` itself, live, through the ESLint Node API rather than
 * asserting on the config OBJECT: a rule name present in the right block proves nothing about
 * which files it actually applies to once flat config's file-pattern resolution runs. Uses
 * `ESLint#lintText` with a `filePath` naming a FIXTURE location that does not exist on disk —
 * ESLint resolves config purely from that path string, so this needs no scratch file under
 * `scripts/` and leaves nothing to clean up.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// One minimal fixture per narrowed rule, each the smallest self-contained source that trips it.
//
// A later review round (terminal read, finding 3): this was a single fixture for
// `no-regex-spaces` while the docblock above claimed all four. That review measured what that
// cost by moving each rule back to the directory-wide block one at a time — `no-regex-spaces`
// went RED, and the other three stayed GREEN, so three of the four relaxations could silently
// revert with nothing to catch them. An instrument narrower than the sentence it backs is a known
// anti-pattern. The table is the fix: adding a rule to the narrowing means adding a row here.
const FIXTURES = {
  'no-regex-spaces': 'export const PATTERN = /License  parity/\n',
  'unicorn/prefer-string-repeat': "export const PAD = '   '\n",
  'unicorn/no-array-from-fill': "export const ROWS = Array.from({ length: 8 }).fill('x')\n",
  'unicorn/no-duplicate-loops':
    'export function run(xs) {\n  for (const x of xs.filter((v) => v)) {\n    void x\n  }\n}\n',
}

/**
 * Lints `code` as if it were the file at `relPathFromRoot` (which need not exist), against this
 * repository's own real `eslint.config.js`, and returns the messages `ruleId` produced.
 */
async function lintFixtureFor(relPathFromRoot, code, ruleId) {
  const eslint = new ESLint({ cwd: ROOT })
  const [result] = await eslint.lintText(code, {
    filePath: path.join(ROOT, relPathFromRoot),
  })
  return result.messages.filter((m) => m.ruleId === ruleId)
}

for (const [ruleId, code] of Object.entries(FIXTURES)) {
  test(`${ruleId} fires on a GATE module under scripts/, not just directory-wide off`, async () => {
    const messages = await lintFixtureFor('scripts/check-fixture-gate.mjs', code, ruleId)
    assert.equal(
      messages.length,
      1,
      `a gate module (non-.test.mjs) carrying the ${ruleId} defect must be reported; zero ` +
        'messages means the rule is off directory-wide again and the narrowing does not hold',
    )
  })

  test(`${ruleId} stays off for a scripts/ TEST file, the narrowing's other half`, async () => {
    const messages = await lintFixtureFor('scripts/check-fixture-gate.test.mjs', code, ruleId)
    assert.equal(
      messages.length,
      0,
      `a .test.mjs fixture is where every real ${ruleId} violation actually lives; it must ` +
        'stay exempt, or the narrowing has widened into a directory-wide regression the other way',
    )
  })
}
