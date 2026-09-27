/**
 * AC-eslint-plugin-09 covers: R5, R7.
 */
import { RuleTester } from 'eslint'
import { describe } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const { parser: tsParser } = await import('typescript-eslint')

const tsLanguageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parser: tsParser,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const PREAMBLE = `
import { cx } from '@navecss/core/cx'
import { cx as ncx } from '@navecss/core/cx'
import { IMPORTED } from './constants'
const LEGACY = 'legacy-card'
const A = 'legacy-card'
const B = A
let L = 'legacy-card'
`

const settings = { '@navecss': { allow: ['app-'] } }

function jsx(expr: string): string {
  return `${PREAMBLE}\nconst el = <div className=${expr} />`
}

const ruleTester = new RuleTester()

describe('AC-09: literal-piece reading rows', () => {
  const valid: { code: string }[] = [
    { code: jsx('{className}') },
    { code: jsx('{props.className}') },
    { code: jsx('"app-shell"') },
    { code: jsx('{`app-btn--${size}`}') },
    { code: jsx('{`${cx("flex")} ${styles.root}`}') },
    { code: jsx('{`   ${cx("flex")}\n  ${styles.root}  `}') },
    { code: jsx('{B}') },
    { code: jsx('{L}') },
    { code: jsx('{IMPORTED}') },
    { code: jsx('{`${styles.root}--wide`}') },
    { code: jsx('{styles[size]}') },
    { code: jsx('{getClass()}') },
    { code: `${PREAMBLE}\nconst el = <div className />` },
    { code: `${PREAMBLE}\nconst el = <div {...props} />` },
    { code: `${PREAMBLE}\nconst el = <ClassNames classNames={{ root: 'legacy-card' }} />` },
  ]

  const invalid: { code: string }[] = [
    { code: jsx('"legacy-card"') },
    { code: jsx("{'legacy-card'}") },
    { code: `${PREAMBLE}\nconst el = <div class="legacy-card" />` },
    { code: `${PREAMBLE}\nconst el = <Card className="legacy-card" />` },
    { code: jsx('{on ? "is-on" : styles.off}') },
    { code: jsx('{on ? styles.off : "is-on"}') },
    { code: jsx('{styles.a ?? "fallback"}') },
    { code: jsx("{'fallback' || styles.a}") },
    { code: jsx("{'a ' + styles.b}") },
    { code: jsx('{`${cx("flex")} legacy-card`}') },
    { code: jsx('{`btn--${size}`}') },
    { code: jsx('{LEGACY}') },
  ]

  for (const testCase of valid) {
    describe(`passes: ${testCase.code.split('\n').at(-1)}`, () => {
      ruleTester.run('class-channel', classChannelRule, {
        valid: [{ ...testCase, languageOptions, settings }],
        invalid: [],
      })
    })
  }

  for (const testCase of invalid) {
    describe(`reports: ${testCase.code.split('\n').at(-1)}`, () => {
      ruleTester.run('class-channel', classChannelRule, {
        valid: [],
        invalid: [{ ...testCase, languageOptions, settings, errors: 1 }],
      })
    })
  }

  describe('TypeScript-only rows: as/satisfies/! wrappers report', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: jsx("{'legacy-card' as string}"),
          languageOptions: tsLanguageOptions,
          settings,
          errors: 1,
        },
        {
          code: jsx("{'legacy-card' satisfies string}"),
          languageOptions: tsLanguageOptions,
          settings,
          errors: 1,
        },
        {
          code: jsx('{LEGACY!}'),
          languageOptions: tsLanguageOptions,
          settings,
          errors: 1,
        },
      ],
    })
  })

  describe('adjacent string literals joined by + with no whitespace between them form one class, reported once', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [{ code: jsx("{'app-' + 'card'}"), languageOptions, settings }],
      invalid: [
        {
          code: jsx("{'legacy' + '-card'}"),
          languageOptions,
          settings,
          errors: [{ message: /^"legacy-card" is not a CSS Module class/ }],
        },
        {
          code: jsx("{'a ' + 'legacy' + '-card'}"),
          languageOptions,
          settings,
          // Each piece is reported at the literal it starts in: "legacy-card" at 'legacy'.
          errors: [
            { message: /^"a" is not/, column: 28 },
            { message: /^"legacy-card" is not/, column: 35 },
          ],
        },
      ],
    })
  })

  describe('a string + chain reads like a template: other operands are slots, a piece running into one is a truncation', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        { code: jsx("{styles.root + '--wide'}"), languageOptions, settings },
        {
          code: jsx("{'card-' + size}"),
          languageOptions,
          settings: { '@navecss': { allow: ['card-'] } },
        },
      ],
      invalid: [
        {
          code: jsx("{'card-' + size}"),
          languageOptions,
          settings: { '@navecss': { allow: ['/^card-$/u'] } },
          errors: [{ message: /^"card-" is not/ }],
        },
        {
          code: jsx("{'legacy' + x + '-card'}"),
          languageOptions,
          settings,
          errors: [{ message: /^"legacy" is not/ }],
        },
      ],
    })
  })

  describe('inside Nave cx(), a chain of string literals is one whole name; one with any other operand is not', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [{ code: jsx("{cx('fl' + 'ex')}"), languageOptions, settings }],
      invalid: [
        {
          code: jsx("{cx('fl' + x)}"),
          languageOptions,
          settings,
          errors: [{ message: /^cx\('fl' \+ x\) is not a Nave atom/ }],
        },
      ],
    })
  })

  describe('cx.raw literal passes rule 1 (rule 2 applies separately)', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        { code: jsx("{cx.raw('legacy-card')}"), languageOptions, settings },
        { code: jsx("{ncx.raw('legacy-card')}"), languageOptions, settings },
      ],
      invalid: [],
    })
  })
})
