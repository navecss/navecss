/**
 * `.stylelintrc.json`'s `property-no-vendor-prefix` override (scoped to
 * `packages/core/src/reset.css`) used to carry a custom `message`. Stylelint applies a custom
 * `message` to EVERY violation of the rule it is attached to, not only the one the message was
 * written about, so any OTHER prefixed property added to that file was reported with the
 * `-webkit-text-size-adjust`-specific sentence instead of naming itself. Removing the
 * `message` key restores Stylelint's default message, which names the actual offending
 * property.
 *
 * This test proves the fix rather than the absence of the key: it lints a real violation
 * (a prefixed property NOT in `ignoreProperties`) through the repo's real config, and asserts
 * the reported warning text names THAT property.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RESET_CSS_PATH = path.join(ROOT, 'packages/core/src/reset.css')

test('a prefixed property outside ignoreProperties is reported under its own name', async () => {
  const result = await stylelint.lint({
    code: '.probe { -webkit-user-select: none; }',
    codeFilename: RESET_CSS_PATH,
    configFile: path.join(ROOT, '.stylelintrc.json'),
  })

  const warnings = result.results[0]?.warnings ?? []
  const prefixWarning = warnings.find((w) => w.rule === 'property-no-vendor-prefix')

  assert.ok(
    prefixWarning,
    `expected a property-no-vendor-prefix warning, got: ${JSON.stringify(warnings)}`,
  )
  // This one assertion carries the whole point: the report must name the property it is
  // actually reporting. Deliberately NOT also asserting that the text never mentions
  // `-webkit-text-size-adjust`. That would be stronger than the defect this guards against,
  // and would forbid a lawful future message that explains why this file carries one
  // deliberate prefix while still naming the offender.
  assert.match(prefixWarning.text, /-webkit-user-select/)
})
