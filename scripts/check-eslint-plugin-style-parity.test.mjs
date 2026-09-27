/**
 * AC-eslint-plugin-27 covers: R5b.
 *
 * The eslint-plugin style rule reads a generated, drift-checked copy of
 * `@navecss/stylelint-config`'s property/value data (`packages/eslint-plugin/src/generated/
 * style-properties.recorded.json`, kept honest by `check-eslint-plugin-style-properties-drift`).
 * That check proves the DATA agrees; it says nothing about whether the two tools' own admits
 * LOGIC agrees on a real value — which is exactly the kind of thing that drifted once already
 * (a shorthand like `margin: '0 auto'` was reported by the eslint rule while stylelint's own
 * `declaration-strict-value` passed it, because the eslint side checked the whole string instead
 * of each space-separated part). This corpus runs identical property/value pairs through both
 * real tools — real `stylelint.lint()` against the real shipped config, and a real ESLint
 * `Linter` against the real plugin rule — and asserts each one's verdict against a stated
 * expectation, and against each other.
 *
 * `scripts/` is not covered by any package's vitest project, so this runs under Node's built-in
 * test runner (`node --test`, via `scripts:test`), not vitest.
 */
import { Linter } from 'eslint'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import stylelintDefault from 'stylelint'

import { styleValuesRule } from '../packages/eslint-plugin/src/rules/style-values.ts'
import stylelintConfig from '../packages/stylelint-config/index.js'

const stylelint = stylelintDefault.default ?? stylelintDefault

/**
Runs one CSS declaration through the real stylelint-config; true if the strict-value rule fires.
 */
async function stylelintReports(cssProperty, cssValue) {
  const result = await stylelint.lint({
    code: `.x { ${cssProperty}: ${cssValue}; }`,
    config: stylelintConfig,
  })
  return result.results[0].warnings.some(
    (warning) => warning.rule === 'scale-unlimited/declaration-strict-value',
  )
}

const linter = new Linter()
const languageOptions = {
  ecmaVersion: 2024,
  sourceType: 'module',
  parserOptions: { ecmaFeatures: { jsx: true } },
}

/**
Runs one JSX style-object property through the real eslint-plugin rule; true if it fires.
 */
function eslintReports(jsxKey, jsxValueLiteral) {
  const code = `const el = <div style={{ ${jsxKey}: ${jsxValueLiteral} }} />`
  const messages = linter.verify(code, {
    languageOptions,
    plugins: { '@navecss': { rules: { 'style-values': styleValuesRule } } },
    rules: { '@navecss/style-values': 'error' },
  })
  return messages.some((message) => message.ruleId === '@navecss/style-values')
}

/**
 * Each case names a CSS property/value pair, the equivalent JSX style key/literal, and whether
 * the value SHOULD be admitted (no report) under R11b's own stated semantics.
 */
