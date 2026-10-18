/**
 * AC-native-apply-order-21, -22 and -24: the order warning on the PostCSS host and the text
 * expander. It never fails a build, is not governed by `onUnknown`, is never folded with a
 * problem, and under Next.js's Turbopack (which drops every PostCSS warning) is printed with
 * `console.warn` instead, framed as the Lightning CSS adapter frames a problem.
 */
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { expandText } from '../src/directive/expand-text.ts'
import { navePlugin } from '../src/postcss.ts'

type Mode = 'error' | 'ignore' | 'warn'
const MODES: readonly Mode[] = ['warn', 'error', 'ignore']

const FIXTURE = '.c { @nave hideDesktopUp flex; }'
const MARKED = '.c { @nave /* nave-allow-override: display */ hideDesktopUp flex; }'
const WITH_PROBLEM = '.c { @nave hideDesktopUp flex; } .d { @nave nope; }'
const OWN = { mine: { declarations: { 'accent-color': 'red' } } }

/**
 * The warning text the text expander gives for `css`, the one every host prints.
 */
function orderText(css: string): string {
  return expandText(css, { from: 'a.css' }).warnings[0]!.text
}

/**
 * Runs `css` through the PostCSS host the way a build does.
 */
function run(css: string, options: Parameters<typeof navePlugin>[0] = {}) {
  return postcss([navePlugin(options)]).process(css, { from: 'a.css' })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('AC-native-apply-order-21 — the PostCSS host', () => {
  it.each(MODES)(
    'onUnknown %s: process() resolves, the warning rides result.warnings() once, the output is the marked output',
    async (onUnknown) => {
      const result = await run(FIXTURE, { onUnknown })
      const marked = await run(MARKED, { onUnknown })

      expect(result.warnings()).toHaveLength(1)
      const [warning] = result.warnings()
      expect(warning).toMatchObject({ plugin: 'postcss-nave', line: 1, column: 26 })
      expect(warning!.text).toBe(orderText(FIXTURE))
      expect(marked.warnings()).toHaveLength(0)
      expect(result.css).toBe(marked.css)
    },
  )

  it.each(MODES)(
    'under Turbopack, onUnknown %s: console.warn prints it framed a.css:1:26, and result.warnings() holds none',
    async (onUnknown) => {
      vi.stubEnv('TURBOPACK', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await run(FIXTURE, { onUnknown })

      expect(result.warnings()).toHaveLength(0)
      expect(warn.mock.calls).toEqual([[`a.css:1:26: ${orderText(FIXTURE)}`]])
    },
  )

  it('control: with TURBOPACK unset, or empty, console.warn is called for no order warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('TURBOPACK', undefined)
    await run(FIXTURE)
    vi.stubEnv('TURBOPACK', '')
    const result = await run(FIXTURE)

    expect(warn).not.toHaveBeenCalled()
    expect(result.warnings()).toHaveLength(1)
  })

  it('under Turbopack the output is unchanged by where the warning is printed', async () => {
    const quiet = await run(FIXTURE)
    vi.stubEnv('TURBOPACK', '1')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect((await run(FIXTURE)).css).toBe(quiet.css)
  })
})

describe('AC-native-apply-order-21 — the text expander', () => {
  it.each(MODES)(
    'onUnknown %s: returns, the warning is in warnings, diagnostics is empty',
    (onUnknown) => {
      const result = expandText(FIXTURE, { onUnknown, from: 'a.css' })

      expect(result.diagnostics).toEqual([])
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatchObject({ line: 1, column: 26, file: 'a.css' })
      expect(result.css).toBe(expandText(MARKED, { onUnknown }).css)
    },
  )
})

describe('AC-native-apply-order-22 — never folded with a problem', () => {
  it('the PostCSS host rejects under error, naming nope and none of the order warning', async () => {
    const error = await run(WITH_PROBLEM, { onUnknown: 'error' }).then(
      () => undefined,
      (caught: unknown) => caught as Error,
    )

    expect(error?.message).toContain('nope')
    expect(error?.message).not.toContain('so under @media')
    expect(error?.message).not.toContain('nave-allow-override')
  })

  it('the PostCSS host under warn prints the problem and the order warning as two reports', async () => {
    const result = await run(WITH_PROBLEM, { onUnknown: 'warn' })

    const texts = result.warnings().map((warning) => warning.text)
    expect(texts).toHaveLength(2)
    expect(texts.filter((text) => text.includes('nope'))).toHaveLength(1)
    expect(texts.filter((text) => text.includes('nave-allow-override'))).toHaveLength(1)
    expect(texts.find((text) => text.includes('nope'))).not.toContain('so under @media')
  })

  it('the PostCSS host under ignore keeps the problem silent and prints the order warning', async () => {
    const result = await run(WITH_PROBLEM, { onUnknown: 'ignore' })

    expect(result.warnings().map((warning) => warning.text)).toEqual([orderText(FIXTURE)])
  })

  it.each(MODES)(
    'the text expander under %s holds the order warning only in warnings',
    (onUnknown) => {
      const result = expandText(WITH_PROBLEM, { onUnknown, from: 'a.css' })

      expect(result.warnings.map((warning) => warning.text)).toEqual([orderText(FIXTURE)])
      expect(JSON.stringify(result.diagnostics)).not.toContain('nave-allow-override')
      expect(result.diagnostics).toHaveLength(onUnknown === 'ignore' ? 0 : 1)
    },
  )
})

describe('AC-native-apply-order-24 — no switch, and the fixture prints under every onUnknown', () => {
  it.each(MODES)(
    'the PostCSS host with extend, onUnknown %s, prints the warning',
    async (onUnknown) => {
      const result = await run(FIXTURE, { onUnknown, extend: OWN })

      expect(result.warnings()).toHaveLength(1)
    },
  )

  it.each(MODES)(
    'the text expander with extend, onUnknown %s, returns the warning',
    (onUnknown) => {
      expect(expandText(FIXTURE, { onUnknown, extend: OWN }).warnings).toHaveLength(1)
    },
  )

  it('an extend atom compares like a built-in one', async () => {
    const extend = {
      wide: {
        declarations: {},
        media: { '(width >= 75em)': { declarations: { display: 'none' } } },
      },
    }
    const result = await run('.c { @nave wide flex; }', { extend })

    expect(result.warnings()).toHaveLength(1)
  })
})
