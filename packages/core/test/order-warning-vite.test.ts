/**
 * AC-native-apply-order-21 (the Vite rows) and AC-native-apply-order-23 (the build half): the
 * order warning goes to Vite's logger through `this.warn`, never fails a build under any
 * `onUnknown`, is positioned as a problem is, and prints once per command although the client and
 * the ssr environment both transform the stylesheet. Each stylesheet here is built by the `vite build`
 * command from a config file, so the plugin is the built package.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { ScratchApp } from './helpers/vite-app.ts'

import { occurrences, orderProject, warningTextsOf } from './helpers/order-warning-vite.ts'
import { type CliResult, runViteBuild } from './helpers/vite-cli.ts'

const FIXTURE = '.c { @nave hideDesktopUp flex; }\n'
const PIN = '.p { @nave srOnlyFocusable; &:focus-visible { position: fixed } }\n'
const SCSS = `$gap: 1px;\n// the rule below is on line 5\n\n\n${FIXTURE}`

const apps: ScratchApp[] = []
afterEach(() => {
  for (const app of apps) app.dispose()
  apps.length = 0
})

/**
 * Builds a project holding `sheets` with `vite build`.
 */
function build(sheets: Record<string, string>, onUnknown = 'warn'): Promise<CliResult> {
  const app = orderProject({ options: `{ onUnknown: '${onUnknown}' }`, sheets })
  apps.push(app)
  return runViteBuild(app)
}

describe('AC-native-apply-order-21: the Vite plugin, build', () => {
  it.each(['warn', 'error', 'ignore'])(
    'onUnknown %s: vite build exits 0 and the logger prints the warning once',
    async (onUnknown) => {
      const run = await build({ 'src/a.css': FIXTURE }, onUnknown)

      expect(run.code, run.output).toBe(0)
      const [text] = warningTextsOf(FIXTURE)
      expect(occurrences(run.output, text!)).toBe(1)
    },
  )
})

describe('AC-native-apply-order-23: Vite build: one print per warning per command', () => {
  it('both environments transform the stylesheet, and the warning is printed once, at its file', async () => {
    const run = await build({ 'src/a.scss': SCSS })

    expect(run.code, run.output).toBe(0)
    expect(occurrences(run.output, 'probe transform client')).toBeGreaterThanOrEqual(1)
    expect(occurrences(run.output, 'probe transform ssr')).toBeGreaterThanOrEqual(1)
    const [text] = warningTextsOf(FIXTURE)
    expect(occurrences(run.output, text!)).toBe(1)
    expect(run.output).toMatch(/src\/a\.scss:\d+:\d+: @nave: "flex" comes after/)
    expect(run.output).toMatch(/position in \S+a\.scss as processed; no source map/)
  })

  it('two warnings at one position, one per reveal block, each print exactly once', async () => {
    const run = await build({ 'src/a.css': FIXTURE + PIN })

    expect(run.code, run.output).toBe(0)
    const texts = warningTextsOf(PIN)
    expect(new Set(texts).size).toBe(2)
    for (const text of texts) expect(occurrences(run.output, text)).toBe(1)
    expect(occurrences(run.output, warningTextsOf(FIXTURE)[0]!)).toBe(1)
  })
})
