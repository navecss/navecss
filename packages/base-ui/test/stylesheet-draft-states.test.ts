import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildStyles } from '../scripts/build-styles.ts'
import {
  allStates,
  deriveState,
  DRAFT_CLASSES,
  DRAFTS,
  listDifference,
  OPEN_GHOST_KEY,
  ruleClasses,
  sha256,
  stateKey,
  withoutOpenGhost,
  withoutRules,
} from './support/draft-states.ts'
import { buildState, buildWithoutClasses } from './support/feedback-build.ts'
import {
  allStatesFeedback,
  blockFor,
  DRAFT_CLASSES_FEEDBACK,
  DRAFTS_FEEDBACK,
  expectedSheet,
  NEW_CLASSES_FEEDBACK,
  REMOVED_BYTES_FEEDBACK,
  sheetOverlay,
  stateKeyFeedback,
  withoutRing,
} from './support/feedback-states.ts'
import { classesOf, flatten, PACKAGE_DIR } from './support/stylesheet.ts'
import { tablePClassesFor } from './support/table-p.ts'

interface StateRow {
  readonly bytes: number
  readonly sha256: string
  readonly classes: number
}

const fixture = (name: string): string =>
  readFileSync(path.join(PACKAGE_DIR, 'test/fixtures/generated', name), 'utf8')

// The all-signed stylesheet built independently of this package's atoms, and the bytes, hashes and
// class counts of all 64 signature states, each derived from it and built a second time.
const allSigned = fixture('independent-build.css')
const rows = JSON.parse(fixture('draft-states.json')) as Record<string, StateRow>

const states = allStates().map((unsigned) => [stateKey(unsigned), unsigned] as const)

// What each draft alone takes out of the all-signed stylesheet, in bytes.
const REMOVED_BYTES = {
  combobox: 3736,
  'highlight-fill': 182,
  'open-ghost': 151,
  'popup-fade': 1057,
  'tooltip-fade': 572,
  scrim: 564,
}

const byText = (a: string, b: string): number => a.localeCompare(b)

const lines = (css: string): string[] => css.split('\n')

/**
 * Whether every line of `part` is in `whole`, in the same order.
 */
const isSubsequence = (part: readonly string[], whole: readonly string[]): boolean => {
  let at = 0
  for (const line of whole) if (line === part[at]) at += 1
  return at === part.length
}

const declarationsByClass = (css: string): Map<string, unknown[][]> => {
  const byClass = new Map<string, unknown[][]>()
  for (const item of flatten(css)) {
    byClass.set(item.owner, [
      ...(byClass.get(item.owner) ?? []),
      [item.atRules, item.selectors, item.property, item.value],
    ])
  }
  return byClass
}

describe('AC-base-ui-overlay-completion-06: the expected stylesheet of every signature state is the one Appendix B counts', () => {
  it('names each of the 64 states once', () => {
    expect(states).toHaveLength(64)
    expect(new Set(states.map(([key]) => key)).size).toBe(64)
    expect(new Set(Object.keys(rows))).toEqual(new Set(states.map(([key]) => key)))
  })

  it('holds the anchors: 30,401 bytes and 65 classes all signed, 24,139 and 53 none signed', () => {
    expect(rows.none).toMatchObject({ bytes: 30_401, classes: 65 })
    expect(rows.none?.sha256.slice(0, 16)).toBe('e9b54cd0a877debe')
    expect(rows['combobox+highlight-fill+open-ghost+popup-fade+tooltip-fade+scrim']).toMatchObject({
      bytes: 24_139,
      classes: 53,
    })
  })

  it.each(states)(
    'derives the state with %s unsigned at the bytes and sha256 the table gives (a check on the expected value)',
    (key, unsigned) => {
      const derived = deriveState(allSigned, unsigned)

      expect(Buffer.byteLength(derived)).toBe(rows[key]?.bytes)
      expect(sha256(derived)).toBe(rows[key]?.sha256)
    },
  )
})

