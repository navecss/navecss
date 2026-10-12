/**
 * AC-eslint-plugin-28 covers: R5, R4.
 * AC-eslint-plugin-29 covers: R9, R10, R8, R4.
 *
 * `cx.dynamic()` is read by the class channel the way `cx()` is, and counted by the counting
 * rule on every call. The rules read the source (R3), so none of this loads the installed core.
 */
import { Linter } from 'eslint'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'
import { countEscapesRule } from '../src/rules/count-escapes.ts'
import { rawReasonRule } from '../src/rules/raw-reason.ts'

const { parser: tsParser } = await import('typescript-eslint')

const plugin = {
  rules: {
    'class-channel': classChannelRule,
    'raw-reason': rawReasonRule,
    'count-escapes': countEscapesRule,
  },
}

type Parser = 'espree' | 'typescript'

interface Report {
  column: number
  line: number
  message: string
  messageId: string | undefined
  ruleId: string
}

const defaultLinter = new Linter()

/**
 * Lints `code` with the three rules at `error`. A parse error throws: a fixture that does not
 * parse reports nothing, and would pass every "is not reported" row for the wrong reason.
 */
function lint(
  code: string,
  options: {
    filename?: string
    linter?: Linter
    parser?: Parser
    settings?: Record<string, unknown>
  } = {},
): Report[] {
  const {
    linter = defaultLinter,
    parser = 'espree',
    settings = { '@navecss': { allow: ['app-'] } },
  } = options
  const filename = options.filename ?? (parser === 'typescript' ? 'file.tsx' : 'file.jsx')
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
          ecmaVersion: 2024,
          sourceType: 'module',
          ...(parser === 'typescript' && { parser: tsParser }),
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        settings,
        plugins: { '@navecss': plugin },
        rules: {
          '@navecss/class-channel': 'error',
          '@navecss/raw-reason': 'error',
          '@navecss/count-escapes': 'error',
        },
      },
    ],
    filename,
  )
  const fatal = messages.find((message) => message.ruleId === null)
  if (fatal) throw new Error(`fixture did not lint: ${fatal.message}\n${code}`)
  return messages.map(({ column, line, message, messageId, ruleId }) => ({
    column,
    line,
    message,
    messageId,
    ruleId: ruleId ?? '',
  }))
}

const rule1 = (reports: Report[]): Report[] =>
  reports.filter((report) => report.ruleId === '@navecss/class-channel')
const counted = (reports: Report[]): Report[] =>
  reports.filter((report) => report.ruleId === '@navecss/count-escapes')

const PRELUDE = [
  "import { cx } from '@navecss/core/cx'",
  "import { cx as ncx } from '@navecss/core/cx'",
  "import * as N from '@navecss/core/cx'",
  "import clsx from 'clsx'",
  "const LEGACY = 'legacy-card'",
  "const ATOM = 'flex'",
  'type AtomName = string',
].join('\n')

/**
 * `cx.dynamic(...)` through a `className` is read by rule 1: every row below is run under both
 * parsers (`type AtomName` is TypeScript only, so a plain parse of the prelude drops it).
 */
const PARSERS: Parser[] = ['espree', 'typescript']

function preludeFor(parser: Parser): string {
  return parser === 'typescript' ? PRELUDE : PRELUDE.replace('type AtomName = string', '')
}

function rule1Reports(value: string, parser: Parser): Report[] {
  const code = `${preludeFor(parser)}\nconst el = <div className={${value}} />`
  return rule1(lint(code, { parser }))
}

/**
Rule 1's reports, and the counting rule's, for `tail` written after the prelude.
 */
const rule1After = (tail: string, parser: Parser): Report[] =>
  rule1(lint(`${preludeFor(parser)}\n${tail}`, { parser }))
const countedAfter = (tail: string, parser: Parser): Report[] =>
  counted(lint(`${preludeFor(parser)}\n${tail}`, { parser }))
const countedMessage = (call: string, parser: Parser): string =>
  countedAfter(`const t = ${call}`, parser)[0]!.message

