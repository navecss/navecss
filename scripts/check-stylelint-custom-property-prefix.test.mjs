/**
 * F#264 (R26): `custom-property-pattern` used to make the `nave-` segment OPTIONAL
 * (`(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?`), so an unprefixed custom property declared in
 * any linted src CSS passed silently. R26's own subject line ("every custom
 * property Nave emits ... begins with --nave-") already has the enforcement pattern
 * three rules up (`selector-class-pattern` requires the `nave-` segment for class
 * names); this proves the same requirement now holds for custom properties.
 *
 * Lints through the repo's real config, exactly as check-stylelint-prefix-message
 * does, so a future edit to `.stylelintrc.json` is caught here rather than by
 * re-deriving the rule's shape from prose.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RESET_CSS_PATH = path.join(ROOT, 'packages/core/src/reset.css')

async function lintCustomProperty(declaration) {
  const result = await stylelint.lint({
    code: `.probe { ${declaration} }`,
    codeFilename: RESET_CSS_PATH,
    configFile: path.join(ROOT, '.stylelintrc.json'),
  })
  const warnings = result.results[0]?.warnings ?? []
  return warnings.find((w) => w.rule === 'custom-property-pattern')
}

test('an unprefixed custom property declaration is rejected', async () => {
  const warning = await lintCustomProperty('--foo-bar: red;')
  assert.ok(warning, 'expected a custom-property-pattern warning for --foo-bar')
})

test('a --nave- prefixed custom property declaration passes', async () => {
  const warning = await lintCustomProperty('--nave-color-primary: red;')
  assert.equal(warning, undefined, `expected no warning, got: ${JSON.stringify(warning)}`)
})
