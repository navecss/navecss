import path from 'node:path'
/**
 * AC-native-apply-order-38, -41 and -36: the copy that names focus is cleared copy, one unit at a
 * time, and each unit is registered here by the digest of its whitespace-folded text, as the
 * cleared units of the Vite setup are (`vite-used-atoms-docs.test.ts`): never a second copy of the
 * words, so a changed word fails and a re-wrapped line does not. A red run means the text moved:
 * the change needs the same clearance the words had, not a recomputed digest.
 *
 * The units are the README's focus sentences, the README's sentence on the Lightning CSS
 * transformer, the two changeset paragraphs on focus, the two clauses the warning prints (ring and
 * reveal), and the paragraph of ADR 0011 on the same transformer.
 */
import { describe, expect, it } from 'vitest'

import { REVEAL_CLAUSE, RING_CLAUSE } from '../src/directive/order-focus.ts'
import { readCoreReadme, readmeSection } from './helpers/astro-readme.ts'
import {
  adrRecord,
  CHANGELOG_PATH,
  CHANGESET_DIR,
  fold,
  foldedDigest,
  withoutCodeSpans,
} from './helpers/native-order-docs.ts'
import { shippedChangesetProse } from './helpers/released-changeset.ts'

const PINS = {
  readmeFocus: '5d97e633f5f1713d9fad8de0ae13fb32273c80373382ccb0bf254a1ac6a00e72',
  readmeLightning: '94c26c80ef4eaca2f192519e9dcfbbd8c9344ac374fe263a51de8b1bddaed609',
  changesetFocus: 'b2c7f62d2751b09c65c6f8954d67a32a337c080bee0fac5d9a71b8241cb81c70',
  changesetLightning: 'c4d7f88d6f202db5fd8674959cc2e417c887882b1352f4a1072dbc8f98ed2ee9',
  ringClause: '78f58b3acc9de1bbeabce8017f6fb090aa1920f079132b3aac81ed8abd01011e',
  revealClause: '0e0ac2bebb7f58542f6daa27bdea5af9ddb6693735fc1f6fff4b13935054640a',
  adrHostLimitation: '2415d9249607e6ce00c461731d4e274aecffa02cb8760fd0ab0c6cc885075bac',
} as const

const changed = (unit: string): string =>
  `the cleared copy "${unit}" changed: a changed word needs the same review the words had, so do not recompute this digest`

const ACCESSIBILITY_WORDS =
  /screen.?reader|accessib|assistive|a11y|visually.?hidden|keyboard|focus|\bring\b|skip link/i

/**
 * The paragraph of `markdown` that starts with `opening`, up to the next blank line.
 */
function paragraphStarting(markdown: string, opening: string): string {
  const start = markdown.indexOf(opening)
  expect(start, `no paragraph starts "${opening.slice(0, 50)}"`).toBeGreaterThanOrEqual(0)
  const end = markdown.indexOf('\n\n', start)
  return markdown.slice(start, end === -1 ? undefined : end)
}

/**
 * The sentence of the folded `text` that starts with `opening` and ends with `ending`.
 */
function sentenceBetween(text: string, opening: string, ending: string): string {
  const start = fold(text).indexOf(opening)
  expect(start, `no sentence starts "${opening.slice(0, 50)}"`).toBeGreaterThanOrEqual(0)
  const rest = fold(text).slice(start)
  const end = rest.indexOf(ending)
  expect(end, `no sentence ends "${ending}"`).toBeGreaterThan(0)
  return rest.slice(0, end + ending.length)
}

const CHANGESET = {
  path: path.join(CHANGESET_DIR, 'nave-expands-in-native-order.md'),
  entryStart: '`@nave` now expands in the order CSS mixins will apply it',
}

const FOCUS_OPENING = 'The same order applies to the focus atoms.'
const LIGHTNING_OPENING = 'What a rule says after a directive becomes a rule of its own'
const CHANGESET_FOCUS_OPENING = 'This includes focus styles.'
const CHANGESET_LIGHTNING_OPENING = "With Vite's `css.transformer: 'lightningcss'` at targets below"

/**
 * The README section the order adds, as it is written.
 */
function orderSection(): string {
  return readmeSection('#### Order inside a rule', readCoreReadme())
}

/**
 * The paragraphs of the core changeset (pending, or released), each folded.
 */
