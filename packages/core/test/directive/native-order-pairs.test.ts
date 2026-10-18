/**
 * Which pairs of built-in atoms the order check reports: the 22 whose later declaration wins a
 * cascade the earlier atom's `@media` block used to win, and none of the 10 pseudo-keyed or 6
 * same-value pairs, in the three shapes a pair is written (one directive, two directives, an atom
 * and the rule's own declaration).
 */
import { describe, expect, it } from 'vitest'

import { type AtomName, atoms } from '../../src/atoms.ts'
import { longhandsOf, propertiesRelate } from '../../src/directive/property-relations.ts'
import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

type Row = readonly [a: string, b: string, property: string, later: string]

const HIDERS = [
  'hidePhoneOnly',
  'hideTabletPortraitUp',
  'hideTabletLandscapeUp',
  'hideDesktopUp',
] as const
const DISPLAYS = [
  ['flex', 'flex'],
  ['inlineFlex', 'inline-flex'],
  ['grid', 'grid'],
  ['block', 'block'],
  ['inlineBlock', 'inline-block'],
] as const

const WARNING_ROWS: readonly Row[] = [
  ...HIDERS.flatMap((hider) =>
    DISPLAYS.map(([atom, value]): Row => [hider, atom, 'display', value]),
  ),
  ['wFullPhoneOnly', 'srOnly', 'width', '1px'],
  ['wFullPhoneOnly', 'srOnlyFocusable', 'width', '1px'],
]

const PSEUDO_KEYED: readonly (readonly [string, string])[] = [
  ...['relative', 'absolute', 'wFull', 'hFull', 'truncate', 'srOnly', 'noWrap'].map(
    (b) => ['srOnlyFocusable', b] as const,
  ),
  ['srOnlyFocusable', 'overflowHidden'],
  ['srOnlyFocusable', 'overflowAuto'],
  ['disabledState', 'border'],
]

const SAME_VALUE: readonly (readonly [string, string])[] = [
  ...HIDERS.map((hider) => [hider, 'hidden'] as const),
  ['stackPhoneOnly', 'flexCol'],
  ['wFullPhoneOnly', 'wFull'],
]

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss],
  ['the text expander', (css: string) => Promise.resolve(warningsViaText(css))],
] as const

/**
 * The three ways a pair is written, with the column the warning is positioned at.
 */
function shapesOf(row: Row): readonly (readonly [string, string, number])[] {
  const [a, b, property, later] = row
  const pair = `.x { @nave ${a} ${b}; }`
  const two = `.x { @nave ${a}; @nave ${b}; }`
  const own = `.x { @nave ${a}; ${property}: ${later}; }`
  return [
    ['atom pair', pair, pair.lastIndexOf(b) + 1],
    ['two directives', two, two.lastIndexOf(b) + 1],
    ['own content', own, own.indexOf(`${property}:`) + 1],
  ]
}

describe.each(HOSTS)('AC-native-apply-order-10 — the 22 pairs warn once (%s)', (_name, run) => {
  it.each(WARNING_ROWS.flatMap((row) => shapesOf(row).map((shape) => ({ row, shape }))))(
    '$row.0 then $row.1 as $shape.0',
    async ({ shape }) => {
      const [, css, column] = shape
      const warnings = await run(css)

      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ line: 1, column })
    },
  )
})

describe.each(HOSTS)('AC-native-apply-order-11 — no warning (%s)', (_name, run) => {
  it.each<readonly [string, string]>([
    ...PSEUDO_KEYED,
    ...SAME_VALUE,
    ['srOnlyFocusable', 'breakWord'],
  ])('%s then %s', async (a, b) => {
    expect(await run(`.x { @nave ${a} ${b}; }`)).toEqual([])
    expect(await run(`.x { @nave ${a}; @nave ${b}; }`)).toEqual([])
  })
})

const NAMES = Object.keys(atoms) as AtomName[]

/**
 * Every ordered pair of distinct built-in atoms.
 */
const ORDERED_PAIRS: readonly (readonly [AtomName, AtomName])[] = NAMES.flatMap((a) =>
  NAMES.filter((b) => b !== a).map((b): readonly [AtomName, AtomName] => [a, b]),
)

/**
 * Compares two strings, for sorting a list of pair names.
 */
function byText(a: string, b: string): number {
  return a.localeCompare(b)
}

describe('AC-native-apply-order-12 — over every ordered pair of built-ins', () => {
  it('warns on exactly the 22 pairs, one warning each', () => {
    const warned = ORDERED_PAIRS.map(([a, b]) => ({
      count: warningsViaText(`.x { @nave ${a} ${b}; }`).length,
      name: `${a} ${b}`,
    }))
      .filter(({ count }) => count > 0)
      .map(({ count, name }) => `${name}:${count}`)

    expect(warned.toSorted(byText)).toEqual(
      WARNING_ROWS.map(([a, b]) => `${a} ${b}:1`).toSorted(byText),
    )
  })

  it('relates a block of a to a declaration of b for exactly the 38 pairs of the other rows', () => {
    const related = ORDERED_PAIRS.filter(([a, b]) =>
      blockPropertiesOf(a).some((p) => ownPropertiesOf(b).some((q) => propertiesRelate(p, q))),
    ).map(([a, b]) => `${a} ${b}`)

    const expected = [...WARNING_ROWS, ...SAME_VALUE, ...PSEUDO_KEYED].map(([a, b]) => `${a} ${b}`)
    expect(related.toSorted(byText)).toEqual(expected.toSorted(byText))
    expect(related).toHaveLength(38)
    expect(longhandsOf('overflow')).not.toContain('overflow-wrap')
  })

  it('reds when a scratch atom copying display: flex joins the enumeration (control)', () => {
    const extend = { zFlex: { declarations: { display: 'flex' } } }
    const gained = HIDERS.filter(
      (hider) => warningsViaText(`.x { @nave ${hider} zFlex; }`, { extend }).length === 1,
    )

    expect(gained).toEqual([...HIDERS])
  })
})

/**
 * The properties an atom's conditional blocks set.
 */
function blockPropertiesOf(name: AtomName): string[] {
  const atom = atoms[name] as {
    media?: Record<string, { declarations?: Record<string, string> }>
    pseudos?: Record<string, Record<string, string>>
  }
  const media = Object.values(atom.media ?? {}).flatMap((block) =>
    Object.keys(block.declarations ?? {}),
  )
  const pseudos = Object.values(atom.pseudos ?? {}).flatMap((block) => Object.keys(block))
  return [...media, ...pseudos]
}

/**
 * The properties an atom sets outside its conditional blocks.
 */
function ownPropertiesOf(name: AtomName): string[] {
  return Object.keys(atoms[name].declarations)
}