describe.each(PARSERS)('AC-28: rule 1 reads cx.dynamic() (%s)', (parser) => {
  const pass = [
    'cx.dynamic(tone)',
    'cx.dynamic(props.tone)',
    "`${cx('interactive')} ${cx.dynamic(tone)}`",
    "cx.dynamic('flex')",
    'cx.dynamic(ATOM)',
    "cx.dynamic(on ? 'flex' : 'grid')",
    "cx.dynamic(on && 'focusRing')",
    'cx.dynamic(null)',
    'cx.dynamic(undefined)',
    'cx.dynamic(false)',
  ]
  it.each(pass)('%s passes', (value) => {
    expect(rule1Reports(value, parser)).toEqual([])
  })

  const reportedLegacy = [
    "cx.dynamic('legacy-card')",
    "ncx.dynamic('legacy-card')",
    "N.cx.dynamic('legacy-card')",
    "`${cx.dynamic('legacy-card')}`",
    "cx.dynamic(on ? 'flex' : 'legacy-card')",
    "cx.dynamic(on && 'legacy-card')",
    'cx.dynamic(LEGACY)',
    "clsx(styles.root, cx.dynamic('legacy-card'))",
    "cx['dynamic']('legacy-card')",
    "cx[`dynamic`]('legacy-card')",
  ]
  it.each(reportedLegacy)('%s is reported once, naming legacy-card', (value) => {
    const reports = rule1Reports(value, parser)
    expect(reports).toHaveLength(1)
    expect(reports[0]!.message).toContain('legacy-card')
  })

  it("cx.dynamic('legacy-card' as AtomName) is reported once, naming legacy-card", () => {
    if (parser === 'espree') return
    const reports = rule1Reports("cx.dynamic('legacy-card' as AtomName)", parser)
    expect(reports).toHaveLength(1)
    expect(reports[0]!.message).toContain('legacy-card')
  })

  it.each(["cx.dynamic('app-card')", "cx.dynamic('textPrimary')", "cx.dynamic('toString')"])(
    '%s is reported, naming the string (a declared entry does not admit it)',
    (value) => {
      const reports = rule1Reports(value, parser)
      expect(reports).toHaveLength(1)
      const quoted = /'([^']+)'/u.exec(value)![1]!
      expect(reports[0]!.message).toContain(quoted)
    },
  )

  it("prints the callee as the file wrote it and lists the remedies in cx()'s order", () => {
    const [aliased] = rule1Reports("ncx.dynamic('legacy-card')", parser)
    expect(aliased!.message).toContain("ncx.dynamic('legacy-card') is not a Nave atom")
    expect(aliased!.message).toContain('a string passed to ncx.dynamic() must name one')
    const [namespaced] = rule1Reports("N.cx.dynamic('legacy-card')", parser)
    expect(namespaced!.message).toContain("N.cx.dynamic('legacy-card') is not a Nave atom")
    const order = [
      'CSS Module class',
      'Nave atom through cx()',
      'declares as its own',
      'with a reason',
    ]
    const positions = order.map((phrase) => aliased!.message.indexOf(phrase))
    expect(positions.every((position) => position > -1)).toBe(true)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
  })

  it.each([
    "const el = <div className={x.dynamic('legacy-card')} />",
    "import cx from 'classnames'\nconst el = <div className={cx.dynamic('legacy-card')} />",
    "import { cx } from '@navecss/core/cx'\nfunction f(cx) { return <div className={cx.dynamic('legacy-card')} /> }",
    "import { cx } from '@navecss/core/cx'\nfunction f() { const cx = cn; return <div className={cx.dynamic('legacy-card')} /> }",
  ])("a cx.dynamic that is not Nave's passes: %s", (code) => {
    expect(rule1(lint(code, { parser }))).toEqual([])
  })

  describe('the forms cx.raw is reached in (ask 1)', () => {
    const forms = [
      "const d = cx.dynamic\nconst el = <div className={d('legacy-card')} />",
      "const { dynamic } = cx\nconst el = <div className={dynamic('legacy-card')} />",
      "const { dynamic: dyn } = cx\nconst el = <div className={dyn('legacy-card')} />",
      "const d = ncx.dynamic\nconst el = <div className={d('legacy-card')} />",
    ]
    it.each(forms)('is reported: %s', (tail) => {
      const reports = rule1(lint(`${preludeFor(parser)}\n${tail}`, { parser }))
      expect(reports).toHaveLength(1)
      expect(reports[0]!.message).toContain('legacy-card')
    })

    it('a second hop is not followed', () => {
      const tail =
        "const d = cx.dynamic\nconst d2 = d\nconst el = <div className={d2('legacy-card')} />"
      expect(rule1After(tail, parser)).toEqual([])
    })

    it('a let alias is not read, as it is for cx.raw', () => {
      const tail = "let d = cx.dynamic\nconst el = <div className={d('legacy-card')} />"
      expect(rule1After(tail, parser)).toEqual([])
    })
  })

  describe('cx.dynamic(<arg>) gets the reports cx(<arg>) gets, with the callee swapped', () => {
    const args = [
      "'flex'",
      "'legacy-card'",
      "'card'",
      "'app-card'",
      "'toString'",
      "'constructor'",
      "'flex', 'legacy-card'",
      'name',
      "['flex']",
      '{ flex: on }',
      '`legacy-card`',
      '`flex ${x}`',
      "'nave-flex'",
      "'nave-banana-split'",
      "'flex' + 'x'",
      "'a' + b",
      "on ? 'flex' : 'legacy-card'",
      "on && 'legacy-card'",
      "on || 'legacy-card'",
      "'flex block'",
      'LEGACY',
      'ATOM',
      "cx('legacy-card')",
      "clsx('flex')",
      "tone ?? 'legacy-card'",
    ]
    const callees = [
      { plain: 'cx', dynamic: 'cx.dynamic' },
      { plain: 'ncx', dynamic: 'ncx.dynamic' },
      { plain: 'N.cx', dynamic: 'N.cx.dynamic' },
    ]
    const cases = callees.flatMap((callee) => args.map((arg) => ({ ...callee, arg })))

    it.each(cases)('$dynamic($arg)', ({ plain, dynamic, arg }) => {
      const expected = rule1Reports(`${plain}(${arg})`, parser)
      const actual = rule1Reports(`${dynamic}(${arg})`, parser)
      expect(actual.map((report) => report.message.replaceAll(dynamic, () => plain))).toEqual(
        expected.map((report) => report.message),
      )
      expect(actual.map(({ line }) => line)).toEqual(expected.map(({ line }) => line))
    })

    it('the comparison is not vacuous: most of the argument rows are reported', () => {
      const reportedRows = args.filter(
        (arg) => rule1Reports(`cx.dynamic(${arg})`, parser).length > 0,
      )
      expect(reportedRows.length).toBeGreaterThan(args.length / 2)
    })
  })
})

