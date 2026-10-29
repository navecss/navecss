/**
 * AC-native-apply-order-44 (Tier A): under Vite's `css.transformer: 'lightningcss'` below the
 * floor keys, Lightning CSS has split a rule before Nave's transform, so only atom pairs are
 * checked; with both floor keys set every shape is checked. The stale-marker report is off under
 * that transformer at any targets, while the other reports about a marker still print.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { ScratchApp } from './helpers/vite-app.ts'

import {
  FLOOR_KEYS,
  LIGHTNING_DEFAULT_TARGETS,
  occurrences,
  orderProject,
} from './helpers/order-warning-vite.ts'
import { runViteBuild } from './helpers/vite-cli.ts'
import { runHook } from './helpers/vite-hook.ts'

const C1 = '.c1 { @nave hideDesktopUp; display: grid }\n'
const C2 = '.c2 { @nave hideDesktopUp flex; }\n'
const D3 = '.d3 { @nave hideDesktopUp; color: red; @nave flex; }\n'
const F3 = '.f3 { @nave focusRing; &:focus { outline: none } }\n'
const PROJECT = C1 + C2 + D3 + F3

const apps: ScratchApp[] = []
afterEach(() => {
  for (const app of apps) app.dispose()
  apps.length = 0
})

/**
 * Builds `css` as `a.css` under Lightning CSS with the given config `keys`, and answers the output.
 */
async function build(css: string, keys: string): Promise<string> {
  const app = orderProject({ sheets: { 'src/a.css': css }, keys })
  apps.push(app)
  const run = await runViteBuild(app)
  expect(run.code, run.output).toBe(0)
  return run.output
}

describe('AC-native-apply-order-44: Lightning CSS below the floor', () => {
  it('prints exactly two warnings at default targets: the atom pairs of c2 and d3', async () => {
    const output = await build(PROJECT, LIGHTNING_DEFAULT_TARGETS)

    expect(occurrences(output, '@nave: ')).toBe(2)
    expect(occurrences(output, '"flex" comes after "hideDesktopUp"')).toBe(2)
    expect(output).not.toContain('display: grid comes after')
    expect(output).not.toContain('the &:focus block comes after')
  })

  it('prints the warnings of c1, c2, d3 and f3 with both floor keys set', async () => {
    const output = await build(PROJECT, FLOOR_KEYS)

    expect(occurrences(output, '@nave: ')).toBe(4)
    expect(output).toContain('display: grid comes after')
    expect(occurrences(output, '"flex" comes after "hideDesktopUp"')).toBe(2)
    expect(output).toContain('the &:focus block comes after')
  })
})

describe('AC-native-apply-order-44: the stale-marker report under Lightning CSS', () => {
  const STALE = '.s { @nave /* nave-allow-override: display */ flex; }\n'
  const OTHERS =
    '.m { @nave /* nave-allow-override: */ flex; }\n.n { @nave /* nave-allow-override: nope-prop */ flex; }\n.o { @nave /* nave-allow-override display */ flex; }\n'

  it.each([LIGHTNING_DEFAULT_TARGETS, FLOOR_KEYS])(
    'a build prints no report about a marker that covers nothing',
    async (keys) => {
      const output = await build(STALE, keys)

      expect(output).not.toContain('but nothing after the directive overrides')
    },
  )

  it('control: under the default transformer the stale report prints', async () => {
    const output = await build(STALE, "\n  build: { cssTarget: ['chrome125'] },")

    expect(output).toContain('but nothing after the directive overrides display')
  })

  it('the plugin turns the stale report off under lightningcss only; the other reports stay', async () => {
    const stale = await runHook({ code: STALE, transformer: 'lightningcss' })
    const kept = await runHook({ code: OTHERS, transformer: 'lightningcss' })
    const control = await runHook({ code: STALE })

    expect(stale.warnings).toEqual([])
    expect(kept.warnings.map((warning) => warning.message)).toEqual([
      expect.stringContaining('names no property'),
      expect.stringContaining('not a CSS property'),
      expect.stringContaining('is not a marker'),
    ])
    expect(control.warnings).toHaveLength(1)
    expect(control.warnings[0]!.message).toContain('but nothing after the directive overrides')
  })
})