function changesetParagraphs(): string[] {
  const text = shippedChangesetProse(CHANGESET.path, CHANGELOG_PATH, CHANGESET.entryStart)
  return text.split(/\n\s*\n/).map((paragraph) => fold(paragraph))
}

/**
 * The changeset paragraph that starts with `opening`.
 */
function changesetParagraph(opening: string): string {
  const found = changesetParagraphs().find((paragraph) => paragraph.startsWith(opening))
  expect(found, `no changeset paragraph starts "${opening}"`).toBeDefined()
  return found!
}

describe('AC-native-apply-order-38: the README focus sentences and the Lightning CSS sentence are cleared units', () => {
  it('holds the focus sentences as they were cleared', () => {
    const paragraph = paragraphStarting(orderSection(), FOCUS_OPENING)

    expect(foldedDigest(paragraph), changed('readmeFocus')).toBe(PINS.readmeFocus)
  })

  it('holds the sentence on the Lightning CSS transformer as it was cleared', () => {
    const setup = readmeSection('### Vite plugin setup', readCoreReadme())
    const sentence = sentenceBetween(setup, LIGHTNING_OPENING, 'with no message.')

    expect(foldedDigest(sentence), changed('readmeLightning')).toBe(PINS.readmeLightning)
  })

  it('ships the two together or neither', () => {
    const readme = fold(readCoreReadme())

    expect(readme.includes(FOCUS_OPENING)).toBe(readme.includes(LIGHTNING_OPENING))
  })

  it('names focus, the ring or a skip link in the section only inside the cleared focus paragraph', () => {
    const section = fold(orderSection())
    const cleared = fold(paragraphStarting(orderSection(), FOCUS_OPENING))
    const outside = withoutCodeSpans(section.replace(cleared, ''))

    expect(outside).not.toMatch(ACCESSIBILITY_WORDS)
  })

  it('control: the guard reds on the section with the cleared paragraph left in, and on a planted sentence', () => {
    const prose = withoutCodeSpans(fold(orderSection()))

    expect(prose).toMatch(ACCESSIBILITY_WORDS)
    expect(`${prose} Keep the ring visible.`).toMatch(ACCESSIBILITY_WORDS)
  })
})

describe('AC-native-apply-order-41: the changeset paragraphs on focus are cleared units', () => {
  it('holds the first paragraph on focus as it was cleared', () => {
    const paragraph = changesetParagraph(CHANGESET_FOCUS_OPENING)

    expect(foldedDigest(paragraph), changed('changesetFocus')).toBe(PINS.changesetFocus)
  })

  it('holds the paragraph on the Lightning CSS transformer as it was cleared, wherever it sits', () => {
    const paragraph = changesetParagraph(CHANGESET_LIGHTNING_OPENING)

    expect(foldedDigest(paragraph), changed('changesetLightning')).toBe(PINS.changesetLightning)
  })

  it('names focus, the ring or a skip link in the changeset only inside those paragraphs', () => {
    const cleared = [
      changesetParagraph(CHANGESET_FOCUS_OPENING),
      changesetParagraph(CHANGESET_LIGHTNING_OPENING),
    ]
    const outside = changesetParagraphs().filter((paragraph) => !cleared.includes(paragraph))

    expect(withoutCodeSpans(outside.join(' '))).not.toMatch(ACCESSIBILITY_WORDS)
    expect(withoutCodeSpans(cleared.join(' '))).toMatch(ACCESSIBILITY_WORDS)
  })
})

describe('AC-native-apply-order-36: the clauses the warning prints and the host limitation are cleared units', () => {
  it('holds the ring clause as it was cleared', () => {
    expect(foldedDigest(RING_CLAUSE), changed('ringClause')).toBe(PINS.ringClause)
  })

  it('holds the reveal clause as it was cleared', () => {
    expect(foldedDigest(REVEAL_CLAUSE), changed('revealClause')).toBe(PINS.revealClause)
  })

  it('holds the paragraph of ADR 0011 on the Lightning CSS transformer as it was cleared', () => {
    const opening =
      "Under Vite's `css.transformer: 'lightningcss'` at targets below the browser floor"
    const paragraph = paragraphStarting(adrRecord('0011').text, opening)

    expect(foldedDigest(paragraph), changed('adrHostLimitation')).toBe(PINS.adrHostLimitation)
  })
})
