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
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import stylelintDefault from 'stylelint'

import { styleValuesRule } from '../packages/eslint-plugin/src/rules/style-values.ts'
import stylelintConfig from '../packages/stylelint-config/index.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
  {
    cssProperty: 'color',
    cssValue: 'currentcolor',
    jsxKey: 'color',
    jsxValueLiteral: "'currentcolor'",
    expectReported: false,
  },
  {
    cssProperty: 'color',
    cssValue: 'var(--nave-brand)',
    jsxKey: 'color',
    jsxValueLiteral: "'var(--nave-brand)'",
    expectReported: false,
  },
  {
    cssProperty: 'color',
    cssValue: '#ff0000',
    jsxKey: 'color',
    jsxValueLiteral: "'#ff0000'",
    expectReported: true,
  },
  {
    cssProperty: 'border-color',
    cssValue: 'transparent',
    jsxKey: 'borderColor',
    jsxValueLiteral: "'transparent'",
    expectReported: false,
  },
  {
    cssProperty: 'border-color',
    cssValue: 'red',
    jsxKey: 'borderColor',
    jsxValueLiteral: "'red'",
    expectReported: true,
  },
  {
    cssProperty: 'font-size',
    cssValue: '1em',
    jsxKey: 'fontSize',
    jsxValueLiteral: "'1em'",
    expectReported: false,
  },
  {
    cssProperty: 'font-size',
    cssValue: '16px',
    jsxKey: 'fontSize',
    jsxValueLiteral: "'16px'",
    expectReported: true,
  },
  {
    cssProperty: 'font-weight',
    cssValue: 'normal',
    jsxKey: 'fontWeight',
    jsxValueLiteral: "'normal'",
    expectReported: false,
  },
  {
    cssProperty: 'font-weight',
    cssValue: '700',
    jsxKey: 'fontWeight',
    jsxValueLiteral: '700',
    expectReported: true,
  },
  {
    cssProperty: 'font-family',
    cssValue: 'inherit',
    jsxKey: 'fontFamily',
    jsxValueLiteral: "'inherit'",
    expectReported: false,
  },
  {
    cssProperty: 'font-family',
    cssValue: 'Arial, sans-serif',
    jsxKey: 'fontFamily',
    jsxValueLiteral: "'Arial, sans-serif'",
    expectReported: true,
  },
  {
    cssProperty: 'line-height',
    cssValue: 'normal',
    jsxKey: 'lineHeight',
    jsxValueLiteral: "'normal'",
    expectReported: false,
  },
  {
    cssProperty: 'line-height',
    cssValue: '1.5',
    jsxKey: 'lineHeight',
    jsxValueLiteral: '1.5',
    expectReported: true,
  },
  {
    cssProperty: 'letter-spacing',
    cssValue: 'normal',
    jsxKey: 'letterSpacing',
    jsxValueLiteral: "'normal'",
    expectReported: false,
  },
  {
    cssProperty: 'letter-spacing',
    cssValue: '0.5px',
    jsxKey: 'letterSpacing',
    jsxValueLiteral: "'0.5px'",
    expectReported: true,
  },
  {
    cssProperty: 'border-radius',
    cssValue: '0',
    jsxKey: 'borderRadius',
    jsxValueLiteral: '0',
    expectReported: false,
  },
  {
    cssProperty: 'border-radius',
    cssValue: '8px',
    jsxKey: 'borderRadius',
    jsxValueLiteral: '8',
    expectReported: true,
  },
  {
    cssProperty: 'transition-duration',
    cssValue: '0ms',
    jsxKey: 'transitionDuration',
    jsxValueLiteral: "'0ms'",
    expectReported: false,
  },
  {
    cssProperty: 'transition-duration',
    cssValue: '300ms',
    jsxKey: 'transitionDuration',
    jsxValueLiteral: "'300ms'",
    expectReported: true,
  },
  {
    cssProperty: 'gap',
    cssValue: 'normal',
    jsxKey: 'gap',
    jsxValueLiteral: "'normal'",
    expectReported: false,
  },
  { cssProperty: 'gap', cssValue: '0', jsxKey: 'gap', jsxValueLiteral: '0', expectReported: false },
  {
    cssProperty: 'gap',
    cssValue: '16px',
    jsxKey: 'gap',
    jsxValueLiteral: '16',
    expectReported: true,
  },
  {
    cssProperty: 'padding',
    cssValue: '0',
    jsxKey: 'padding',
    jsxValueLiteral: '0',
    expectReported: false,
  },
  {
    cssProperty: 'padding',
    cssValue: '16px',
    jsxKey: 'padding',
    jsxValueLiteral: '16',
    expectReported: true,
  },
  {
    cssProperty: 'margin',
    cssValue: '0 auto',
    jsxKey: 'margin',
    jsxValueLiteral: "'0 auto'",
    expectReported: false,
  },
  {
    cssProperty: 'margin',
    cssValue: '10px auto',
    jsxKey: 'margin',
    jsxValueLiteral: "'10px auto'",
    expectReported: true,
  },
  {
    cssProperty: 'z-index',
    cssValue: 'auto',
    jsxKey: 'zIndex',
    jsxValueLiteral: "'auto'",
    expectReported: false,
  },
  {
    cssProperty: 'z-index',
    cssValue: '999',
    jsxKey: 'zIndex',
    jsxValueLiteral: '999',
    expectReported: true,
  },
  {
    cssProperty: 'opacity',
    cssValue: '1',
    jsxKey: 'opacity',
    jsxValueLiteral: '1',
    expectReported: false,
  },
  {
    cssProperty: 'opacity',
    cssValue: '0.5',
    jsxKey: 'opacity',
    jsxValueLiteral: '0.5',
    expectReported: true,
  },
  {
    cssProperty: 'box-shadow',
    cssValue: 'none',
    jsxKey: 'boxShadow',
    jsxValueLiteral: "'none'",
    expectReported: false,
  },
  {
    cssProperty: 'box-shadow',
    cssValue: '0 1px 2px black',
    jsxKey: 'boxShadow',
    jsxValueLiteral: "'0 1px 2px black'",
    expectReported: true,
  },
  {
    cssProperty: '-webkit-text-fill-color',
    cssValue: 'red',
    jsxKey: 'WebkitTextFillColor',
    jsxValueLiteral: "'red'",
    expectReported: true,
  },
  {
    cssProperty: 'padding',
    cssValue: 'calc(var(--x) * 2)',
    jsxKey: 'padding',
    jsxValueLiteral: "'calc(var(--x) * 2)'",
    expectReported: false,
  },
  {
    cssProperty: 'margin',
    cssValue: '-8px',
    jsxKey: 'margin',
    jsxValueLiteral: '-8',
    expectReported: true,
  },
  {
    cssProperty: 'color',
    cssValue: 'Canvas',
    jsxKey: 'color',
    jsxValueLiteral: "'Canvas'",
    expectReported: false,
  },
  {
    cssProperty: 'color',
    cssValue: 'ActiveBorder',
    jsxKey: 'color',
    jsxValueLiteral: "'ActiveBorder'",
    expectReported: true,
  },
]

