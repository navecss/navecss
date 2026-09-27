/**
 * AC-directive-core-17 (the Vite-specific rows are covered separately): a
 * diagnostic's `file`/`line` are mapped back through the incoming
 * source map when the host provides one, and are the path the host passed
 * when it does not.
 */
import postcss from 'postcss'
import { SourceMapGenerator } from 'source-map'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

const CSS = '.x {\n  color: red;\n  @nave nope;\n}'

function buildIncomingMap(): object {
  const generator = new SourceMapGenerator({ file: 'compiled.css' })
  generator.addMapping({
    source: 'a.scss',
    original: { line: 4, column: 2 },
    generated: { line: 3, column: 2 },
  })
  return JSON.parse(generator.toString()) as object
}

describe('AC-directive-core-17 — whose line and column', () => {
  it('maps the diagnostic to the incoming map’s original file and line (PostCSS map: { prev })', async () => {
    let caught: { file?: string; line?: number } | undefined
    try {
      await postcss([navePlugin()]).process(CSS, {
        from: 'compiled.css',
        map: { prev: buildIncomingMap(), inline: false },
      })
    } catch (error) {
      caught = error as { file?: string; line?: number }
    }

    expect(caught).toBeDefined()
    // PostCSS resolves a relative `from`/source against process.cwd(); the
    // diagnostic's own contract is which FILE it names, not path absoluteness.
    expect(caught?.file).toMatch(/a\.scss$/)
    expect(caught?.line).toBe(4)
  })

  it('with no incoming map, file is the path the host passed, and the message names it', async () => {
    let caught: { file?: string; message?: string } | undefined
    try {
      await postcss([navePlugin()]).process(CSS, { from: 'compiled.css' })
    } catch (error) {
      caught = error as { file?: string; message?: string }
    }

    expect(caught).toBeDefined()
    expect(caught?.file).toMatch(/compiled\.css$/)
    expect(caught?.message).toContain('compiled.css')
  })
})
