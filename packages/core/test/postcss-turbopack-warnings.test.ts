/**
 * Under `onUnknown: 'warn'` the PostCSS plugin reports a problem as a PostCSS warning. Next.js's
 * default bundler, Turbopack, reads none of the warnings a PostCSS plugin raises (it handles only
 * the assets and dependencies in `result.messages`), so a consumer on it saw no message at all
 * while the atom was missing from the page. Turbopack sets `TURBOPACK` in the process that runs
 * PostCSS; there the plugin prints each problem with `console.warn`, which reaches the terminal on
 * both bundlers, and raises no PostCSS warning of its own so webpack-style output is not doubled.
 */
import postcss, { type Plugin, type Result } from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function run(css: string, onUnknown: 'error' | 'ignore' | 'warn'): Promise<Result> {
  return postcss([navePlugin({ onUnknown })]).process(css, { from: '/proj/app.css' })
}

describe('onUnknown: warn under Turbopack', () => {
  it('runs with TURBOPACK empty, whatever the shell exports', () => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- the test reads the value its own config pins, not an input the build depends on
    expect(process.env.TURBOPACK).toBe('')
  })

  it('prints the problem once, framed file:line:column, and raises no PostCSS warning', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await run('.x {\n  @nave nope;\n}', 'warn')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\/proj\/app\.css:2:9: .*unknown atom/)
    expect(result.warnings()).toHaveLength(0)
  })

  it('prints every problem, in source order', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await run('.a { @nave nope; }\n.b { @nave other; }', 'warn')

    expect(warn.mock.calls.map(([text]) => String(text).slice(0, 18))).toEqual([
      '/proj/app.css:1:12',
      '/proj/app.css:2:12',
    ])
  })

  it('leaves the other modes as they were', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(run('.x { @nave nope; }', 'error')).rejects.toThrow(/unknown atom/)
    const ignored = await run('.x { @nave nope; }', 'ignore')

    expect(warn).not.toHaveBeenCalled()
    expect(ignored.warnings()).toHaveLength(0)
  })
})

describe('onUnknown: warn on any other bundler', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])(
    'with TURBOPACK %s keeps the PostCSS warning and prints nothing itself',
    async (_name, value) => {
      vi.stubEnv('TURBOPACK', value)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await run('.x { @nave nope; }', 'warn')

      expect(result.warnings().map((warning) => warning.text)).toEqual([
        expect.stringMatching(/unknown atom/),
      ])
      expect(warn).not.toHaveBeenCalled()
    },
  )
})

describe('onUnknown: warn when TURBOPACK holds any non-empty value', () => {
  // Next's own test is `if (process.env.TURBOPACK)` (dist/lib/bundler.js). For the default,
  // flagless run Next sets 'auto' in its own process, and the process that runs PostCSS saw '1'
  // on Next 16.4.1, so the plugin acts on any non-empty value rather than on one of them.
  it.each(['1', 'auto', '0', 'false'])(
    'with TURBOPACK=%s prints once and raises nothing',
    async (value) => {
      vi.stubEnv('TURBOPACK', value)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await run('.x { @nave nope; }', 'warn')

      expect(warn).toHaveBeenCalledTimes(1)
      expect(result.warnings()).toHaveLength(0)
    },
  )
})

describe('a directive with no source', () => {
  const injectDirective: Plugin = {
    postcssPlugin: 'inject-directive',
    Once(root) {
      root.append(
        postcss.rule({ selector: '.x', nodes: [postcss.atRule({ name: 'nave', params: 'nope' })] }),
      )
    },
  }

  it('prints the bare message under Turbopack and raises no warning', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await postcss([injectDirective, navePlugin({ onUnknown: 'warn' })]).process('', {
      from: '/proj/app.css',
    })

    expect(warn.mock.calls).toEqual([[expect.stringMatching(/^@nave: unknown atom "nope"/)]])
    expect(result.warnings()).toHaveLength(0)
  })

  it('still raises the PostCSS warning elsewhere', async () => {
    vi.stubEnv('TURBOPACK', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await postcss([injectDirective, navePlugin({ onUnknown: 'warn' })]).process('', {
      from: '/proj/app.css',
    })

    expect(result.warnings()).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('the Turbopack frame places each problem where the PostCSS warning does', () => {
  it.each([
    ['an unknown atom on its own line', '.x {\n  @nave nope;\n}'],
    ['two problems from one directive', '.a { @nave flex flx grid flx; }'],
    ['a name after a two-unit character', '.a😀{@nave nope;}'],
    [
      'a directive outside a rule, no index',
      '.card { color: red; @media (width >= 37.5em) { @nave flex; } }',
    ],
    ['a directive inside keyframes, no index', '@keyframes k { to { @nave focusRing; } }'],
    ['a directive with a block, no index', '.a { @nave flex { color: red } }'],
    ['a directive naming no atom, no index', '.x {\n  @nave;\n}'],
  ])('%s', async (_name, css) => {
    vi.stubEnv('TURBOPACK', '')
    const postcssResult = await run(css, 'warn')
    const raised = postcssResult
      .warnings()
      .map(({ column, line, text }) => `/proj/app.css:${line}:${column}: ${text}`)

    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await run(css, 'warn')

    expect(raised.length).toBeGreaterThan(0)
    expect(warn.mock.calls.map(([line]) => String(line))).toEqual(raised)
  })
})
