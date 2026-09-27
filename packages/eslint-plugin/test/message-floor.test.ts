/**
 * AC-eslint-plugin-07 covers: R4.
 *
 * Every message this package ships is scanned for three floors: (a) no disable comment,
 * suppression command, config edit or settings key offered as a remedy; (b) no path or process
 * of ours, and no third-party product named; (c) no accessibility-consequence vocabulary (R4(g))
 * — a report describes what it flags (an undeclared class, a literal style value), never an
 * accessibility consequence, since this package makes no accessibility claim about any of it.
 * Messages are collected by actually linting representative fixtures (the real rendering path,
 * declared-entries interpolation included), not by scanning source text, so a template and its
 * interpolated data are both checked as shipped.
 */
import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'
import { countEscapesRule } from '../src/rules/count-escapes.ts'
import { rawReasonRule } from '../src/rules/raw-reason.ts'
import { styleValuesRule } from '../src/rules/style-values.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const linter = new Linter()
const plugin = {
  rules: {
    'class-channel': classChannelRule,
    'raw-reason': rawReasonRule,
    'count-escapes': countEscapesRule,
    'style-values': styleValuesRule,
  },
}

function lint(code: string, settings: Record<string, unknown> = {}): string[] {
  const messages = linter.verify(code, {
    languageOptions,
    settings,
    plugins: { '@navecss': plugin },
    rules: {
      '@navecss/class-channel': 'error',
      '@navecss/raw-reason': 'error',
      '@navecss/count-escapes': 'error',
      '@navecss/style-values': 'error',
    },
  })
  return messages
    .filter((message) => message.ruleId?.startsWith('@navecss/'))
    .map((message) => message.message)
}

const PRELUDE = `import { cx } from '@navecss/core/cx'\n`

const FIXTURES: { code: string; settings?: Record<string, unknown> }[] = [
  { code: `${PRELUDE}const el = <div className="legacy-card" />` },
  { code: `${PRELUDE}const el = <div className="nave-flex" />` },
  { code: `${PRELUDE}const el = <div className="nave-banana-split" />` },
  {
    code: `${PRELUDE}const el = <div className="app-card legacy-card" />`,
    settings: { '@navecss': { allow: ['app-'] } },
  },
  { code: `${PRELUDE}const el = <div className={cx('legacy-card')} />` },
  { code: `${PRELUDE}const el = <div className={cond && styles.x} />` },
  { code: 'const el = <div className={`${cond && styles.x}`} />' },
  { code: `${PRELUDE}const el = <div className={cx.raw('legacy-card')} />` },
  {
    code: `${PRELUDE}// eslint-disable-next-line @navecss/class-channel\nconst el = <div className={cx.raw('legacy-card')} />`,
  },
  { code: 'const el = <div style={{ padding: 13, color: "red" }} />' },
]

const collected = FIXTURES.flatMap(({ code, settings }) => lint(code, settings))

describe('AC-07: the message floor', () => {
  it('collected at least one message per fixture row (the premise: something to scan)', () => {
    expect(collected.length).toBeGreaterThanOrEqual(FIXTURES.length)
  })

  const noRemedyWords = [
    'eslint-disable',
    'suppress',
    'eslint-suppressions',
    'eslint.config',
    'settings',
    'allow',
    'cxModules',
    'helpers',
  ]

  it.each(noRemedyWords)('no message offers "%s" as a remedy (R4(c)/R4(d))', (word) => {
    const hits = collected.filter((message) => message.includes(word))
    expect(hits).toEqual([])
  })

  const noInternalWords = [
    'packages/',
    'node_modules',
    'cowork',
    'Tailwind',
    'StyleX',
    'clsx',
    'classnames',
    'Emotion',
    'shadcn',
    'React',
    'Preact',
  ]

  it.each(noInternalWords)(
    'no message names our path/process or a third-party product ("%s")',
    (word) => {
      const hits = collected.filter((message) => message.includes(word))
      expect(hits).toEqual([])
    },
  )

  it('no message contains a bare "#" followed by a digit (a tracker reference)', () => {
    const hits = collected.filter((message) => /#\d/.test(message))
    expect(hits).toEqual([])
  })

  const noAccessibilityWords = [
    'accessib',
    'a11y',
    'WCAG',
    'screen reader',
    'contrast',
    'focus',
    'keyboard',
    'users',
  ]

  it.each(noAccessibilityWords)(
    'no message names an accessibility consequence, case-insensitively ("%s")',
    (word) => {
      const hits = collected.filter((message) => message.toLowerCase().includes(word.toLowerCase()))
      expect(hits).toEqual([])
    },
  )

  it('a planted control catches a violation (proves the scan itself reports)', () => {
    const planted = ['this message offers eslint-disable as a fix', 'reported by React']
    expect(planted.some((message) => message.includes('eslint-disable'))).toBe(true)
    expect(planted.some((message) => message.includes('React'))).toBe(true)
  })
})