describe('AC-base-ui-overlay-completion-37 and AC-base-ui-feedback-navigation-47: each overlay signature removes exactly its own bytes and nothing else, and the feedback block comes through every overlay state unmoved', () => {
  it.each(states)(
    'builds the state with %s unsigned as the table gives it, with the feedback block appended unchanged',
    async (key, unsigned) => {
      const expected = expectedSheet(unsigned)
      const built = await buildStyles({ unsigned })

      expect(listDifference(built, expected)).toBeUndefined()
      expect(withoutRing(built).text).toBe(expected)
      expect(classesOf(built).size).toBe((rows[key]?.classes ?? 0) + 21)
      expect(classesOf(built)).toEqual(tablePClassesFor(unsigned))
      expect(withoutRing(built).text.endsWith(`${blockFor()}}\n`)).toBe(true)
    },
  )

  it.each(DRAFTS)('takes out of the all-signed stylesheet only what %s owns', (draft) => {
    const derived = deriveState(allSigned, [draft])
    const removed = ruleClasses(allSigned).filter((name) => !ruleClasses(derived).includes(name))

    expect(Buffer.byteLength(allSigned) - Buffer.byteLength(derived)).toBe(REMOVED_BYTES[draft])
    expect(new Set(removed)).toEqual(new Set(DRAFT_CLASSES[draft]))
    expect(isSubsequence(lines(derived), lines(allSigned))).toBe(true)
  })

  it('differs, with open-ghost unsigned, by exactly the open ghost key of 151 bytes in the button', async () => {
    const [signed, unsigned] = await Promise.all([
      buildStyles(),
      buildStyles({ unsigned: ['open-ghost'] }),
    ])
    const key = lines(signed).find((line) => line.startsWith(OPEN_GHOST_KEY)) ?? ''

    expect(Buffer.byteLength(`${key}\n`)).toBe(151)
    expect(unsigned).toBe(withoutOpenGhost(signed))
    expect(lines(signed).length - lines(unsigned).length).toBe(1)
  })

  it('leaves every other class of the state with combobox unsigned as it is when all are signed', async () => {
    const [signed, unsigned] = await Promise.all([
      buildStyles(),
      buildStyles({ unsigned: ['combobox'] }),
    ])
    const kept = declarationsByClass(unsigned)
    const all = declarationsByClass(signed)
    const changed = kept
      .keys()
      .filter((name) => JSON.stringify(kept.get(name)) !== JSON.stringify(all.get(name)))

    expect(kept.size).toBe(79)
    expect(changed.toArray()).toEqual([])
  })

  it('reds a combobox-unsigned build that keeps the six Combobox-only rules, in bytes and in classes (control)', () => {
    const kept = withoutRules(allSigned, DRAFT_CLASSES.combobox.slice(0, 1))

    expect(Buffer.byteLength(kept)).toBe(29_974)
    expect(classesOf(kept).size).toBe(64)
    expect(sha256(kept)).not.toBe(rows.combobox?.sha256)
    expect(classesOf(kept)).not.toEqual(tablePClassesFor(['combobox']))
    expect(listDifference(kept, deriveState(allSigned, ['combobox']))).toBeDefined()
  })

  it.each(DRAFTS.filter((draft) => draft !== 'open-ghost'))(
    'tells the all-signed list from the state without %s (control)',
    (draft) => {
      expect(listDifference(allSigned, deriveState(allSigned, [draft]))).toBeDefined()
    },
  )

  it('names the drafts the build is parameterised by: the six of overlay in the order the table lists them, and the four of feedback', async () => {
    const url = new URL('../styles/drafts.ts', import.meta.url).href
    const drafts = (await import(/* @vite-ignore */ url)) as { DRAFTS: readonly string[] }

    expect(drafts.DRAFTS.filter((name) => (DRAFTS as readonly string[]).includes(name))).toEqual([
      ...DRAFTS,
    ])
    expect(
      drafts.DRAFTS.filter((name) => (DRAFTS_FEEDBACK as readonly string[]).includes(name)),
    ).toEqual([...DRAFTS_FEEDBACK])
    expect(drafts.DRAFTS).toHaveLength(10)
  })
})

interface FeedbackRow extends StateRow {
  readonly blockBytes: number
  readonly blockSha256: string
}

interface TableFeedback {
  readonly states: Record<string, FeedbackRow>
  readonly corners: Record<string, StateRow>
  readonly fullSha256: { readonly allSigned: string; readonly allUnsigned: string }
}

