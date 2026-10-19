/**
 * AC-native-apply-order-16 and AC-native-apply-order-25: how the PostCSS host walks a rule and the
 * rules nested in it. Every directive is expanded however a plugin ahead moves the rules around
 * it, a rule inside a group inside a rule is expanded, a directive a group refuses does not hold
 * the rule back, and the warnings of a whole tree come in source order, as the text expander
 * reports them.
 */
import postcss, { type Plugin } from 'postcss'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'
import { warningsViaPostcss, warningsViaText } from './helpers/native-order.ts'

/**
 * A plugin that hoists a nested rule next to its parent when it visits the nested rule itself,
 * after the directives of the parent have been visited.
 */
const hoist = (): Plugin => ({
  postcssPlugin: 'hoist',
  Rule(rule) {
    const parent = rule.parent
    if (parent?.type !== 'rule') return
    rule.selector = parent.selector + rule.selector.replace(/^&/, '')
    parent.after(rule)
  },
})
hoist.postcss = true

/**
 * A plugin that rewrites the atom `rewriteMe` to `flex` when it visits the directive that names it.
 */
const rewrite = (): Plugin => ({
  postcssPlugin: 'rewrite',
  AtRule(atRule) {
    if (atRule.name === 'nave' && atRule.params === 'rewriteMe') atRule.params = 'flex'
  },
})
rewrite.postcss = true

/**
 * What the PostCSS host makes of `css` behind `plugins`.
 */
async function expanded(css: string, plugins: Plugin[] = []): Promise<postcss.Result> {
  return await postcss([...plugins, navePlugin({ onUnknown: 'warn' })]).process(css, {
    from: 'x.css',
  })
}

describe('AC-native-apply-order-16 — every directive is expanded, wherever a plugin moves its rule', () => {
  it('expands the outer directive when a plugin ahead hoists the nested rule after it was visited', async () => {
    const result = await expanded('.x { @nave grid flex; &.m { @nave textLeft } }', [hoist()])

    const { css } = result
    expect(css).not.toContain('@nave')
    expect(css).toMatch(/\.x \{\s*display: grid;\s*display: flex/)
    expect(css).toMatch(/\.x\.m \{\s*text-align: left/)
    expect(result.warnings()).toEqual([])
  })

  it('expands a directive in a rule written before the nested rule (control)', async () => {
    const { css } = await expanded('.x { &.m { @nave textLeft } @nave grid flex; }', [hoist()])

    expect(css).not.toContain('@nave')
  })

  it.each([
    [
      'a deeper rule does not expand the tree before a later outer directive is visited',
      '.a { .b { @nave grid } @nave rewriteMe }',
      /\.b \{\s*display: grid/,
    ],
    [
      'a rule inside a group inside the rule holds a directive the outer rule waits for',
      '.a { @nave grid; @media (m) { .b { @nave rewriteMe } } }',
      /\.b \{\s*display: flex/,
    ],
    [
      'a rule inside a group inside a rule is expanded',
      '.a { @media (x) { .b { @nave flex } } }',
      /\.a \{\s*@media \(x\) \{\s*\.b \{\s*display: flex/,
    ],
    [
      "a rule inside a group is expanded beside the rule's own directive",
      '.a { @nave flex; @media (x) { .b { @nave grid } } }',
      /\.b \{\s*display: grid/,
    ],
    [
      'a directive a group refuses does not hold the rule back',
      '.x { @nave flex; @media (x) { @nave grid } }',
      /\.x \{\s*display: flex/,
    ],
  ])('%s', async (_name, css, expected) => {
    const result = await expanded(css, [rewrite()])

    expect(result.css).toMatch(expected)
    expect(result.warnings().filter((w) => w.text.includes('rewriteMe'))).toEqual([])
  })
})

describe('AC-native-apply-order-25 — a tree of rules reports its warnings in source order', () => {
  it.each([
    [
      '.x { @nave hideDesktopUp; &:hover { @nave hidePhoneOnly flex } &:focus { @nave hidePhoneOnly block } }',
      [57, 94],
    ],
    ['.x { &:hover { @nave hidePhoneOnly block } @nave hideDesktopUp flex; }', [36, 64]],
    ['.x { @nave hideDesktopUp flex; &:hover { @nave hidePhoneOnly block } }', [26, 62]],
  ])('%s', async (css, columns) => {
    const viaPostcss = await warningsViaPostcss(css)
    const viaText = warningsViaText(css)

    expect(viaText.map((w) => w.column)).toEqual(columns)
    expect(viaPostcss).toEqual(viaText)
  })
})
