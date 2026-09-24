/**
 * `[hidden] { display: none !important }` permanently defeats `hidden="until-found"`
 * (find-in-page reveal): the `!important` that makes `[hidden]` win over a stray
 * `display: flex`/`grid` elsewhere also makes it unfixable from any later layer, so an
 * author using `until-found` ships an element that can never be revealed.
 *
 * `hidden` is an HTML enumerated attribute, whose keywords are matched ASCII
 * case-insensitively, so `hidden="UNTIL-FOUND"` is the same until-found state as
 * `hidden="until-found"`. The exemption selector needs the `i` flag to match that.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const resetCssSrc = readFileSync(path.resolve(HERE, '../src/reset.css'), 'utf8')

describe('reset [hidden] vs hidden="until-found"', () => {
  it('exempts hidden="until-found" via a zero-specificity :where(), so find-in-page can still reveal it', () => {
    const root = postcss.parse(resetCssSrc)
    let hiddenRule: postcss.Rule | undefined
    root.walkRules((rule) => {
      if (rule.selectors.some((s) => s.startsWith('[hidden]'))) {
        hiddenRule = rule
      }
    })
    expect(hiddenRule).toBeDefined()
    expect(hiddenRule!.selector).toBe("[hidden]:where(:not([hidden='until-found' i]))")
    const display = hiddenRule!.nodes.find(
      (n): n is postcss.Declaration => n.type === 'decl' && n.prop === 'display',
    )
    expect(display?.value).toBe('none')
    expect(display?.important).toBe(true)
  })
})