// Appendix C.4, read from the spec text by a script and frozen: the sheet and block bytes, sha256
// prefixes and class counts of the 16 feedback states, and the six corners.
const tableFeedback = JSON.parse(fixture('feedback-states.json')) as TableFeedback

const statesFeedback = allStatesFeedback().map(
  (unsigned) => [stateKeyFeedback(unsigned), unsigned] as const,
)

// The section of the ring-less sheet that follows the overlay release's rules: the block and the layer's close.
const blockOf = (ringless: string): string => ringless.slice(sheetOverlay().length - 2, -2)

const bytesOf = (text: string): number => Buffer.byteLength(text)

describe('AC-base-ui-feedback-navigation-47: each feedback signature removes exactly its own bytes and nothing else', () => {
  it('names each of the 16 states once, and holds the anchors: 37,300 B and 86 classes all signed, 36,014 B and 82 none signed', () => {
    expect(statesFeedback).toHaveLength(16)
    expect(new Set(statesFeedback.map(([key]) => key)).size).toBe(16)
    expect(new Set(Object.keys(tableFeedback.states))).toEqual(
      new Set(statesFeedback.map(([key]) => key)),
    )
    expect(tableFeedback.states.none).toMatchObject({
      bytes: 37_300,
      classes: 86,
      blockBytes: 6899,
    })
    expect(tableFeedback.states.none?.sha256).toBe('5b918c4b5551f0c4')
    expect(
      tableFeedback.states['toast-placement+toast-fade+toast-limit+navigation-menu-fade'],
    ).toMatchObject({ bytes: 36_014, classes: 82, blockBytes: 5613 })
    expect(tableFeedback.fullSha256.allSigned).toBe(
      '5b918c4b5551f0c4c9d2999f11d60fd2c5132698b7b559a55a5ae93a9d146d40',
    )
    expect(tableFeedback.fullSha256.allUnsigned).toBe(
      '55f27505e308fa3a7f31423034f03b9223a62a958cd9bea37960b3e1d2b0ece5',
    )
  })

  it.each(statesFeedback)(
    'derives the state with %s unsigned at the bytes and sha256 the table gives (a check on the expected value)',
    (key, unsigned) => {
      const derived = expectedSheet([], unsigned)
      const row = tableFeedback.states[key]

      expect(bytesOf(derived)).toBe(row?.bytes)
      expect(sha256(derived).slice(0, 16)).toBe(row?.sha256)
      expect(classesOf(derived).size).toBe(row?.classes)
      expect(bytesOf(blockFor(unsigned))).toBe(row?.blockBytes)
      expect(sha256(blockFor(unsigned)).slice(0, 16)).toBe(row?.blockSha256)
    },
  )

  it.each(statesFeedback)(
    'builds the state with %s unsigned, overlay all signed, as the table gives it, focusRing left out',
    async (key, unsigned) => {
      const built = await buildState(unsigned)
      const { count, text } = withoutRing(built)
      const row = tableFeedback.states[key]

      expect(count).toBe(15)
      expect(bytesOf(text)).toBe(row?.bytes)
      expect(sha256(text).slice(0, 16)).toBe(row?.sha256)
      expect(classesOf(built).size).toBe(row?.classes)
      expect(bytesOf(blockOf(text))).toBe(row?.blockBytes)
      expect(sha256(blockOf(text)).slice(0, 16)).toBe(row?.blockSha256)
      expect(listDifference(built, expectedSheet([], unsigned))).toBeUndefined()
    },
  )

  it.each(DRAFTS_FEEDBACK)(
    'differs from the all-signed build by exactly the rule of %s: the bytes of its class and nothing else',
    async (draft) => {
      const [signed, unsigned] = await Promise.all([buildStyles(), buildState([draft])])
      const whole = withoutRing(signed).text
      const part = withoutRing(unsigned).text

      expect(bytesOf(whole) - bytesOf(part)).toBe(REMOVED_BYTES_FEEDBACK[draft])
      expect(part).toBe(withoutRules(whole, DRAFT_CLASSES_FEEDBACK[draft]))
      expect(ruleClasses(whole).filter((name) => !ruleClasses(part).includes(name))).toEqual([
        ...DRAFT_CLASSES_FEEDBACK[draft],
      ])
      expect(lines(part).length).toBeLessThan(lines(whole).length)
      expect(isSubsequence(lines(part), lines(whole))).toBe(true)
    },
  )

  it('removes 272 B with placement, 498 B with toast fade, 75 B with limit and 441 B with panel fade, and 1,286 B with all four', () => {
    expect(REMOVED_BYTES_FEEDBACK).toEqual({
      'toast-placement': 272,
      'toast-fade': 498,
      'toast-limit': 75,
      'navigation-menu-fade': 441,
    })
    expect(Object.values(REMOVED_BYTES_FEEDBACK).reduce((sum, bytes) => sum + bytes, 0)).toBe(1286)
    expect(6899 - 1286).toBe(5613)
  })

  it('takes four classes out of the block together and 21 classes in all are the block', () => {
    expect(
      DRAFTS_FEEDBACK.flatMap((draft) => DRAFT_CLASSES_FEEDBACK[draft]).every((name) =>
        NEW_CLASSES_FEEDBACK.includes(name),
      ),
    ).toBe(true)
    expect(NEW_CLASSES_FEEDBACK).toHaveLength(21)
  })

  it('names scroller ring record and unplaced alternative in no build input: their signatures move no stylesheet byte', () => {
    const inputs = [
      ...new Set([
        'scripts/build-styles.ts',
        ...readdirSync(path.join(PACKAGE_DIR, 'styles')).map((file) => `styles/${file}`),
      ]),
    ]
    const naming = inputs.filter((file) =>
      /scroller ring record|unplaced alternative/.test(
        readFileSync(path.join(PACKAGE_DIR, file), 'utf8'),
      ),
    )

    expect(inputs.length).toBeGreaterThan(10)
    expect(naming).toEqual([])
  })

  it('reds on a placement-unsigned build that keeps the rule of toast-placement, in the bytes, the hash, the class set and the list (control)', () => {
    const state = expectedSheet([], ['toast-placement'])
    const kept = expectedSheet()
    const row = tableFeedback.states['toast-placement']

    expect(bytesOf(state)).toBe(row?.bytes)
    expect(bytesOf(kept)).not.toBe(row?.bytes)
    expect(sha256(kept).slice(0, 16)).not.toBe(row?.sha256)
    expect(classesOf(kept).size).not.toBe(row?.classes)
    expect(classesOf(kept)).not.toEqual(classesOf(state))
    expect(listDifference(kept, state)).toBeDefined()
    expect(classesOf(kept).difference(classesOf(state))).toEqual(
      new Set(DRAFT_CLASSES_FEEDBACK['toast-placement']),
    )
  })

  it.each(DRAFTS_FEEDBACK.filter((draft) => draft !== 'toast-placement'))(
    'reds, for the other drafts, on a build of the state without %s that keeps its rule (control)',
    (draft) => {
      const state = expectedSheet([], [draft])
      const kept = expectedSheet()

      expect(bytesOf(kept) - bytesOf(state)).toBe(REMOVED_BYTES_FEEDBACK[draft])
      expect(listDifference(kept, state)).toBeDefined()
      expect(sha256(kept)).not.toBe(sha256(state))
    },
  )
})

