/**
 * AC-eslint-plugin-15 covers: R6, R8, R9.
 *
 * One declaration read by every rule, through the real plugin object and flat config, plus
 * rows pinning properties the other suites leave unasserted: truncation against a pattern,
 * the exact atom a `nave-` class names, remedy order and declared-entry rendering, malformed
 * entries inside the array, an inert misplaced marker, and a `cx()` argument through a hop.
 */
import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import plugin from '../src/index.ts'

const jsx = { parserOptions: { ecmaFeatures: { jsx: true } } }
const PRELUDE = `import { cx } from '@navecss/core/cx'\n`

function lint(
  code: string,
  configs: Linter.Config[],
  filename = 'src/f.jsx',
): Linter.LintMessage[] {
  return new Linter({ configType: 'flat' }).verify(
    code,
    [{ files: ['**/*.jsx'], languageOptions: jsx }, ...configs],
    { filename },
  )
}
const ids = (messages: Linter.LintMessage[]): (null | string)[] => messages.map((m) => m.ruleId)
const AC15 = `${PRELUDE}const a = <div className="app-card" />\nconst k = cx.raw('app-card')`
const allRulesOn = (key: string): Linter.Config => ({
  plugins: { [key]: plugin },
  rules: {
    [`${key}/class-channel`]: 'error',
    [`${key}/raw-reason`]: 'error',
    [`${key}/count-escapes`]: 'error',
  },
})

describe('AC-15: one declaration, read by every rule', () => {
  it('recommended + count at error: app-card gets no report from any rule', () => {
    const out = lint(AC15, [
      plugin.configs!.recommended as Linter.Config,
      {
        rules: { '@navecss/count-escapes': 'error' },
        settings: { '@navecss': { allow: ['app-'] } },
      },
    ])
    expect(out).toEqual([])
  })
  it('a control: with nothing declared all three rules report', () => {
    const reports = lint(AC15, [allRulesOn('@navecss')])
    expect(ids(reports)).toEqual([
      '@navecss/class-channel',
      '@navecss/raw-reason',
      '@navecss/count-escapes',
    ])
  })
  it("settings['@navecss'] is read when the plugin is registered under nv", () => {
    expect(
      lint(AC15, [allRulesOn('nv'), { settings: { '@navecss': { allow: ['app-'] } } }]),
    ).toEqual([])
    expect(lint(AC15, [allRulesOn('nv'), { settings: { nv: { allow: ['app-'] } } }]).length).toBe(3)
  })
  it.each(['class-channel', 'raw-reason', 'count-escapes'])(
    'an option object on %s fails the run as a configuration error',
    (rule) => {
      expect(() =>
        lint(AC15, [
          {
            plugins: { '@navecss': plugin },
            rules: { [`@navecss/${rule}`]: ['error', { allow: ['app-'] }] },
          },
        ]),
      ).toThrow(/Configuration for rule|Key "rules"/)
    },
  )
  it('{ max: 5 } on the counting rule is a configuration error (AC-17)', () => {
    expect(() =>
      lint(AC15, [
        {
          plugins: { '@navecss': plugin },
          rules: { '@navecss/count-escapes': ['error', { max: 5 }] },
        },
      ]),
    ).toThrow()
  })
  it('a later entry setting allow replaces the array; one setting only helpers keeps it; files scopes it', () => {
    const base = [allRulesOn('@navecss'), { settings: { '@navecss': { allow: ['app-'] } } }]
    expect(
      ids(lint(AC15, [...base, { settings: { '@navecss': { allow: ['legacy-'] } } }])),
    ).toContain('@navecss/class-channel')
    expect(lint(AC15, [...base, { settings: { '@navecss': { helpers: ['cn'] } } }])).toEqual([])
    const scoped = [...base, { files: ['other/**'], settings: { '@navecss': { allow: ['leg-'] } } }]
    const legacy = 'const a = <div className="leg-card" />'
    expect(lint(legacy, scoped, 'other/f.jsx')).toEqual([])
    expect(lint(legacy, scoped, 'src/f.jsx').length).toBe(1)
  })
})

const withSettings = (settings: object = {}): Linter.Config[] => [
  allRulesOn('@navecss'),
  { settings: { '@navecss': settings } },
]

const msg = (code: string, settings: object = {}): string[] =>
  lint(code, withSettings(settings)).map((m) => m.message)

describe('pins for properties the rule suites leave unasserted', () => {
  it('a truncated piece is not admitted by a pattern that matches its text', () => {
    expect(
      msg('const a = <div className={`card--${size}`} />', { allow: ['/^card--/u'] }),
    ).toHaveLength(1)
  })
  it('nave- output names the atom, not merely the class', () => {
    expect(msg('const a = <div className="nave-flex-shrink0" />')[0]).toContain(
      "@nave flexShrink0 or cx('flexShrink0')",
    )
  })
  it('remedies in order and declared entries rendered (AC-08)', () => {
    const [m] = msg('const a = <div className="legacy-card" />', { allow: ['app-', '/^u-/u'] })
    const order = ['styles.', 'cx(', 'the project declares as its own', 'cx.raw(']
    const positions = order.map((s) => m!.indexOf(s))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions.toSorted((a, b) => a - b)).toEqual(positions)
    expect(m).toContain('declared: prefix app-, pattern /^u-/u')
  })
  it.each(['/^app-/g', '/^app-/y', '/[/', '//', '/^app-/q', '/^[a-z-]+$/v', ''])(
    'allow entry %j (inside an array) fails naming the entry',
    (entry) => {
      expect(() => msg('const a = <div className="app-shell" />', { allow: [entry] })).toThrow(
        entry === '' ? /""/ : entry,
      )
    },
  )
  it('a misplaced marker on a call needing no reason is inert', () => {
    expect(msg(`${PRELUDE}const k = /* nave-escape: x */ cx.raw(s.a)`)).toEqual([])
  })
  it('a cx() argument is read through one const hop', () => {
    expect(
      msg(`${PRELUDE}const N = 'legacy-card'\nconst a = <div className={cx(N)} />`),
    ).toHaveLength(1)
  })
})
