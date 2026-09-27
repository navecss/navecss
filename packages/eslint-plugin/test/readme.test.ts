import { Linter } from 'eslint'
/**
 * AC-eslint-plugin-19 covers: R9.
 * AC-eslint-plugin-25 covers: R13, R6.
 *
 * The README's own claims, run as fixtures against the real rules: a statement is checked by
 * actually linting the exact construct it names, so the README and the rules can only drift
 * together, never silently apart.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'
import { countEscapesRule } from '../src/rules/count-escapes.ts'
import { rawReasonRule } from '../src/rules/raw-reason.ts'
import { styleValuesRule } from '../src/rules/style-values.ts'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const README = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')

function manifest(): {
  engines: { node: string }
  peerDependencies: Record<string, string>
  rules: never
} {
  return JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as never
}

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

function lint(code: string, extraConfig: Record<string, unknown> = {}): string[] {
  const messages = linter.verify(code, {
    languageOptions,
    plugins: { '@navecss': plugin },
    rules: {
      '@navecss/class-channel': 'error',
      '@navecss/raw-reason': 'error',
      '@navecss/count-escapes': 'error',
      '@navecss/style-values': 'error',
    },
    ...extraConfig,
  })
  return messages.filter((message) => message.ruleId?.startsWith('@navecss/')).map((m) => m.ruleId!)
}

describe('AC-25: the README has every required section', () => {
  it.each([
    'Installation',
    'Requirements',
    'Enable',
    'Declare your own classes',
    'Count your escapes',
    'Adopting on an existing codebase',
    'What it does not check',
    'Rules',
  ])('has a "%s" section', (heading) => {
    expect(README).toMatch(new RegExp(String.raw`^#+\s+${heading}\s*$`, 'm'))
  })

  it('requirements state the real eslint range, @navecss/core range and Node floor', () => {
    const { peerDependencies, engines } = manifest()
    expect(README).toContain(peerDependencies.eslint)
    expect(README).toContain(peerDependencies['@navecss/core'])
    expect(README).toContain(engines.node)
  })

  it('the enable fence, used verbatim, reports a bare literal and passes a declared class', () => {
    const PRELUDE = "const el = <div className='legacy-card' />"
    expect(lint(PRELUDE)).toContain('@navecss/class-channel')
    expect(
      lint('const el = <div className="app-shell" />', {
        settings: { '@navecss': { allow: ['app-'] } },
      }),
    ).toEqual([])
  })

  it('the rules table names every exported rule exactly once, and every named row is a real export', () => {
    const tableRows = README.matchAll(/^\| `(@navecss\/[a-z-]+)`\s*\|/gm)
      .map((m) => m[1]!)
      .toArray()
    const exportedIds = Object.keys(plugin.rules).map((name) => `@navecss/${name}`)
    expect(tableRows.toSorted((a, b) => a.localeCompare(b))).toEqual(
      exportedIds.toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it("states that a later config entry setting only a rule's severity keeps its default options, and one setting options replaces them", () => {
    const collapsed = README.replaceAll(/\s+/g, ' ')
    expect(collapsed).toContain(
      "A later config entry that sets only a rule's severity keeps that rule's default options; one that sets options replaces them.",
    )
  })

  it("states that a later settings entry replaces a key's whole value, while one setting a different key keeps it", () => {
    const collapsed = README.replaceAll(/\s+/g, ' ')
    expect(collapsed).toContain(
      "A later config entry that sets one of these keys replaces that key's whole value, arrays included; one that sets only a different key of the same `settings['@navecss']` object leaves this one as it was.",
    )
  })
})

/**
 * The anchor GitHub renders for a README heading: the heading's text lower-cased, every character
 * that is not a letter, mark, number, connector, hyphen or space dropped, spaces turned into
 * hyphens, and a repeated anchor suffixed `-1`, `-2` in order.
 */
function headingAnchors(markdown: string): Map<string, string> {
  const withoutFences = markdown.replaceAll(/```[\s\S]*?```/g, '')
  const anchors = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const [, text] of withoutFences.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const base = text!
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .replaceAll(' ', '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.set(count === 0 ? base : `${base}-${count}`, text!)
  }
  return anchors
}

/**
The README text from the heading `text` up to the next heading of any level.
 */
function sectionUnder(heading: string): string {
  const start = README.indexOf(heading)
  const rest = README.slice(start + heading.length)
  const next = rest.search(/^#{1,6}\s/m)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('AC-07: every rule links to its own README entry', () => {
  const anchors = headingAnchors(README)

  it('computes anchors the way GitHub does (a control on known headings)', () => {
    expect(anchors.get('adopting-on-an-existing-codebase')).toBe('Adopting on an existing codebase')
    expect(anchors.has('what-it-does-not-check')).toBe(true)
  })

  it.each(Object.entries(plugin.rules))(
    '%s: meta.docs.url ends in the anchor of a README heading whose section names the rule',
    (name, rule) => {
      const url = (rule as { meta?: { docs?: { url?: string } } }).meta?.docs?.url ?? ''
      expect(
        url.startsWith('https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#'),
      ).toBe(true)
      const fragment = url.slice(url.indexOf('#') + 1)
      const heading = anchors.get(fragment)
      expect(heading, `no README heading renders the anchor #${fragment}`).toBeDefined()
      expect(sectionUnder(heading!)).toContain(`@navecss/${name}`)
    },
  )
})

