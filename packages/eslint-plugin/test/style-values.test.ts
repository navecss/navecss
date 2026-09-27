/**
 * AC-eslint-plugin-26 covers: R5b, R4.
 */
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

import { styleValuesRule } from '../src/rules/style-values.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const ruleTester = new RuleTester()

function jsxStyle(expr: string): string {
  return `const el = <div style={${expr}} />`
}

describe('AC-26: the style rule', () => {
  it('reports literal values on a tokenized property', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [],
      invalid: [
        { code: jsxStyle('{ padding: 13 }'), languageOptions, errors: 1 },
        { code: jsxStyle('{ paddingTop: 13 }'), languageOptions, errors: 1 },
        { code: jsxStyle('{ padding: `13px` }'), languageOptions, errors: 1 },
        { code: jsxStyle("{ padding: '0 13px' }"), languageOptions, errors: 1 },
        { code: jsxStyle("{ color: 'red' }"), languageOptions, errors: 1 },
        { code: jsxStyle('{ lineHeight: 1.5 }'), languageOptions, errors: 1 },
        { code: jsxStyle('{ zIndex: 10 }'), languageOptions, errors: 1 },
        { code: jsxStyle("{ color: 'ActiveBorder' }"), languageOptions, errors: 1 },
      ],
    })
  })

  it('passes lawful values, computed values and out-of-scope properties', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [
        { code: jsxStyle('{ padding: 0 }'), languageOptions },
        { code: jsxStyle('{ opacity: 1 }'), languageOptions },
        { code: jsxStyle("{ margin: '0 auto' }"), languageOptions },
        { code: jsxStyle("{ color: 'var(--nave-color-content-primary)' }"), languageOptions },
        { code: jsxStyle("{ color: 'Canvas' }"), languageOptions },
        { code: jsxStyle("{ backgroundColor: 'transparent' }"), languageOptions },
        { code: jsxStyle('{ width: 13 }'), languageOptions },
        { code: jsxStyle("{ '--w': '13px' }"), languageOptions },
        { code: jsxStyle("{ '--progress': `${pct}%` }"), languageOptions },
        { code: jsxStyle('{ width: `${pct}%` }'), languageOptions },
        { code: jsxStyle('{ padding: size }'), languageOptions },
        { code: 'const el = <div style={styleObject} />', languageOptions },
        { code: jsxStyle('{ ...base, margin: 0 }'), languageOptions },
      ],
      invalid: [],
    })
  })

  it('reports only the offending key in a spread object', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [],
      invalid: [{ code: jsxStyle('{ ...base, padding: 13 }'), languageOptions, errors: 1 }],
    })
  })

  it('never reports outline/outlineStyle/outlineWidth', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [
        { code: jsxStyle("{ outline: 'none' }"), languageOptions },
        { code: jsxStyle('{ outline: 0 }'), languageOptions },
        { code: jsxStyle("{ outlineStyle: 'none' }"), languageOptions },
        { code: jsxStyle('{ outlineWidth: 0 }'), languageOptions },
      ],
      invalid: [],
    })
  })
})