describe('AC-28: a cxModules wrapper re-exporting cx', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-eslint-plugin-dynamic-'))
  const root = realpathSync(scratch)
  mkdirSync(path.join(root, 'src/ui'), { recursive: true })
  mkdirSync(path.join(root, 'src/a'), { recursive: true })
  writeFileSync(path.join(root, 'src/ui/cx.js'), "export { cx } from '@navecss/core/cx'\n")

  const settings = { '@navecss': { cxModules: ['./src/ui/cx.js'], allow: ['app-'] } }
  const linter = new Linter({ cwd: root })

  function withRootCwd<T>(run: () => T): T {
    const before = process.cwd()
    process.chdir(root)
    try {
      return run()
    } finally {
      process.chdir(before)
    }
  }

  it("cx.dynamic('legacy-card') through a cx imported as '../ui/cx.js' is reported, naming legacy-card", () => {
    const code =
      "import { cx } from '../ui/cx.js'\nconst el = <div className={cx.dynamic('legacy-card')} />"
    const reports = withRootCwd(() =>
      rule1(lint(code, { linter, settings, filename: path.join(root, 'src/a/x.jsx') })),
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]!.message).toContain('legacy-card')
  })

  it('and is counted, through the same wrapper', () => {
    const code = "import { cx } from '../ui/cx.js'\nconst k = cx.dynamic(tone)"
    const reports = withRootCwd(() =>
      counted(lint(code, { linter, settings, filename: path.join(root, 'src/a/x.jsx') })),
    )
    expect(reports).toHaveLength(1)
  })
})

