/**
 * AC-native-apply-order-36 and AC-native-apply-order-37: the record of the decision. ADR 0011
 * holds the full reasoning and no private reference, and ADR 0001, ADR 0006 and the index point at
 * it.
 */
import { describe, expect, it } from 'vitest'

import { MIGRATION_VERSION } from '../src/directive/migration.ts'
import { scanForBrainReferences, syntheticDatedId } from './helpers/brain-reference-scan.ts'
import {
  adrRecord,
  fold,
  foldedDigest,
  placeholdersIn,
  readRepo,
  RELEASE_DATE,
} from './helpers/native-order-docs.ts'

const TITLE =
  '`@nave` expands each atom in place, in native `@apply` order, and reports where that order lets later content win'

/**
 * The folded digest of the correction ADR 0006 holds, the date and the release filled.
 */
const ADR_0006_CORRECTION = '9474c6840eeda7940fb8a43770459e11c0c4a6577559434962b9f936ec62baa7'

const adr = adrRecord('0011')

/**
 * The decisions the record states, each by the words that open it and a phrase it must hold.
 */
const DECISIONS = [
  { lead: '**1. Placement.**', holds: 'is appended to the end of the rule' },
  { lead: '**2. Wrapping', holds: 'mixed-specificity list' },
  { lead: '**3. The order warning', holds: 'never through `onUnknown`' },
  { lead: '**4. The opt-out', holds: 'inside the directive' },
  { lead: '**5. The host limitation', holds: "css.transformer: 'lightningcss'" },
  { lead: '**6. The first minor', holds: 'removal' },
  { lead: '**7. What the browser test proves', holds: 'current' },
] as const

/**
 * The text of one decision: from its lead to the next decision or the next section.
 */
