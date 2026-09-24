/**
 * `text-size-adjust: none` shipped with the comment "prevent font size inflation on iOS
 * Safari orientation change", but iOS Safari reads only the `-webkit-` prefixed property
 * (BCD: safari/firefox NO, safari_ios YES with `-webkit-` only) — the rule was inert on the
 * one browser it names. The value change from `none` to `100%` is a convention alignment, not
 * a behaviour change: the CSS specification states that `text-size-adjust: 100%` is equivalent
 * to `text-size-adjust: none`. This test pins one real fix (the prefix) and one convention (the
 * value every major reset uses). It is not asserting that `100%` behaves differently.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const resetCssSrc = readFileSync(path.resolve(HERE, '../src/reset.css'), 'utf8')
// The doc comment above the html rule now discusses the none/100% equivalence in prose
// (quoting both forms to explain why the value changed), so a plain substring/regex check
// against the whole file would match that PROSE rather than an actual declaration. Strip CSS
// comments first, the same way consumer-path.test.ts does, so these assertions only see real
// declarations.
const resetCssDeclarationsOnly = resetCssSrc.replaceAll(/\/\*[\s\S]*?\*\//g, '')

describe('reset text-size-adjust', () => {
  it('declares both the -webkit- prefixed and unprefixed property, valued 100%, never none', () => {
    expect(resetCssDeclarationsOnly).toMatch(/-webkit-text-size-adjust:\s*100%/)
    expect(resetCssDeclarationsOnly).toMatch(/(?<!-webkit-)text-size-adjust:\s*100%/)
    expect(resetCssDeclarationsOnly).not.toMatch(/text-size-adjust:\s*none/)
  })

  it('text-rendering no longer shares the font-size-inflation comment number with text-size-adjust', () => {
    const htmlBlock = resetCssSrc.slice(
      resetCssSrc.indexOf('html {'),
      resetCssSrc.indexOf('}', resetCssSrc.indexOf('html {')),
    )
    const textRenderingLine = htmlBlock.split('\n').find((line) => line.includes('text-rendering'))
    const textSizeAdjustLines = htmlBlock
      .split('\n')
      .filter((line) => line.includes('text-size-adjust'))
    expect(textRenderingLine).toBeDefined()
    expect(textSizeAdjustLines).toHaveLength(2)
    const numberOf = (line: string | undefined) => line?.match(/\/\*\s*(\d+)\s*\*\//)?.[1]
    expect(numberOf(textRenderingLine)).not.toBe(numberOf(textSizeAdjustLines[0]))
    // both text-size-adjust declarations (webkit + standard) still carry the same number
    expect(numberOf(textSizeAdjustLines[0])).toBe(numberOf(textSizeAdjustLines[1]))
  })
})