describe('AC-25: "what it does not check" statements hold as fixtures', () => {
  it('a camelCase string in cx() passes only if it names a real atom of the installed core', () => {
    const code = "import { cx } from '@navecss/core/cx'\nconst el = <div className={cx('flex')} />"
    expect(lint(code)).toEqual([])
    const bad =
      "import { cx } from '@navecss/core/cx'\nconst el = <div className={cx('notAnAtom')} />"
    expect(lint(bad)).toContain('@navecss/class-channel')
  })

  it('a call outside the helper list passes', () => {
    expect(lint("const el = <div className={myJoin('legacy-card')} />")).toEqual([])
  })

  it('a literal routed through a custom property is not seen by the style rule', () => {
    expect(lint("const el = <div style={{ '--w': 'legacy-card' }} />")).toEqual([])
  })

  it('states that a cx.raw call reached other than the recognised ways is not seen, and it is not', () => {
    const collapsed = README.replaceAll(/\s+/g, ' ')
    expect(collapsed).toContain(
      "- `cx.raw` is recognised as `cx.raw`, `cx['raw']`, ``cx[`raw`]``, a namespace import's `c.cx.raw`, or one `const` alias: a call reached any other way, such as `(0, cx.raw)(...)` or `cx.raw.call(...)`, is not seen by either rule.",
    )
    const PRELUDE = "import { cx } from '@navecss/core/cx'\n"
    expect(lint(`${PRELUDE}const k = (0, cx.raw)('legacy-card')`)).toEqual([])
    expect(lint(`${PRELUDE}const k = cx.raw.call(null, 'legacy-card')`)).toEqual([])
    expect(lint(`${PRELUDE}const k = cx.raw('legacy-card')`)).toEqual([
      '@navecss/raw-reason',
      '@navecss/count-escapes',
    ])
  })
})

describe('AC-27: the style rule states its one deliberate divergence from stylelint', () => {
  it("states that a string that is not a valid value for its property is reported here while stylelint passes it, and the rule reports padding: '13' and padding: ''", () => {
    expect(sectionUnder('### Rule: style').replaceAll(/\s+/g, ' ')).toContain(
      "One divergence from `@navecss/stylelint-config` is deliberate: a string that is not a valid value for its property, such as `padding: '13'` (a number with no unit) or `padding: ''`, is reported here, while stylelint passes the same text in a stylesheet. The browser drops such a declaration, and this rule reports it rather than parse each property's grammar.",
    )
    expect(lint("const el = <div style={{ padding: '13' }} />")).toEqual(['@navecss/style-values'])
    expect(lint("const el = <div style={{ padding: '' }} />")).toEqual(['@navecss/style-values'])
  })
})

describe('AC-19: the counting rule denominator, stated and fixtured', () => {
  it('states ESLint 9.24.0 or later, matching the real peer floor', () => {
    const { peerDependencies } = manifest()
    expect(peerDependencies.eslint).toContain('9.24.0')
    expect(README).toContain('9.24.0')
  })

  it('states that warnings are never recorded', () => {
    expect(README).toMatch(/never recorded/)
  })

  const exclusions: { code: string; note: string }[] = [
    {
      code: "function f() { return 'legacy-card' }\nconst el = <div className={f()} />",
      note: 'a function return value',
    },
    {
      code: "import { IMPORTED } from './constants'\nconst el = <div className={IMPORTED} />",
      note: 'an imported constant',
    },
    {
      code: "const A = 'legacy-card'\nconst B = A\nconst el = <div className={B} />",
      note: 'a variable beyond one const hop',
    },
    {
      code: "const el = <div className={myJoin('legacy-card')} />",
      note: 'a call outside the helper list',
    },
    {
      code: "const el = <div style={{ '--w': 'legacy-card' }} />",
      note: 'a literal routed through a custom property',
    },
  ]

  it.each(exclusions)('excludes: $note', ({ code }) => {
    expect(lint(code)).toEqual([])
  })

  it('a file opening with a bare eslint-disable gets no report and no suppressions entry', () => {
    const code =
      "/* eslint-disable */\nimport { cx } from '@navecss/core/cx'\nconst el = <div className={cx.raw('legacy-card')} />"
    expect(lint(code)).toEqual([])
  })

  it("states the three limits ESLint's own directive and suppressions handling sets", () => {
    const collapsed = README.replaceAll(/\s+/g, ' ')
    for (const statement of [
      'A same-line `// eslint-disable-line` that names no rule, or names `@navecss/count-escapes`, with or without a `-- description`, silences every report on its line',
      'One naming only other rules of this plugin is counted, at the comment.',
      'replacing a counted escape with a counted disable comment in the same file leaves `eslint-suppressions.json` unchanged',
      'An inline configuration comment turning the counting rule off (`/* eslint @navecss/count-escapes: "off" */`) is not counted and hides its file\'s escapes.',
      'the next run fails on unused suppressions until pruned',
      'in a file it does not record, nothing shows',
    ]) {
      expect(collapsed).toContain(statement)
    }
  })

  it('the same-line limit holds: a bare eslint-disable-line leaves its line with no report from any rule', () => {
    expect(lint('const el = <div className="legacy-card" /> // eslint-disable-line')).toEqual([])
  })

  it('offers warn plus --max-warnings as a fallback, and states its condition', () => {
    expect(README).toMatch(/warn.*--max-warnings/s)
    expect(README).toMatch(/counts every warning/)
  })
})