describe('AC-28: the verdicts do not depend on the installed core', () => {
  it("no class-channel or counting module reads core's cx module at lint time", async () => {
    const { readFileSync } = await import('node:fs')
    const sources = [
      'src/cx-binding.ts',
      'src/rules/class-channel.ts',
      'src/rules/count-escapes.ts',
    ]
    for (const source of sources) {
      const text = readFileSync(path.resolve(import.meta.dirname, '..', source), 'utf8')
      expect(text, source).not.toMatch(/from\s+['"]@navecss\/core\/cx['"]/u)
      expect(text, source).not.toMatch(/import\(\s*['"]@navecss\/core\/cx['"]/u)
    }
  })
})

describe.each(PARSERS)('AC-29: the counting rule counts cx.dynamic() calls (%s)', (parser) => {
  const countedCalls = [
    'cx.dynamic(tone)',
    "cx.dynamic('flex')",
    "cx.dynamic('legacy-card')",
    'cx.dynamic(null)',
    'cx.dynamic()',
    'ncx.dynamic(tone)',
    'N.cx.dynamic(tone)',
    "cx['dynamic'](tone)",
  ]

  it.each(countedCalls)('%s is counted once, at the call', (call) => {
    const code = `${preludeFor(parser)}\nconst t = ${call}`
    const reports = counted(lint(code, { parser }))
    expect(reports).toHaveLength(1)
    const lineText = code.split('\n').at(-1)!
    expect(reports[0]).toMatchObject({
      messageId: 'dynamicEscape',
      line: code.split('\n').length,
      column: lineText.indexOf(call) + 1,
    })
  })

  it('a cx.dynamic(tone) inside a className template slot is counted once', () => {
    const code = `${preludeFor(parser)}\nconst el = <div className={\`\${cx.dynamic(tone)}\`} />`
    expect(counted(lint(code, { parser }))).toHaveLength(1)
  })

  it('a .ts file with no JSX is counted', () => {
    const code = "import { cx } from '@navecss/core/cx'\nexport const t = cx.dynamic(tone)"
    expect(counted(lint(code, { parser: 'typescript', filename: 'file.ts' }))).toHaveLength(1)
  })

  describe('the forms cx.raw is reached in (ask 1)', () => {
    it.each([
      'const d = cx.dynamic\nd(tone)',
      'const { dynamic } = cx\ndynamic(tone)',
      'const { dynamic: dyn } = cx\ndyn(tone)',
    ])('counts once: %s', (tail) => {
      expect(countedAfter(tail, parser)).toHaveLength(1)
    })

    it('a second hop is not counted', () => {
      const tail = 'const d = cx.dynamic\nconst d2 = d\nd2(tone)'
      expect(countedAfter(tail, parser)).toHaveLength(0)
    })
  })

  it.each([
    ['x.dynamic(tone)', 'a non-Nave x'],
    ["import cx from 'classnames'\ncx.dynamic(tone)", 'a cx from classnames'],
    ["import { cx } from '@navecss/core/cx'\nconst f = cx.dynamic", 'a reference never called'],
  ])('does not count %j (%s)', (code) => {
    expect(counted(lint(code, { parser }))).toHaveLength(0)
  })

  describe('cx.raw(cx.dynamic(...)) is one act (ask 2)', () => {
    it.each(['cx.raw(cx.dynamic(tone))', "cx.raw(cx.dynamic('legacy-card'))"])(
      '%s gets one count, at the inner call, and nothing from rule 2',
      (call) => {
        const code = `${preludeFor(parser)}\nconst t = ${call}`
        const reports = lint(code, { parser })
        const found = counted(reports)
        expect(found).toHaveLength(1)
        expect(found[0]!.messageId).toBe('dynamicEscape')
        expect(found[0]!.column).toBe(code.split('\n').at(-1)!.indexOf('cx.dynamic') + 1)
        expect(reports.filter((report) => report.ruleId === '@navecss/raw-reason')).toEqual([])
      },
    )

    it('a helper between them does not make it two', () => {
      const code = `${preludeFor(parser)}\nconst t = cx.raw(clsx(cx.dynamic('legacy-card')))`
      expect(counted(lint(code, { parser }))).toHaveLength(1)
    })

    it('a counted cx.raw() beside a cx.dynamic() keeps its own count and message', () => {
      const code = `${preludeFor(parser)}\nconst a = cx.raw('legacy-card')\nconst b = cx.dynamic(tone)`
      const found = counted(lint(code, { parser }))
      expect(found.map((report) => report.messageId)).toEqual(['escape', 'dynamicEscape'])
    })
  })

  it('a nave-escape comment changes nothing, and rule 2 reports nothing on any cx.dynamic() call', () => {
    const calls = [
      'cx.dynamic(/* nave-escape: vendor */ tone)',
      "cx.dynamic('legacy-card')",
      "/* nave-escape: vendor */ cx.dynamic('legacy-card')",
    ]
    for (const call of calls) {
      const reports = lint(`${preludeFor(parser)}\nconst t = ${call}`, { parser })
      expect(counted(reports), call).toHaveLength(1)
      expect(
        reports.filter((report) => report.ruleId === '@navecss/raw-reason'),
        call,
      ).toEqual([])
    }
  })

  describe("the report's own message", () => {
    it('prints the callee as the file wrote it', () => {
      expect(countedMessage('cx.dynamic(tone)', parser)).toContain('cx.dynamic()')
      expect(countedMessage('ncx.dynamic(tone)', parser)).toContain('ncx.dynamic()')
      expect(countedMessage('N.cx.dynamic(tone)', parser)).toContain('N.cx.dynamic()')
    })

    it('never asks for a reason, and differs from the cx.raw() message', () => {
      const text = countedMessage('cx.dynamic(tone)', parser)
      expect(text.toLowerCase()).not.toContain('reason')
      expect(text).not.toContain('nave-escape')
      expect(text).not.toBe(countedMessage("cx.raw('legacy-card')", parser))
    })
  })

  it('a bare eslint-disable-line on the line of a cx.dynamic() call leaves it uncounted', () => {
    const code = `${preludeFor(parser)}\nconst t = cx.dynamic(tone) // eslint-disable-line`
    expect(counted(lint(code, { parser }))).toHaveLength(0)
  })
})
