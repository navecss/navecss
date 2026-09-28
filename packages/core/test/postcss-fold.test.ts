/**
 * AC-directive-core-16: every problem in one stylesheet, in one report.
 */
import type { Plugin } from 'postcss'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

/**
 * Forces `postcss` into its async execution path (`Once` returning a
 * promise) without touching `navePlugin` itself, so a test can put a real
 * microtask gap between two concurrent runs sharing one plugin instance.
 */
function asyncGap(): Plugin {
  return {
    postcssPlugin: 'async-gap',
    async Once() {
      await Promise.resolve()
    },
  }
}

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

  it('emits warnings in source order, even when a later diagnostic kind is read first', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process(
      '.a { @nave flx, flx; }',
      { from: undefined },
    )

    // The comma is read into a diagnostic before the second "flx" is, so
    // without a source-order sort the first warning would be the comma's,
    // not the first "flx" at column 12.
    expect(result.warnings()).toMatchObject([
      { column: 12, line: 1 },
      { column: 15, line: 1 },
      { column: 17, line: 1 },
    ])
  })

  it('throws at the first problem in source order, even when a later diagnostic kind is read first', async () => {
    let caught: { column: number; line: number; message: string } | undefined
    try {
      await postcss([navePlugin()]).process('.a { @nave flx, flx; }', { from: undefined })
    } catch (error) {
      caught = error as { column: number; line: number; message: string }
    }

    expect(caught).toBeDefined()
    // The comma is read into a diagnostic before the second "flx" is, but
    // the FIRST "flx" (column 12) precedes the comma (column 15) in the
    // stylesheet, so it must be the one the throw is positioned at, and the
    // comma the first line of the "more" list.
    expect(caught?.line).toBe(1)
    expect(caught?.column).toBe(12)
    expect(caught?.message).toContain('unknown atom "flx"')
    expect(caught?.message).toContain('1:15:')
  })

  it('does not crash the fold when one of its entries has no source (an at-rule an earlier plugin appended, never parsed)', async () => {
    const inj: Plugin = {
      postcssPlugin: 'inj',
      Rule(r) {
        const stamped = r as unknown as { __d?: boolean }
        if (r.selector === '.a' && !stamped.__d) {
          stamped.__d = true
          r.append(postcss.atRule({ name: 'nave', params: 'nope' }))
        }
      },
    }

    await expect(
      postcss([inj, navePlugin()]).process('.a { color: red; } .b { @nave flx; }', {
        from: undefined,
      }),
    ).rejects.toThrow(/unknown atom "nope"/)
  })

  it('sorts the fold by source position, not by push order — reds under a mutant that skips the sort', async () => {
    await expect(
      postcss([navePlugin()]).process('.a { @nave flx { } }', { from: undefined }),
    ).rejects.toMatchObject({ line: 1, column: 6 })
  })

  it('folds per RUN, not per shared plugin instance, once postcss runs async (found while implementing AC-directive-core-25)', async () => {
    const shared = navePlugin()

    const bad = postcss([shared, asyncGap()]).process('.bad { @nave nope; }', { from: undefined })
    const good = postcss([shared, asyncGap()]).process('.good { @nave flex; }', {
      from: undefined,
    })

    const [badResult, goodResult] = await Promise.allSettled([bad, good])

    expect(badResult.status).toBe('rejected')
    if (badResult.status === 'rejected') {
      expect((badResult.reason as { message: string }).message).toContain('unknown atom "nope"')
    }

    expect(goodResult.status).toBe('fulfilled')
  })
})
