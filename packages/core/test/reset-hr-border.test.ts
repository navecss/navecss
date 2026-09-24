/**
 * `hr` set only `border-top`, so Chrome's remaining UA borders (`border-bottom-width: 1px`,
 * `border-left-width: 1px`, `border-bottom-style: inset`) survived underneath the token-
 * coloured top border, rendering a three-sided grey box rather than the "single 1px line"
 * the comment promises.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const resetCssSrc = readFileSync(path.resolve(HERE, '../src/reset.css'), 'utf8')

describe('reset hr border', () => {
  it('clears the UA border on every side before re-declaring border-top', () => {
    const root = postcss.parse(resetCssSrc)
    let hrRule: postcss.Rule | undefined
    root.walkRules('hr', (rule) => {
      hrRule = rule
    })
    expect(hrRule).toBeDefined()
    const decls = hrRule!.nodes.filter((n): n is postcss.Declaration => n.type === 'decl')
    const borderIndex = decls.findIndex((d) => d.prop === 'border')
    const borderTopIndex = decls.findIndex((d) => d.prop === 'border-top')
    expect(borderIndex).toBeGreaterThanOrEqual(0)
    expect(decls[borderIndex]!.value).toBe('none')
    // border: none must come before border-top, or the shorthand wipes the token border back out
    expect(borderIndex).toBeLessThan(borderTopIndex)
  })
})
