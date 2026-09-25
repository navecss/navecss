/**
 * R26: `custom-property-pattern` used to make the `nave-` segment OPTIONAL
 * (`(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?`), so an unprefixed custom property declared in
 * any linted src CSS passed silently. R26's own subject line ("every custom
 * property Nave emits ... begins with --nave-") already has the enforcement pattern
 * three rules up (`selector-class-pattern` requires the `nave-` segment for class
 * names); this proves the same requirement now holds for custom properties. The
 * bridge stylesheets are the one exemption (an override in the config): they
 * declare a UI library's own variable names, never a --nave- one, so the pattern is
 * switched off there and a `property-disallowed-list` rule holds the bridge's side of
 * the contract instead. That rule is `AC-theming-31`'s coverage for `@navecss/bridge`
 * (`docs/04-adr/0003-layer-cascade-contract.md`: the bridge "never writes a `--nave-*`
 * name itself"). The bridge ships its `src/*.css` as-is, so linting that source is the
 * shipped-artifact check. Known gap, shared with every exact-prefix check here: custom
 * properties are case-sensitive, so `--NAVE-x` is not matched (nor is it a Nave name).
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

async function lintWarning(
  declaration,
  codeFilename = RESET_CSS_PATH,
  rule = 'custom-property-pattern',
) {
  const result = await stylelint.lint({
    code: `.probe { ${declaration} }`,
    codeFilename,
    configFile: path.join(ROOT, '.stylelintrc.json'),
  })
  const warnings = result.results[0]?.warnings ?? []
  return warnings.find((w) => w.rule === rule)
}

test('an unprefixed custom property declaration is rejected', async () => {
  const warning = await lintWarning('--foo-bar: red;')
  assert.ok(warning, 'expected a custom-property-pattern warning for --foo-bar')
})

test('a --nave- prefixed custom property declaration passes', async () => {
  const warning = await lintWarning('--nave-color-primary: red;')
  assert.equal(warning, undefined, `expected no warning, got: ${JSON.stringify(warning)}`)
})

test('a bridge mapping of a library variable onto a Nave token passes (bridge override)', async () => {
  const warning = await lintWarning('--accent-9: var(--nave-color-primary-500);', BRIDGE_CSS_PATH)
  assert.equal(warning, undefined, `expected no warning, got: ${JSON.stringify(warning)}`)
})

test('a bridge declaring a --nave- name is rejected (bridge override)', async () => {
  const warning = await lintWarning(
    '--nave-color-primary: red;',
    BRIDGE_CSS_PATH,
    'property-disallowed-list',
  )
  assert.ok(warning, 'expected a property-disallowed-list warning for --nave-color-primary')
})

test('a bridge mapping of a library variable onto a Nave token does not trip the declaration ban', async () => {
  const warning = await lintWarning(
    '--accent-9: var(--nave-color-primary-500);',
    BRIDGE_CSS_PATH,
    'property-disallowed-list',
  )
  assert.equal(warning, undefined, `expected no warning, got: ${JSON.stringify(warning)}`)
})

test('an unprefixed var() reference in core source is rejected', async () => {
  const warning = await lintWarning('color: var(--foo-bar);')
  assert.ok(warning, 'expected a custom-property-pattern warning for var(--foo-bar)')
})
