import { SourceMapConsumer } from 'source-map'
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'

describe('AC-directive-core-18 — a version-3 source map, one segment per token', () => {
  const css = '.a {\n  color: red;\n  @nave focusRing;\n  margin: 0;\n}'

  it('gives version 3 and the sources array', () => {
    const { map } = expandText(css, { from: 'a.css' })

    expect(map).toBeDefined()
    const parsed = JSON.parse(map) as { sources: string[]; version: number }
    expect(parsed.version).toBe(3)
    expect(parsed.sources).toEqual(['a.css'])
  })

  it('maps untouched tokens to their own input position, and inserted text to the directive @', async () => {
    const { css: output, map } = expandText(css, { from: 'a.css' })
    const consumer = await new SourceMapConsumer(map)

    const colorAt = output.indexOf('color')
    const colorPos = positionOf(output, colorAt)
    const original = consumer.originalPositionFor({ line: colorPos.line, column: colorPos.column })
    expect(original).toMatchObject({ line: 2, column: 2 })

    const outlineAt = output.indexOf('outline: none')
    const outlinePos = positionOf(output, outlineAt)
    const insertedOriginal = consumer.originalPositionFor({
      line: outlinePos.line,
      column: outlinePos.column,
    })
    expect(insertedOriginal).toMatchObject({ line: 3, column: 2 })

    const focusVisibleAt = output.indexOf('&:focus-visible')
    const focusVisiblePos = positionOf(output, focusVisibleAt)
    const blockOriginal = consumer.originalPositionFor({
      line: focusVisiblePos.line,
      column: focusVisiblePos.column,
    })
    expect(blockOriginal).toMatchObject({ line: 3, column: 2 })

    consumer.destroy()
  })

  it('chains through an incoming map', async () => {
    const incoming = {
      version: 3 as const,
      sources: ['src.scss'],
      names: [],
      mappings: buildIdentityMappingsShiftedBy10(css),
    }

    const { css: output, map } = expandText(css, { from: 'a.css', inputSourceMap: incoming })
    const consumer = await new SourceMapConsumer(map)

    const marginAt = output.indexOf('margin: 0')
    const marginPos = positionOf(output, marginAt)
    const original = consumer.originalPositionFor({
      line: marginPos.line,
      column: marginPos.column,
    })

    expect(original.source).toBe('src.scss')
    expect(original.line).toBe(14)

    consumer.destroy()
  })

  it('gives a stylesheet with no directive a map sending every token to itself', async () => {
    const plain = '.a {\n  color: red;\n}'
    const { css: output, map } = expandText(plain, { from: 'a.css' })
    const consumer = await new SourceMapConsumer(map)

    expect(output).toBe(plain)
    const colorAt = output.indexOf('color')
    const colorPos = positionOf(output, colorAt)
    const original = consumer.originalPositionFor({ line: colorPos.line, column: colorPos.column })
    expect(original).toMatchObject({ line: 2, column: 2 })

    consumer.destroy()
  })
})

/**
1-based line, 0-based column (source-map convention) for `offset` in `text`.
 */
function positionOf(text: string, offset: number): { column: number; line: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset; i++) {
    if (text[i] !== '\n') {
      continue
    }

    line++
    lineStart = i + 1
  }
  return { line, column: offset - lineStart }
}

/**
An identity `mappings` string (every generated position maps to the same position, source index 0) where every original LINE is shifted by +10.
 */
function buildIdentityMappingsShiftedBy10(text: string): string {
  const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  function encodeVLQ(n: number): string {
    let value = n < 0 ? (-n << 1) + 1 : n << 1
    let result = ''
    do {
      let digit = value & 0b1_1111
      value >>>= 5
      if (value > 0) digit |= 0b10_0000
      result += BASE64[digit]
    } while (value > 0)
    return result
  }

  const lines = text.split('\n')
  const rows: string[] = []
  let prevSourceLine = 0
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const sourceLineDelta = 10 + lineIndex === prevSourceLine ? 0 : 10 + lineIndex - prevSourceLine
    // One segment at column 0 per line: genColDelta=0, sourceIndexDelta=0, sourceLineDelta, sourceColumnDelta=0
    rows.push(encodeVLQ(0) + encodeVLQ(0) + encodeVLQ(sourceLineDelta) + encodeVLQ(0))
    prevSourceLine = 10 + lineIndex
  }
  return rows.join(';')
}
