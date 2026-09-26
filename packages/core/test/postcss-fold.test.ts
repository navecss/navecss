/**
 * AC-directive-core-16: every problem in one stylesheet, in one report.
 */
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

const CSS = '.root {\n  @nave flx interactve;\n}\n.icon {\n  @nave srOnlyy;\n}\n'

describe('AC-directive-core-16 — every problem in one stylesheet, in one report', () => {
  it('folds every problem into one throw under error, positioned at the first', async () => {
    await expect(postcss([navePlugin()]).process(CSS, { from: undefined })).rejects.toMatchObject({
      name: 'CssSyntaxError',
      line: 2,
      column: 9,
    })
  })

  it('names the fold layout: first problem, "N more", then one line per further problem', async () => {
    let caught: { message: string } | undefined
    try {
      await postcss([navePlugin()]).process(CSS, { from: undefined })
    } catch (error) {
      caught = error as { message: string }
    }

    expect(caught).toBeDefined()
    const reason = (caught as unknown as { reason: string }).reason ?? caught?.message ?? ''
    expect(reason).toContain('unknown atom "flx"')
    expect(reason).toContain('2 more in this stylesheet:')
    expect(reason).toContain('2:13: unknown atom "interactve"')
    expect(reason).toContain('5:9: unknown atom "srOnlyy"')
    expect(reason.indexOf('flx')).toBeLessThan(reason.indexOf('2 more'))
    expect(reason.indexOf('2 more')).toBeLessThan(reason.indexOf('interactve'))
  })

  it('gives exactly three warnings, no fold, under warn', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process(CSS, {
      from: undefined,
    })

    expect(result.warnings()).toHaveLength(3)
    expect(result.warnings()[0]).toMatchObject({ line: 2, column: 9 })
    expect(result.warnings()[1]).toMatchObject({ line: 2, column: 13 })
    expect(result.warnings()[2]).toMatchObject({ line: 5, column: 9 })
    for (const warning of result.warnings())
      expect(warning.text).not.toContain('more in this stylesheet')
  })

  it('folds per stylesheet: two independent processes give two independent reports', async () => {
    const first = postcss([navePlugin()]).process('.a { @nave nope; }', { from: undefined })
    const second = postcss([navePlugin()]).process('.b { @nave alsoBad; }', { from: undefined })

    await expect(first).rejects.toMatchObject({ line: 1, column: 12 })
    await expect(second).rejects.toMatchObject({ line: 1, column: 12 })
  })
})
