/**
 * AC-eslint-plugin-26 covers: R5b, R4.
 */
import { RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'

import { styleValuesRule } from '../src/rules/style-values.ts'
import { cssPropertyName } from '../src/style-rule-data.ts'

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

  it('reports a number literal written with a unary - or +, comparing the signed value', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [],
      invalid: [
        { code: jsxStyle('{ margin: -8 }'), languageOptions, errors: 1 },
        { code: jsxStyle('{ zIndex: -1 }'), languageOptions, errors: 1 },
        { code: jsxStyle('{ padding: +13 }'), languageOptions, errors: 1 },
      ],
    })
  })

  it('passes a negative number the property already admits', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [{ code: jsxStyle('{ margin: -1 }'), languageOptions }],
      invalid: [],
    })
  })

  it('quotes the declaration as written in the source, not the rendered comparison value', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [],
      invalid: [
        {
          code: jsxStyle('{ padding: 13 }'),
          languageOptions,
          errors: [
            {
              message:
                '"padding: 13" is a literal value on a property this design system tokenizes. Move the declaration to the component\'s CSS with a var(--nave-*) value, or set a custom property inline and read it in CSS.',
            },
          ],
        },
        {
          code: jsxStyle("{ color: 'red' }"),
          languageOptions,
          errors: [{ message: /^"color: 'red'" is a literal value/ }],
        },
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
        { code: jsxStyle("{ '--brand-color': 'red' }"), languageOptions },
      ],
      invalid: [],
    })
  })

  it('passes a shorthand that is not itself on the checked list, even though stylelint reports it', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [
        { code: jsxStyle("{ background: 'red' }"), languageOptions },
        { code: jsxStyle("{ border: '1px solid red' }"), languageOptions },
        { code: jsxStyle("{ borderTop: '1px solid red' }"), languageOptions },
        { code: jsxStyle("{ font: '13px Arial' }"), languageOptions },
        { code: jsxStyle("{ transition: 'opacity 300ms' }"), languageOptions },
        { code: jsxStyle("{ animation: 'spin 2s linear' }"), languageOptions },
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

  it('never reports outline/outlineStyle/outlineWidth/outlineOffset, but checks outlineColor', () => {
    ruleTester.run('style-values', styleValuesRule, {
      valid: [
        { code: jsxStyle("{ outline: 'none' }"), languageOptions },
        { code: jsxStyle('{ outline: 0 }'), languageOptions },
        { code: jsxStyle("{ outlineStyle: 'none' }"), languageOptions },
        { code: jsxStyle('{ outlineWidth: 0 }'), languageOptions },
        { code: jsxStyle('{ outlineOffset: 0 }'), languageOptions },
      ],
      invalid: [{ code: jsxStyle("{ outlineColor: 'red' }"), languageOptions, errors: 1 }],
    })
  })
})

describe('cssPropertyName', () => {
  it('maps an ms-prefixed vendor key to a leading -ms-, like the other vendor prefixes', () => {
    expect(cssPropertyName('msTransitionDuration')).toBe('-ms-transition-duration')
  })

  it('leaves an ordinary camelCase key alone, kebab-cased with no leading dash', () => {
    expect(cssPropertyName('paddingTop')).toBe('padding-top')
  })
})
