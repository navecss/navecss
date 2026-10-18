/**
 * The text expander's own obligations under native order: it inserts no line break, leaves a run
 * whose last declaration has no semicolon valid, closes what it opens at the end of an unclosed
 * input, and keeps every authored byte where it was. Moved and wrapped declarations keep their
 * own source positions in both hosts.
 */
import postcss, { type Rule } from 'postcss'
import { SourceMapConsumer } from 'source-map'
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { navePlugin as lightningAdapter } from '../../src/lightningcss.ts'
import { navePlugin } from '../../src/postcss.ts'
import { isEquivalent } from '../helpers/css-equivalence.ts'
import { viaPostcss, viaText } from '../helpers/native-order.ts'

/**
 * `css` with every unclosed rule closed, for the PostCSS host (which refuses an unclosed input).
 */
function closed(css: string): string {
  let depth = 0
  for (const char of css) {
    if (char === '{') depth++
    else if (char === '}') depth--
  }
  return css + ' }'.repeat(Math.max(depth, 0))
}

/**
 * How many line breaks `text` holds (a CRLF pair counts once).
 */
function lineBreaks(text: string): number {
  return (text.match(/\r\n|[\n\r\f]/g) ?? []).length
}

/**
 * The Lightning CSS adapter's expansion of `css`.
 */
function viaLightning(css: string): string {
  const { code } = lightningAdapter({ onUnknown: 'warn' }).expand(css, 'x.css')
  return Buffer.from(code).toString()
}

const LEG = [
  ['the text expander', (css: string) => viaText(css)],
  ['the Lightning CSS adapter', (css: string) => viaLightning(css)],
] as const

const SHAPES: readonly string[] = [
  '.x {\n  @nave hideDesktopUp;\n  color: red;\n  gap: 1px\n}',
  '.x { @nave hideDesktopUp; color: red }',
  '.x { @nave focusRing; &:hover { color: blue } color: red }',
  '.x { @nave hideDesktopUp; color: red',
  '.x { @nave hideDesktopUp; color: red;',
  '.a { .x { @nave focusRing; color: red',
]

describe.each(LEG)('AC-native-apply-order-05 — %s', (_name, run) => {
  it.each(SHAPES)('%j adds no line break and loses no authored declaration', (input) => {
    const output = run(input)

    expect(lineBreaks(output)).toBe(lineBreaks(input))
    const found: string[] = []
    postcss.parse(closed(output)).walkDecls((decl) => {
      found.push(`${decl.prop}: ${decl.value}`)
    })
    const authored: string[] = []
    postcss.parse(closed(input)).walkDecls(/^(?:color|gap)$/, (decl) => {
      authored.push(`${decl.prop}: ${decl.value}`)
    })
    for (const declaration of authored) {
      const matches = found.filter((text) => text === declaration)
      expect(matches).toHaveLength(1)
    }
  })

  it.each(SHAPES)('%j is equivalent to the PostCSS host once closed', async (input) => {
    const expected = await viaPostcss(closed(input))
    const actual = closed(run(input))

    expect(isEquivalent(actual, expected)).toBe(true)
  })
})

describe('AC-native-apply-order-05 — every authored declaration starts on its own line', () => {
  it('keeps color and gap on their lines', () => {
    const input = '.x {\n  @nave hideDesktopUp;\n  color: red;\n  gap: 1px\n}'
    const lines = viaText(input).split('\n')

    expect(lines.findIndex((line) => line.includes('color: red'))).toBe(2)
    expect(lines.findIndex((line) => line.includes('gap: 1px'))).toBe(3)
  })
})

describe('AC-native-apply-order-06 — positions', () => {
  const css = '.x {\n  @nave hideDesktopUp flex;\n  color: red;\n}'

  it('the PostCSS host keeps color its own source and gives generated nodes the directive source', async () => {
    const result = await postcss([navePlugin()]).process(css, { from: 'a.css' })
    const rule = result.root.first as Rule

    rule.walkDecls('color', (decl) => {
      expect(decl.source?.start).toMatchObject({ line: 3, column: 3 })
    })
    for (const node of rule.nodes) {
      expect(node.source?.start, node.toString()).toMatchObject({ line: 2, column: 3 })
    }
    rule.walkDecls('display', (decl) => {
      expect(decl.source?.start).toMatchObject({ line: 2, column: 3 })
    })
  })

  it('the text expander maps color to its own line and display to the directive line', async () => {
    const { css: output, map } = expandText(css, { from: 'a.css' })
    const consumer = await new SourceMapConsumer(map)
    const positionOf = (needle: string): { column: number; line: number } => {
      const before = output.slice(0, output.indexOf(needle))
      const lines = before.split('\n')
      return { line: lines.length, column: lines.at(-1)!.length }
    }

    expect(consumer.originalPositionFor(positionOf('color'))).toMatchObject({ line: 3, column: 2 })
    expect(consumer.originalPositionFor(positionOf('display'))).toMatchObject({
      line: 2,
      column: 2,
    })
    consumer.destroy()
  })
})

describe.each([
  ['the PostCSS host', (css: string) => viaPostcss(css)],
  ['the text expander', (css: string) => Promise.resolve(viaText(css))],
  ['the Lightning CSS adapter', (css: string) => Promise.resolve(viaLightning(css))],
])('AC-native-apply-order-45 — a last declaration with no semicolon (%s)', (_name, run) => {
  it.each([
    '.x { @nave focusRing; color: red }',
    '.x { @nave hideDesktopUp; display: grid }',
    '.x { @nave hideDesktopUp focusRing; color: red }',
    '.x { @nave srOnlyFocusable; color: red }',
    '.x { @nave focusRing; color: red /* c */ }',
    '.x { @nave focusRing; color: red !important }',
    '.x { color: red; @nave hideDesktopUp }',
    '.x { @nave hideDesktopUp }',
    '.x { @nave focusRing; &:hover { color: blue } color: red }',
  ])('%s keeps every declaration whole', async (input) => {
    const output = await run(input)
    const expected = await viaPostcss(input)

    postcss.parse(output).walkDecls((decl) => {
      expect(decl.value).not.toMatch(/[{&]|@media/)
    })
    expect(isEquivalent(output, expected)).toBe(true)
  })
})

describe.each(LEG)('AC-native-apply-order-45 — an unclosed input (%s)', (_name, run) => {
  it('expands the same as the PostCSS host does once closed', async () => {
    const input = '.x { @nave focusRing; color: red'
    const expected = await viaPostcss(closed(input))
    const actual = closed(run(input))

    expect(isEquivalent(actual, expected)).toBe(true)
  })
})
