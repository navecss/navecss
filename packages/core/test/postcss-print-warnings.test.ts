/**
 * `printWarnings: false` is for a tool that runs the PostCSS plugin itself and reports the
 * warnings it raises: under `onUnknown: 'warn'` each problem is then raised as a PostCSS warning
 * and never printed, whatever `TURBOPACK` holds. Left out, or `true`, the plugin prints on
 * Turbopack as `postcss-turbopack-warnings.test.ts` pins.
 */
import postcss, { type Result } from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function run(css: string, options: Parameters<typeof navePlugin>[0]): Promise<Result> {
  return postcss([navePlugin(options)]).process(css, { from: '/proj/app.css' })
}

describe('printWarnings: false', () => {
  it.each(['1', ''])(
    'with TURBOPACK=%j raises the problem as a PostCSS warning and prints nothing',
    async (value) => {
      vi.stubEnv('TURBOPACK', value)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await run('.x {\n  @nave nope;\n}', {
        onUnknown: 'warn',
        printWarnings: false,
      })

      expect(result.warnings().map((warning) => [warning.text, warning.line])).toEqual([
        [expect.stringMatching(/unknown atom "nope"/), 2],
      ])
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('leaves the error mode as it was: the problem still fails the stylesheet', async () => {
    vi.stubEnv('TURBOPACK', '1')

    await expect(
      run('.x { @nave nope; }', { onUnknown: 'error', printWarnings: false }),
    ).rejects.toThrow(/unknown atom "nope"/)
  })
})

describe('printWarnings: true, the default', () => {
  it('prints under Turbopack and raises nothing, as when it is left out', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await run('.x { @nave nope; }', { onUnknown: 'warn', printWarnings: true })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(result.warnings()).toHaveLength(0)
  })
})
