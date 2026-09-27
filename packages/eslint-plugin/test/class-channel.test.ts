/**
 * AC-eslint-plugin-08, -09, -10, -11, -12, -13, -14 cover: R4, R5, R5a, R6, R7.
 */
import { RuleTester } from 'eslint'
import { describe } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'

const jsxLanguageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const ruleTester = new RuleTester()

describe('rule 1: the class channel', () => {
  ruleTester.run('class-channel', classChannelRule, {
    valid: [
      {
        code: `import { cx } from '@navecss/core/cx'; const x = <div className={cx('flex')} />`,
        languageOptions: jsxLanguageOptions,
      },
      {
        code: `const x = <div className={props.className} />`,
        languageOptions: jsxLanguageOptions,
      },
      {
        code: `const x = <div className="app-shell" />`,
        languageOptions: jsxLanguageOptions,
        settings: { '@navecss': { allow: ['app-'] } },
      },
    ],
    invalid: [
      {
        code: `const x = <div className="legacy-card" />`,
        languageOptions: jsxLanguageOptions,
        errors: 1,
      },
      {
        code: `import { cx } from '@navecss/core/cx'; const x = <div className={cx('legacy-card')} />`,
        languageOptions: jsxLanguageOptions,
        errors: 1,
      },
    ],
  })
})