// The six corners of Appendix C.4: overlay and feedback states that meet.
const ALL_OVERLAY = [...DRAFTS]
const RING_BASE_COUNT_OVERLAY_SIGNED = 15
const RING_COUNT_OVERLAY_UNSIGNED = 13

describe('AC-base-ui-feedback-navigation-47: the corners of Appendix C.4', () => {
  const corners = tableFeedback.corners

  it('holds the six corners: 30,401 B and 24,139 B for overlay alone, and the four combinations', () => {
    expect(Object.keys(corners).toSorted(byText)).toEqual([
      'overlay-signed',
      'overlay-unsigned',
      'signed+signed',
      'signed+unsigned',
      'unsigned+signed',
      'unsigned+unsigned',
    ])
    expect(corners['overlay-signed']).toEqual({
      bytes: 30_401,
      sha256: 'e9b54cd0a877debe',
      classes: 65,
    })
    expect(corners['overlay-unsigned']).toEqual({
      bytes: 24_139,
      sha256: '8161223ed921d479',
      classes: 53,
    })
    expect(corners['signed+signed']).toEqual({
      bytes: 37_300,
      sha256: '5b918c4b5551f0c4',
      classes: 86,
    })
    expect(corners['signed+unsigned']).toEqual({
      bytes: 36_014,
      sha256: '55f27505e308fa3a',
      classes: 82,
    })
    expect(corners['unsigned+signed']).toEqual({
      bytes: 31_038,
      sha256: 'd64c6e01a88e19d8',
      classes: 74,
    })
    expect(corners['unsigned+unsigned']).toEqual({
      bytes: 29_752,
      sha256: 'd6606f0202dd6576',
      classes: 70,
    })
  })

  it.each([
    ['signed+signed', [], []],
    ['signed+unsigned', [], DRAFTS_FEEDBACK],
    ['unsigned+signed', ALL_OVERLAY, []],
    ['unsigned+unsigned', ALL_OVERLAY, DRAFTS_FEEDBACK],
  ] as const)(
    'derives the corner %s at the bytes and sha256 the table gives (a check on the expected value)',
    (key, unsignedOverlay, unsignedFeedback) => {
      const derived = expectedSheet(unsignedOverlay, unsignedFeedback)

      expect({
        bytes: bytesOf(derived),
        sha256: sha256(derived).slice(0, 16),
        classes: classesOf(derived).size,
      }).toEqual(corners[key])
    },
  )

  it.each([
    ['signed+signed', [], [], RING_BASE_COUNT_OVERLAY_SIGNED],
    ['signed+unsigned', [], DRAFTS_FEEDBACK, RING_BASE_COUNT_OVERLAY_SIGNED],
    ['unsigned+signed', ALL_OVERLAY, [], RING_COUNT_OVERLAY_UNSIGNED],
    ['unsigned+unsigned', ALL_OVERLAY, DRAFTS_FEEDBACK, RING_COUNT_OVERLAY_UNSIGNED],
  ] as const)(
    'builds the corner %s as the table gives it, focusRing left out',
    async (key, unsignedOverlay, unsignedFeedback, rings) => {
      const built = await buildState([...unsignedOverlay, ...unsignedFeedback])
      const { count, text } = withoutRing(built)

      expect(count).toBe(rings)
      expect({
        bytes: bytesOf(text),
        sha256: sha256(text).slice(0, 16),
        classes: classesOf(built).size,
      }).toEqual(corners[key])
    },
  )

  it('builds overlay alone, with the 21 new classes out of the atom map, at 30,401 B e9b54cd0 and 65 classes, and its all-unsigned state at 24,139 B 8161223e and 53', async () => {
    const without = withoutRing(await buildWithoutClasses(NEW_CLASSES_FEEDBACK))
    const unsigned = deriveState(without.text, ALL_OVERLAY)

    expect({
      bytes: bytesOf(without.text),
      sha256: sha256(without.text).slice(0, 16),
      classes: classesOf(without.text).size,
    }).toEqual(corners['overlay-signed'])
    expect({
      bytes: bytesOf(unsigned),
      sha256: sha256(unsigned).slice(0, 16),
      classes: classesOf(unsigned).size,
    }).toEqual(corners['overlay-unsigned'])
  })

  it('composes the overlay sheet of every one of its 64 states with the whole block, byte for byte, in the table', () => {
    const block = blockFor()
    const composed = states.map(([, unsigned]) => expectedSheet(unsigned))

    expect(composed.every((sheet) => sheet.endsWith(`${block}}\n`))).toBe(true)
    expect(
      composed.map(
        (sheet, index) =>
          bytesOf(sheet) - bytesOf(deriveState(allSigned, states[index]?.[1] ?? [])),
      ),
    ).toEqual(composed.map(() => 6899))
  })

  it('reds on a corner built with the overlay sheet of another state: all-unsigned overlay with the all-signed one swapped in (control)', () => {
    const swapped = expectedSheet([], DRAFTS_FEEDBACK)

    expect(bytesOf(swapped)).toBe(corners['signed+unsigned']?.bytes)
    expect(bytesOf(swapped)).not.toBe(corners['unsigned+unsigned']?.bytes)
    expect(sha256(swapped).slice(0, 16)).not.toBe(corners['unsigned+unsigned']?.sha256)
  })
})
