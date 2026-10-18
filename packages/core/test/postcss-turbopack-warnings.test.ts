/**
 * Under `onUnknown: 'warn'` the PostCSS plugin reports a problem as a PostCSS warning. Next.js's
 * default bundler, Turbopack, reads none of the warnings a PostCSS plugin raises (it handles only
 * the assets and dependencies in `result.messages`), so a consumer on it saw no message at all
 * while the atom was missing from the page. Turbopack sets `TURBOPACK` in the process that runs
 * PostCSS; there the plugin prints each problem with `console.warn`, which reaches the terminal on
 * both bundlers, and raises no PostCSS warning of its own so webpack-style output is not doubled.
 */
import postcss, { type Result } from 'postcss'
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