/**
 * The stated limits where the two tools deliberately disagree, each naming the one tool that
 * reports it. A shorthand that is not itself on the checked property list passes the eslint rule
 * while stylelint's own config reports it (the expansion lives inside that plugin, which this
 * package does not depend on). A string that is not a valid value for its property (a number with
 * no unit, an empty string) is reported by the eslint rule while stylelint passes the same text:
 * the browser drops such a declaration, and the rule reports it rather than parse each property's
 * grammar. Neither is a bug the loop above should catch, so each runs as its own assertion rather
 * than through `CASES`.
 */
const DOCUMENTED_DIVERGENCES = [
  {
    cssProperty: 'background',
    cssValue: 'red',
    jsxKey: 'background',
    jsxValueLiteral: "'red'",
    reportedBy: 'stylelint',
  },
  {
    cssProperty: 'border',
    cssValue: '1px solid red',
    jsxKey: 'border',
    jsxValueLiteral: "'1px solid red'",
    reportedBy: 'stylelint',
  },
  {
    cssProperty: 'padding',
    cssValue: '13',
    jsxKey: 'padding',
    jsxValueLiteral: "'13'",
    reportedBy: 'eslint-plugin',
  },
  {
    cssProperty: 'padding',
    cssValue: '',
    jsxKey: 'padding',
    jsxValueLiteral: "''",
    reportedBy: 'eslint-plugin',
  },
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

describe('AC-27: a documented divergence, reported by one tool only', () => {
  for (const testCase of DOCUMENTED_DIVERGENCES) {
    test(`${testCase.jsxKey}: ${testCase.jsxValueLiteral} (reported by ${testCase.reportedBy} only)`, async () => {
      const fromStylelint = await stylelintReports(testCase.cssProperty, testCase.cssValue)
      const fromEslint = eslintReports(testCase.jsxKey, testCase.jsxValueLiteral)
      assert.equal(fromStylelint, testCase.reportedBy === 'stylelint', 'stylelint verdict')
      assert.equal(fromEslint, testCase.reportedBy === 'eslint-plugin', 'eslint-plugin verdict')
    })
  }
})

const COLOR_PROPERTY_PATTERN =
  '/^(?:color|(?!accent-color$|caret-color$|scrollbar-color$|border-(top-|right-|bottom-|left-)?color$)[a-z-]+-color)$/'

/**
 * Builds a standalone copy of the style rule and its generated data, in an OS temp directory
 * with the plugin package's `node_modules` linked into it (so the copy's own
 * `import 'postcss-value-parser'` resolves, and an interrupted run leaves nothing inside the
 * package), with one admitted keyword removed from a listed property's
 * pattern. Returns an `eslintReports`-shaped function bound to that mutated copy, and a `cleanup`
 * to remove the temp directory.
 */
function mutatedEslintRule(propertyPattern, keywordToRemove) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-parity-mutant-'))
  symlinkSync(
    path.join(REPO_ROOT, 'packages/eslint-plugin/node_modules'),
    path.join(dir, 'node_modules'),
    'dir',
  )
  mkdirSync(path.join(dir, 'rules'))
  mkdirSync(path.join(dir, 'generated'))
  writeFileSync(
    path.join(dir, 'rules', 'style-values.ts'),
    readFileSync(path.join(REPO_ROOT, 'packages/eslint-plugin/src/rules/style-values.ts')),
  )
  writeFileSync(
    path.join(dir, 'style-rule-data.ts'),
    readFileSync(path.join(REPO_ROOT, 'packages/eslint-plugin/src/style-rule-data.ts')),
  )
  const recorded = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, 'packages/eslint-plugin/src/generated/style-properties.recorded.json'),
      'utf8',
    ),
  )
  const original = recorded.ignoreValues[propertyPattern]
  const mutated = original.replace(`${keywordToRemove}|`, '')
  if (mutated === original) throw new Error(`fixture did not find "${keywordToRemove}|" to remove`)
  recorded.ignoreValues[propertyPattern] = mutated
  writeFileSync(
    path.join(dir, 'generated', 'style-properties.recorded.json'),
    JSON.stringify(recorded),
  )

  return {
    dir,
    async reports(jsxKey, jsxValueLiteral) {
      const { styleValuesRule: mutatedRule } = await import(
        pathToFileURL(path.join(dir, 'rules', 'style-values.ts')).href
      )
      const code = `const el = <div style={{ ${jsxKey}: ${jsxValueLiteral} }} />`
      const messages = linter.verify(code, {
        languageOptions,
        plugins: { '@navecss': { rules: { 'style-values': mutatedRule } } },
        rules: { '@navecss/style-values': 'error' },
      })
      return messages.some((message) => message.ruleId === '@navecss/style-values')
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('AC-27: the positive control, removing an admitted keyword from the eslint copy reds the corpus', async () => {
  const mutant = mutatedEslintRule(COLOR_PROPERTY_PATTERN, 'Canvas')
  try {
    const pluginDir = path.join(REPO_ROOT, 'packages/eslint-plugin')
    assert.ok(
      path.relative(pluginDir, mutant.dir).startsWith('..'),
      'the mutant copy lives outside the plugin package, so an interrupted run leaves nothing there',
    )
    assert.deepEqual(
      readdirSync(pluginDir).filter((name) => name.startsWith('.parity-mutant-')),
      [],
    )
    const disagreements = []
    for (const testCase of CASES) {
      const fromStylelint = await stylelintReports(testCase.cssProperty, testCase.cssValue)
      const fromMutatedEslint = await mutant.reports(testCase.jsxKey, testCase.jsxValueLiteral)
      if (fromMutatedEslint !== fromStylelint) {
        disagreements.push(`${testCase.cssProperty}: ${testCase.cssValue}`)
      }
    }
    assert.deepEqual(
      disagreements,
      ['color: Canvas'],
      'the corpus, run against the mutated copy, sees the planted divergence and only it',
    )
  } finally {
    mutant.cleanup()
  }
})