function decisionText(lead: string): string {
  const start = adr.text.indexOf(lead)
  expect(start, `ADR 0011 has no decision ${lead}`).toBeGreaterThanOrEqual(0)
  const rest = adr.text.slice(start + lead.length)
  const end = rest.search(/\n\*\*\d\. |\n## /)
  return fold(end === -1 ? rest : rest.slice(0, end))
}

describe('AC-native-apply-order-36: ADR 0011 holds the full reasoning', () => {
  it('has the title, the status and the supersession of decision 1 of ADR 0001', () => {
    expect(adr.file).toMatch(/^0011-[a-z0-9-]+\.md$/)
    expect(adr.text).toContain(`# 0011 — ${TITLE}`)
    expect(adr.text).toMatch(/^- \*\*Status:\*\* accepted$/m)
    expect(fold(adr.text)).toMatch(
      /supersedes decision 1 of \[ADR 0001\]\(0001-native-css-nesting\.md\)/,
    )
  })

  it.each(DECISIONS)('states the decision $lead', ({ lead, holds }) => {
    expect(decisionText(lead)).toContain(holds)
  })

  it('states the two divergences from native order under wrapping, and why it wraps', () => {
    const wrapping = decisionText('**2. Wrapping')

    expect(wrapping).toMatch(/selector list/)
    expect(wrapping).toMatch(/pseudo-element/)
    expect(wrapping).toMatch(/Chrome and Edge 125, Firefox 128/)
  })

  it('defines the warning, keeps it out of onUnknown and refuses a global switch with the reason', () => {
    const warning = decisionText('**3. The order warning')

    expect(warning).toMatch(/same element/)
    expect(warning).toMatch(/never fails/)
    expect(warning).toMatch(/no option turns it off/i)
    expect(warning).toMatch(/because/)
  })

  it('says why the marker lives in the prelude, the one position every measured host keeps', () => {
    const optOut = decisionText('**4. The opt-out')

    expect(optOut).toContain('nave-allow-override')
    expect(optOut).toMatch(/every measured host/)
  })

  it('says the browser test proves the emitted CSS in current engines, not the floor', () => {
    const browser = decisionText('**7. What the browser test proves')

    expect(browser).toMatch(/Chromium, Firefox and WebKit/)
    expect(browser).toMatch(/not the floor/)
  })

  it('names alternatives considered and consequences, base-ui included', () => {
    expect(adr.text).toMatch(/^## Alternatives considered$/m)
    expect(adr.text).toMatch(/^## Consequences$/m)
    const consequences = fold(adr.text.slice(adr.text.indexOf('## Consequences')))

    expect(consequences).toMatch(/@navecss\/base-ui/)
    expect(consequences).toMatch(/bytes change/)
    expect(consequences).toMatch(/no computed value/)
  })

  it('carries no private reference, slot or placeholder', () => {
    scanForBrainReferences(adr.text, adr.file)

    expect(placeholdersIn(adr.text)).toEqual([])
    expect(adr.text).not.toMatch(/\b(round|gate)\b/i)
    expect(adr.text).not.toMatch(/cleared by/i)
  })

  it('control: the scan reds on a planted private id', () => {
    expect(() =>
      scanForBrainReferences(`${adr.text}\nSee ${syntheticDatedId()}.`, adr.file),
    ).toThrow()
  })
})

describe('AC-native-apply-order-37: ADR 0001, ADR 0006 and the index point at 0011', () => {
  const first = adrRecord('0001')
  const sixth = adrRecord('0006')
  const dated = `**Correction (${RELEASE_DATE}):**`

  /**
   * The bullet of a record that opens with `dated` and follows `anchor`.
   */
  function bulletAfter(text: string, anchor: string): string {
    const from = text.indexOf(anchor)
    expect(from, `no "${anchor}"`).toBeGreaterThanOrEqual(0)
    const start = text.indexOf(dated, from)
    expect(start, `no ${dated} after "${anchor}"`).toBeGreaterThan(from)
    const rest = text.slice(start)
    const end = rest.search(/\n\n|\n\s*- |\n\d+\. /)
    return fold(`- ${end === -1 ? rest : rest.slice(0, end)}`)
  }

  it('ADR 0001 has a dated line under decision 1 naming ADR 0011 and the release', () => {
    const line = bulletAfter(first.text, '1. `@nave` emits **native CSS nesting**')

    expect(line).toContain('[ADR 0011](0011-')
    expect(line).toContain(MIGRATION_VERSION)
    expect(first.text.indexOf(dated)).toBeLessThan(first.text.indexOf('2. `scripts/build-css.ts`'))
  })

  it('ADR 0001 has a dated line under its consequence on nested rules authored before a directive', () => {
    const line = bulletAfter(first.text, 'Consumer nested rules authored _before_')

    expect(line).toContain('[ADR 0011](0011-')
    expect(line).toContain(MIGRATION_VERSION)
  })

  it('ADR 0001 keeps its own status', () => {
    expect(first.text).toMatch(/^- \*\*Status:\*\* accepted$/m)
  })

  it('ADR 0006 holds the correction under its mapping table, date and release filled', () => {
    const correction = bulletAfter(sixth.text, '| A consumer atom passed to the plugin')

    expect(correction.startsWith(`- ${dated} before \`@navecss/core\` ${MIGRATION_VERSION},`)).toBe(
      true,
    )
    expect(correction.endsWith('See ADR 0011.')).toBe(true)
    expect(placeholdersIn(correction)).toEqual([])
    expect(foldedDigest(correction)).toBe(ADR_0006_CORRECTION)
  })

  it('the index lists 0011 and marks decision 1 of 0001 superseded by it', () => {
    const index = readRepo('docs/04-adr/index.md')
    const row = (number: string): string =>
      index.split('\n').find((line) => line.startsWith(`| [${number}]`)) ?? ''

    expect(row('0011')).toContain(`(${adr.file})`)
    expect(row('0011')).toContain(TITLE)
    expect(row('0011')).toMatch(/\| accepted\s+\|$/)
    expect(row('0001')).toMatch(/accepted; decision 1 superseded by \[0011\]\(0011-/)
  })

  it('none of the added lines holds a private reference or placeholder', () => {
    for (const record of [first, sixth]) {
      const lines = record.text.split('\n').filter((line) => line.includes(RELEASE_DATE))
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        scanForBrainReferences(line, record.file)
        expect(placeholdersIn(line)).toEqual([])
      }
    }
    scanForBrainReferences(readRepo('docs/04-adr/index.md'), 'index.md')
  })
})
