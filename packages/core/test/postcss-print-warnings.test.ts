/**
 * `printWarnings: false` is for a tool that runs the PostCSS plugin itself and reports the
 * warnings it raises: under `onUnknown: 'warn'` each problem is then raised as a PostCSS warning
 * and never printed, whatever `TURBOPACK` holds. Left out, or `true`, the plugin prints on
 * Turbopack as `postcss-turbopack-warnings.test.ts` pins.
 */
import postcss, { type Result } from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isOrderWarning, navePlugin } from '../src/postcss.ts'

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

describe('printWarnings and the order warning', () => {
  const CSS = '.x { @nave hideDesktopUp; display: flex; }'

  it.each(['1', ''])(
    'false, with TURBOPACK=%j: raises the order warning as a PostCSS warning and prints nothing',
    async (value) => {
      vi.stubEnv('TURBOPACK', value)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await run(CSS, { printWarnings: false })

      expect(result.warnings().map((warning) => warning.text)).toEqual([
        expect.stringContaining('display: flex comes after "hideDesktopUp"'),
      ])
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('true, the default: prints the order warning under Turbopack and raises nothing', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await run(CSS, { printWarnings: true })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('display: flex comes after "hideDesktopUp"')
    expect(result.warnings()).toHaveLength(0)
  })

  it('false: raises a problem in a nested rule and an order warning of the same tree, none printed', async () => {
    vi.stubEnv('TURBOPACK', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await run('.x { @nave hideDesktopUp; &:hover { @nave nope } display: flex; }', {
      onUnknown: 'warn',
      printWarnings: false,
    })

    expect(result.warnings()).toHaveLength(2)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('isOrderWarning', () => {
  const CASES = [
    ['an order warning', '.x { @nave hideDesktopUp; display: flex; }', true],
    [
      'a shape warning',
      '.x::before, .y { @nave hideDesktopUp; & { color: red } display: flex; }',
      true,
    ],
    ['an unknown-atom problem under onUnknown "warn"', '.x { @nave nope; }', false],
  ] as const

  it.each(
    CASES.flatMap(([name, css, expected]) =>
      ['1', ''].map((value) => [name, value, css, expected] as const),
    ),
  )(
    'is told apart for %s, with printWarnings false and TURBOPACK=%j',
    async (_name, value, css, expected) => {
      vi.stubEnv('TURBOPACK', value)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await run(css, { onUnknown: 'warn', printWarnings: false })

      expect(result.warnings().length).toBeGreaterThan(0)
      expect(result.warnings().map((warning) => isOrderWarning(warning))).toEqual(
        result.warnings().map(() => expected),
      )
    },
  )

  it('tells a problem from an order warning in one stylesheet', async () => {
    const result = await run('.x { @nave hideDesktopUp; display: flex; @nave nope; }', {
      onUnknown: 'warn',
      printWarnings: false,
    })

    expect(result.warnings().map((warning) => isOrderWarning(warning))).toEqual([true, false])
  })
})
