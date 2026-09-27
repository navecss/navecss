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

  it("reports a matching disable comment naming one of this plugin's rules, or naming none", () => {
    const cases = [
      '// eslint-disable-next-line @navecss/class-channel',
      '/* eslint-disable @navecss/raw-reason */',
      '// eslint-disable-next-line @navecss/style-values',
      '// eslint-disable-next-line',
      '// eslint-disable-next-line no-console, @navecss/class-channel',
    ]
    for (const comment of cases) {
      expect(countReports(`${comment}\nconst x = 1`)).toBeGreaterThanOrEqual(1)
    }
  })

  it("reports a bare same-line disable comment too — verified with inline config off, since ESLint's own suppression (a bare eslint-disable-line silences every rule on its own line, this one included) would otherwise hide this rule's report about the very comment that causes it", () => {
    const withInlineConfigActive = countReports('// eslint-disable-line\nconst x = 1')
    expect(withInlineConfigActive, 'suppressed by design — the documented limit, not a bug').toBe(0)

    const withoutSuppression = countReports('// eslint-disable-line\nconst x = 1', '@navecss', {
      linterOptions: { noInlineConfig: true },
    })
    expect(withoutSuppression).toBeGreaterThanOrEqual(1)
  })

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
