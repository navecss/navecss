/**
 * The build against core's expansion order: every rule of the stylesheet is `.x { @nave role
 * [focusRing]; }`, so the order check meets each role atom alone or beside `focusRing`, and the
 * stylesheet must build without it reporting anything.
 */
import type { AtomDefinition } from '@navecss/core/atoms'
import type { Warning } from 'postcss'

import { navePlugin } from '@navecss/core/postcss'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { buildStylesResult } from '../scripts/build-styles.ts'
import { atoms } from '../styles/atoms.ts'
import { DRAFTS } from '../styles/drafts.ts'
import { allStates } from './support/draft-states.ts'
import { allStatesFeedback } from './support/feedback-states.ts'

const warningsOf = async (
  css: string,
  extend: Record<string, AtomDefinition>,
): Promise<Warning[]> => {
  const result = await postcss([navePlugin({ extend })]).process(css, { from: undefined })
  return result.warnings()
}

/**
 * Every block of an atom as an atom of its own, in the order the atom's rule renders them: its
 * pseudo blocks, then its `@media` blocks, then its `@container` blocks. A directive naming these
 * one after the other puts each block beside the others of the same atom, which the check never
 * compares, so what it reports then is what a check that also compared them would report.
 */
const blocksAsAtoms = (name: string, atom: AtomDefinition): Record<string, AtomDefinition> => {
  const blocks: AtomDefinition[] = [
    ...Object.entries(atom.pseudos ?? {}).map(([key, value]) => ({
      declarations: {},
      pseudos: { [key]: value },
    })),
    ...Object.entries(atom.media ?? {}).map(([key, value]) => ({
      declarations: {},
      media: { [key]: value },
    })),
    ...Object.entries(atom.container ?? {}).map(([key, value]) => ({
      declarations: {},
      container: { [key]: value },
    })),
  ]
  return Object.fromEntries(blocks.map((block, index) => [`${name}Block${index}`, block]))
}

describe('AC-native-apply-order-42: the stylesheet builds with no order warning', () => {
  const unsignedStates = [
    ...allStates(),
    ...allStatesFeedback(),
    [...DRAFTS],
  ] as (typeof DRAFTS)[number][][]

  it('reports nothing for the shipping build', async () => {
    const result = await buildStylesResult()

    expect(result.css).toContain('.nave-base-ui-button')
    expect(result.warnings().map(({ text }) => text)).toEqual([])
  })

  it('reports nothing for any state of the overlay drafts, of the feedback drafts, or for all ten unsigned', async () => {
    expect(unsignedStates).toHaveLength(64 + 16 + 1)

    const reported: string[] = []
    for (const unsigned of unsignedStates) {
      const result = await buildStylesResult({ unsigned })
      reported.push(...result.warnings().map(({ text }) => `${unsigned.join('+')}: ${text}`))
    }

    expect(reported).toEqual([])
  })

  it('reports a role atom whose media block a later atom overrides (control)', async () => {
    const zProbe: AtomDefinition = {
      declarations: {},
      media: { '(width >= 75em)': { declarations: { display: 'none' } } },
    }
    const warnings = await warningsOf('.x { @nave zProbe flex; }', { zProbe })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.text).toContain('"flex" comes after "zProbe"')
    expect(await warningsOf('.x { @nave flex zProbe; }', { zProbe })).toHaveLength(0)
  })
})

describe("AC-native-apply-order-47: an atom's own blocks are never compared, and the stylesheet shows why", () => {
  const checked = Object.entries(atoms)
    .map(([name, atom]) => ({ name, extend: blocksAsAtoms(name, atom) }))
    .filter(({ extend }) => Object.keys(extend).length > 0)

  const ownBlockWarnings = async (
    name: string,
    extend: Record<string, AtomDefinition>,
  ): Promise<string[]> => {
    const directive = Object.keys(extend).join(' ')
    const list = await warningsOf(`.x { @nave ${directive}; }`, extend)
    return list.map(({ text }) => `${name}: ${text}`)
  }

  it('reports at least 21 pairs once the blocks of each atom are named as separate atoms (control)', async () => {
    const reported: string[] = []
    for (const { name, extend } of checked) reported.push(...(await ownBlockWarnings(name, extend)))

    expect(reported.length).toBeGreaterThanOrEqual(21)
  })

  it("reports six pairs among baseUiArrow's four data-side blocks, on rotate (control)", async () => {
    const arrow = checked.find(({ name }) => name === 'baseUiArrow')
    const reported = await ownBlockWarnings('baseUiArrow', arrow?.extend ?? {})
    const onRotate = reported.filter((text) => text.includes('rotate'))

    expect(onRotate).toHaveLength(6)
  })

  it('reports nothing when the same atoms are named whole, as the stylesheet names them', async () => {
    const reported: string[] = []
    for (const [name, atom] of Object.entries(atoms)) {
      const list = await warningsOf(`.x { @nave ${name}; }`, { [name]: atom })
      reported.push(...list.map(({ text }) => `${name}: ${text}`))
    }

    expect(reported).toEqual([])
  })
})
