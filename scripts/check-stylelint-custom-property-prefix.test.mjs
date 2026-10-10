/**
 * R26: `custom-property-pattern` used to make the `nave-` segment OPTIONAL
 * (`(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?`), so an unprefixed custom property declared in
 * any linted src CSS passed silently. R26's own subject line ("every custom
 * property Nave emits ... begins with --nave-") already has the enforcement pattern
 * three rules up (`selector-class-pattern` requires the `nave-` segment for class
 * names); this proves the same requirement now holds for custom properties. No
 * stylesheet is exempt: the one package that was (a bridge that declared a UI
 * library's own variable names) no longer exists, and the Base UI package ships no
 * custom property of its own. Known gap, shared with every exact-prefix check here:
 * custom properties are case-sensitive, so `--NAVE-x` is not matched (nor is it a
 * Nave name).
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

async function lintWarning(declaration, codeFilename = RESET_CSS_PATH) {
  const result = await stylelint.lint({
    code: `.probe { ${declaration} }`,
    codeFilename,
    configFile: path.join(ROOT, '.stylelintrc.json'),
  })
  const warnings = result.results[0]?.warnings ?? []
  return warnings.find((w) => w.rule === 'custom-property-pattern')
}

test('an unprefixed custom property declaration is rejected', async () => {
  const warning = await lintWarning('--foo-bar: red;')
  assert.ok(warning, 'expected a custom-property-pattern warning for --foo-bar')
})

test('a --nave- prefixed custom property declaration passes', async () => {
  const warning = await lintWarning('--nave-color-primary: red;')
  assert.equal(warning, undefined, `expected no warning, got: ${JSON.stringify(warning)}`)
})

test('an unprefixed var() reference in core source is rejected', async () => {
  const warning = await lintWarning('color: var(--foo-bar);')
  assert.ok(warning, 'expected a custom-property-pattern warning for var(--foo-bar)')
})