const CASES = [
  { cssProperty: 'color', cssValue: 'currentcolor', jsxKey: 'color', jsxValueLiteral: "'currentcolor'", expectReported: false },
  { cssProperty: 'color', cssValue: 'var(--nave-brand)', jsxKey: 'color', jsxValueLiteral: "'var(--nave-brand)'", expectReported: false },
  { cssProperty: 'color', cssValue: '#ff0000', jsxKey: 'color', jsxValueLiteral: "'#ff0000'", expectReported: true },
  { cssProperty: 'border-color', cssValue: 'transparent', jsxKey: 'borderColor', jsxValueLiteral: "'transparent'", expectReported: false },
  { cssProperty: 'border-color', cssValue: 'red', jsxKey: 'borderColor', jsxValueLiteral: "'red'", expectReported: true },
  { cssProperty: 'font-size', cssValue: '1em', jsxKey: 'fontSize', jsxValueLiteral: "'1em'", expectReported: false },
  { cssProperty: 'font-size', cssValue: '16px', jsxKey: 'fontSize', jsxValueLiteral: "'16px'", expectReported: true },
  { cssProperty: 'font-weight', cssValue: 'normal', jsxKey: 'fontWeight', jsxValueLiteral: "'normal'", expectReported: false },
  { cssProperty: 'font-weight', cssValue: '700', jsxKey: 'fontWeight', jsxValueLiteral: '700', expectReported: true },
  { cssProperty: 'font-family', cssValue: 'inherit', jsxKey: 'fontFamily', jsxValueLiteral: "'inherit'", expectReported: false },
  { cssProperty: 'font-family', cssValue: 'Arial, sans-serif', jsxKey: 'fontFamily', jsxValueLiteral: "'Arial, sans-serif'", expectReported: true },
  { cssProperty: 'line-height', cssValue: 'normal', jsxKey: 'lineHeight', jsxValueLiteral: "'normal'", expectReported: false },
  { cssProperty: 'line-height', cssValue: '1.5', jsxKey: 'lineHeight', jsxValueLiteral: '1.5', expectReported: true },
  { cssProperty: 'letter-spacing', cssValue: 'normal', jsxKey: 'letterSpacing', jsxValueLiteral: "'normal'", expectReported: false },
  { cssProperty: 'letter-spacing', cssValue: '0.5px', jsxKey: 'letterSpacing', jsxValueLiteral: "'0.5px'", expectReported: true },
  { cssProperty: 'border-radius', cssValue: '0', jsxKey: 'borderRadius', jsxValueLiteral: '0', expectReported: false },
  { cssProperty: 'border-radius', cssValue: '8px', jsxKey: 'borderRadius', jsxValueLiteral: '8', expectReported: true },
  { cssProperty: 'transition-duration', cssValue: '0ms', jsxKey: 'transitionDuration', jsxValueLiteral: "'0ms'", expectReported: false },
  { cssProperty: 'transition-duration', cssValue: '300ms', jsxKey: 'transitionDuration', jsxValueLiteral: "'300ms'", expectReported: true },
  { cssProperty: 'gap', cssValue: 'normal', jsxKey: 'gap', jsxValueLiteral: "'normal'", expectReported: false },
  { cssProperty: 'gap', cssValue: '0', jsxKey: 'gap', jsxValueLiteral: '0', expectReported: false },
  { cssProperty: 'gap', cssValue: '16px', jsxKey: 'gap', jsxValueLiteral: '16', expectReported: true },
  { cssProperty: 'padding', cssValue: '0', jsxKey: 'padding', jsxValueLiteral: '0', expectReported: false },
  { cssProperty: 'padding', cssValue: '16px', jsxKey: 'padding', jsxValueLiteral: '16', expectReported: true },
  { cssProperty: 'margin', cssValue: '0 auto', jsxKey: 'margin', jsxValueLiteral: "'0 auto'", expectReported: false },
  { cssProperty: 'margin', cssValue: '10px auto', jsxKey: 'margin', jsxValueLiteral: "'10px auto'", expectReported: true },
  { cssProperty: 'z-index', cssValue: 'auto', jsxKey: 'zIndex', jsxValueLiteral: "'auto'", expectReported: false },
  { cssProperty: 'z-index', cssValue: '999', jsxKey: 'zIndex', jsxValueLiteral: '999', expectReported: true },
  { cssProperty: 'opacity', cssValue: '1', jsxKey: 'opacity', jsxValueLiteral: '1', expectReported: false },
  { cssProperty: 'opacity', cssValue: '0.5', jsxKey: 'opacity', jsxValueLiteral: '0.5', expectReported: true },
  { cssProperty: 'box-shadow', cssValue: 'none', jsxKey: 'boxShadow', jsxValueLiteral: "'none'", expectReported: false },
  { cssProperty: 'box-shadow', cssValue: '0 1px 2px black', jsxKey: 'boxShadow', jsxValueLiteral: "'0 1px 2px black'", expectReported: true },
]

describe('AC-27: eslint-plugin and stylelint agree on identical property/value pairs', () => {
  for (const testCase of CASES) {
    test(`${testCase.cssProperty}: ${testCase.cssValue}`, async () => {
      const fromStylelint = await stylelintReports(testCase.cssProperty, testCase.cssValue)
      const fromEslint = eslintReports(testCase.jsxKey, testCase.jsxValueLiteral)
      assert.equal(fromStylelint, testCase.expectReported, 'stylelint verdict')
      assert.equal(fromEslint, testCase.expectReported, 'eslint-plugin verdict')
      assert.equal(fromEslint, fromStylelint, 'the two tools disagree on an identical value')
    })
  }
})
