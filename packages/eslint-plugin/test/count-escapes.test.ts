/**
 * AC-eslint-plugin-17 covers: R9.
 */
import { Linter, RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'
import { countEscapesRule } from '../src/rules/count-escapes.ts'
import { rawReasonRule } from '../src/rules/raw-reason.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const ruleTester = new RuleTester()
const settings = { '@navecss': { allow: ['app-'] } }
const PRELUDE = `import { cx } from '@navecss/core/cx'\nimport { cx as ncx } from '@navecss/core/cx'\n`

const escapeMessage = (callee: string): string =>
  `This ${callee}() call carries class text that needs a reason: counted as an escape.`

describe('AC-17: the counting rule', () => {
  it('reports every cx.raw() escape, with or without a reason', () => {
    ruleTester.run('count-escapes', countEscapesRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const el = <div className={cx.raw('legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
        {
          code: `${PRELUDE}const el = <div className={cx.raw(/* nave-escape: x */ 'legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
        {
          code: `${PRELUDE}const el = <div className={ncx.raw('legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
        {
          code: `${PRELUDE}const el = <div className={cx['raw']('legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
        {
          code: `${PRELUDE}const k = cx.raw('legacy-card')`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
        {
          code: `${PRELUDE}import clsx from 'clsx'\nconst k = cx.raw(clsx('legacy-card'))`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
        {
          code: `${PRELUDE}const k = cx.raw(cx('legacy-card'))`,
          languageOptions,
          settings,
          errors: [{ messageId: 'escape' }],
        },
      ],
    })
  })

  it('the escape message prints the callee as the file names it and never calls a declared class undeclared', () => {
    ruleTester.run('count-escapes', countEscapesRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const el = <div className={ncx.raw(/* nave-escape: vendor */ 'legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ message: escapeMessage('ncx.raw') }],
        },
        {
          code: `import * as c from '@navecss/core/cx'\nconst el = <div className={c.cx.raw('legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ message: escapeMessage('c.cx.raw') }],
        },
        {
          code: `${PRELUDE}const el = <div className={cx.raw(cx('app-card'))} />`,
          languageOptions,
          settings,
          errors: [{ message: escapeMessage('cx.raw') }],
        },
      ],
    })
  })

  it('does not report composition or a declared class', () => {
    ruleTester.run('count-escapes', countEscapesRule, {
      valid: [
        {
          code: `${PRELUDE}const el = <div className={cx.raw(isActive && styles.active)} />`,
          languageOptions,
          settings,
        },
        {
          code: `${PRELUDE}const el = <div className={cx.raw(className)} />`,
          languageOptions,
          settings,
        },
        {
          code: `${PRELUDE}const el = <div className={cx.raw(getClass())} />`,
          languageOptions,
          settings,
        },
        {
          code: `${PRELUDE}const el = <div className={cx.raw('app-shell')} />`,
          languageOptions,
          settings,
        },
        { code: `${PRELUDE}const el = <div className={cx.raw()} />`, languageOptions, settings },
        {
          code: `${PRELUDE}import clsx from 'clsx'\nconst k = cx.raw(clsx(styles.a))`,
          languageOptions,
          settings,
        },
        { code: `${PRELUDE}const k = cx.raw(cx('flex'))`, languageOptions, settings },
      ],
      invalid: [],
    })
  })

  const linter = new Linter()
  // All four real rule ids, so a disable comment naming one is not an "unknown rule" error
  // that would otherwise crowd out the count rule's own report in the messages list.
  const fullPlugin = {
    rules: {
      'class-channel': classChannelRule,
      'raw-reason': rawReasonRule,
      'count-escapes': countEscapesRule,
      'style-values': { create: () => ({}) },
    },
  }

  function countReports(
    code: string,
    pluginKey = '@navecss',
    extraConfig: Record<string, unknown> = {},
  ): number {
    const messages = linter.verify(code, {
      languageOptions,
      settings,
      plugins: { [pluginKey]: fullPlugin },
      rules: { [`${pluginKey}/count-escapes`]: 'error' },
      ...extraConfig,
    })
    return messages.filter((message) => message.ruleId === `${pluginKey}/count-escapes`).length
  }

  /**
   * The counting rule's own reports about disable comments, read with inline configuration
   * off: a directive naming no rule (or naming the counting rule) would otherwise suppress the
   * very report it causes, and the question here is what the rule emits, not what ESLint then
   * keeps.
   */
  function rawCommentReports(code: string): { column: number; line: number }[] {
    const messages = linter.verify(code, {
      languageOptions,
      settings,
      plugins: { '@navecss': fullPlugin },
      rules: { '@navecss/count-escapes': 'error' },
      linterOptions: { noInlineConfig: true },
    })
    return messages
      .filter((message) => message.ruleId === '@navecss/count-escapes')
      .map(({ line, column }) => ({ line, column }))
  }

  it.each([
    '// eslint-disable-next-line @navecss/class-channel',
    '/* eslint-disable @navecss/raw-reason */',
    '// eslint-disable-next-line @navecss/style-values',
    '// eslint-disable-line @navecss/class-channel',
    '// eslint-disable-next-line',
    '// eslint-disable-next-line no-console, @navecss/class-channel',
    '// eslint-disable-next-line "@navecss/class-channel"',
    '// eslint-disable-next-line -- vendor markup',
    '// eslint-disable-next-line @navecss/class-channel --- vendor markup',
    '/* eslint-disable\n   @navecss/class-channel */',
    '/* eslint-disable @navecss/class-channel\n   -- vendor markup */',
  ])('reports %j once, at the comment itself', (comment) => {
    expect(rawCommentReports(`const before = 1\n${comment}\nconst x = 1`)).toEqual([
      { line: 2, column: 1 },
    ])
  })

  it('/* eslint-disable -- vendor markup */ is emitted at the comment with inline configuration off, and with it on gives no count report: a description adds no rule list, so the block silences every rule after it, this one included', () => {
    const code = 'const before = 1\n/* eslint-disable -- vendor markup */\nconst x = 1'
    expect(rawCommentReports(code)).toEqual([{ line: 2, column: 1 }])
    expect(countReports(code)).toBe(0)
  })

  it('a description never takes a next-line directive out of the count, with inline config active', () => {
    expect(countReports('// eslint-disable-next-line -- vendor markup\nconst x = 1')).toBe(1)
    expect(
      countReports('// eslint-disable-next-line @navecss/class-channel -- vendor\nconst x = 1'),
    ).toBe(1)
  })

  it.each([
    '// eslint-disable-line',
    '// eslint-disable-line -- vendor markup',
    '// eslint-disable-line @navecss/count-escapes',
  ])(
    'the stated limit: %j on a line holding a counted cx.raw() leaves no count report on that line',
    (comment) => {
      const code = `${PRELUDE}const el = <div className={cx.raw('legacy-card')} /> ${comment}`
      const messages = linter.verify(code, {
        languageOptions,
        settings,
        plugins: { '@navecss': fullPlugin },
        rules: { '@navecss/count-escapes': 'error' },
      })
      expect(messages.filter((message) => message.ruleId === '@navecss/count-escapes')).toEqual([])
    },
  )

  it('matches the plugin\'s own registered prefix, not a literal "@navecss/"', () => {
    expect(
      countReports('// eslint-disable-next-line nv/class-channel\nconst x = 1', 'nv'),
    ).toBeGreaterThanOrEqual(1)
  })

  it('does not report an unrelated disable, or eslint-enable', () => {
    expect(countReports('// eslint-disable-next-line no-console\nconst x = 1')).toBe(0)
    expect(countReports('/* eslint-enable */\nconst x = 1')).toBe(0)
    expect(countReports('/* eslint-enable @navecss/class-channel */\nconst x = 1')).toBe(0)
  })
})
