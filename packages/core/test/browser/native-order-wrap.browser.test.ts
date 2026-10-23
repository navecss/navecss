/**
 * AC-native-apply-order-34, Tier B: in Chromium at 1280px, the two fixes the mixed-specificity
 * warning prints change what the page shows, and each does what the warning says. With a rival
 * rule `.s1.k` on the element `.s1.k`, the rule written once for each selector group the warning
 * names lets the rival win, and the rule with its list written as `:is(...)` keeps the rule's
 * declarations winning at the list's highest specificity. The fixes are read out of the warning
 * the plugin prints, not typed here.
 */
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { computed, viaPostcssInPage } from './native-order-mount.ts'

interface WrapRow {
  readonly body: string
  readonly list: string
  readonly property: string
  readonly rival: string
  /**
  What the rule computes written once for each group, and with its list written as `:is()`.
   */
  readonly whenGrouped: string
  readonly whenIsList: string
}

const ROWS: readonly WrapRow[] = [
  {
    body: '@nave hideDesktopUp; color: red',
    list: '.s1, #x .s2',
    property: 'color',
    rival: '.s1.k { color: blue }',
    whenGrouped: 'rgb(0, 0, 255)',
    whenIsList: 'rgb(255, 0, 0)',
  },
  {
    body: '&:hover { color: blue } @nave flex;',
    list: '.s1, #x .s2',
    property: 'display',
    rival: '.s1.k { display: grid }',
    whenGrouped: 'grid',
    whenIsList: 'flex',
  },
]

const PLACEMENT = {
  focused: false,
  html: '<div class="s1 k">x</div>',
  selector: '.s1.k',
  width: 1280,
} as const

/**
 * The text expander's one warning for `css`.
 */
function warningOf(css: string): string {
  const { warnings } = expandText(css)
  if (warnings.length !== 1) throw new Error(`expected one warning for ${css}`)
  return warnings[0]!.text
}

/**
 * The selector groups the warning says to write the rule once for: the code spans between
 * "write the rule once for each of" and the next sentence.
 */
function groupsOf(warning: string): string[] {
  const start = warning.indexOf('write the rule once for each of ')
  const end = warning.indexOf('. To give the whole rule', start)
  if (start === -1 || end === -1) throw new Error(`no groups in: ${warning}`)
  return warning
    .slice(start, end)
    .matchAll(/`([^`]+)`/g)
    .map((match) => match[1]!)
    .toArray()
}

/**
 * The list the warning says to write the rule with: the code span after "write the list as".
 */
function listAsIs(warning: string): string {
  const match = /write the list as `([^`]+)`/.exec(warning)
  if (match === null) throw new Error(`no :is() list in: ${warning}`)
  return match[1]!
}

describe.each(ROWS)('AC-native-apply-order-34 - $list { $body }', (row) => {
  const original = `${row.list} { ${row.body} }`
  const warning = warningOf(original)

  it('as written, the rule’s declarations win over the less specific rival of its first selector', async () => {
    const css = await viaPostcssInPage(`${original} ${row.rival}`)

    expect(await computed(css, PLACEMENT, row.property)).toBe(row.whenIsList)
  })

  it('written once for each selector group the warning names, the rival wins', async () => {
    const copies = groupsOf(warning).map((group) => `${group} { ${row.body} }`)

    const css = await viaPostcssInPage(`${copies.join(' ')} ${row.rival}`)

    expect(copies).toHaveLength(2)
    expect(await computed(css, PLACEMENT, row.property)).toBe(row.whenGrouped)
  })

  it('written with the list the warning prints as :is(), the rule’s declarations win', async () => {
    const css = await viaPostcssInPage(`${listAsIs(warning)} { ${row.body} } ${row.rival}`)

    expect(await computed(css, PLACEMENT, row.property)).toBe(row.whenIsList)
  })
})
