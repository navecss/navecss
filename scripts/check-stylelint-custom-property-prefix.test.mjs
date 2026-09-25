/**
 * R26: `custom-property-pattern` used to make the `nave-` segment OPTIONAL
 * (`(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?`), so an unprefixed custom property declared in
 * any linted src CSS passed silently. R26's own subject line ("every custom
 * property Nave emits ... begins with --nave-") already has the enforcement pattern
 * three rules up (`selector-class-pattern` requires the `nave-` segment for class
 * names); this proves the same requirement now holds for custom properties. The
 * bridge stylesheets are the one exemption (an override in the config): they
 * declare a UI library's own variable names, never a --nave- one, so the pattern is
 * switched off there and the bridge's own test holds that contract instead.
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
const BRIDGE_CSS_PATH = path.join(ROOT, 'packages/bridge/src/radix.css')

async function lintCustomProperty(declaration, codeFilename = RESET_CSS_PATH) {
  const result = await stylelint.lint({
    code: `.probe { ${declaration} }`,
    codeFilename,
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

test('a bridge mapping of a library variable onto a Nave token passes (bridge override)', async () => {
  const warning = await lintCustomProperty(
    '--accent-9: var(--nave-color-primary-500);',
    BRIDGE_CSS_PATH,
  )
  assert.equal(warning, undefined, `expected no warning, got: ${JSON.stringify(warning)}`)
})

test('an unprefixed var() reference in core source is rejected', async () => {
  const warning = await lintCustomProperty('color: var(--foo-bar);')
  assert.ok(warning, 'expected a custom-property-pattern warning for var(--foo-bar)')
})
