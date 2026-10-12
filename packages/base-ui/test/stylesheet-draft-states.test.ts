import { readFileSync } from 'node:fs'
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
const REMOVED_BYTES = { pdy1: 3736, '2uuv': 182, abv1: 151, qok6: 1057, d8l7: 572, qglc: 564 }

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
    expect(rows['pdy1+2uuv+abv1+qok6+d8l7+qglc']).toMatchObject({ bytes: 24_139, classes: 53 })
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

describe('AC-base-ui-overlay-completion-37: each signature removes exactly its own bytes and nothing else', () => {
  it.each(states)(
    'builds the state with %s unsigned as the table gives it',
    async (key, unsigned) => {
      const derived = deriveState(allSigned, unsigned)
      const built = await buildStyles({ unsigned })

      expect(listDifference(built, derived)).toBeUndefined()
      expect(classesOf(built).size).toBe(rows[key]?.classes)
      expect(classesOf(built)).toEqual(tablePClassesFor(unsigned))
    },
  )

  it.each(DRAFTS)('takes out of the all-signed stylesheet only what %s owns', (draft) => {
    const derived = deriveState(allSigned, [draft])
    const removed = ruleClasses(allSigned).filter((name) => !ruleClasses(derived).includes(name))

    expect(Buffer.byteLength(allSigned) - Buffer.byteLength(derived)).toBe(REMOVED_BYTES[draft])
    expect(new Set(removed)).toEqual(new Set(DRAFT_CLASSES[draft]))
    expect(isSubsequence(lines(derived), lines(allSigned))).toBe(true)
  })

  it('differs, with abv1 unsigned, by exactly the open ghost key of 151 bytes in the button', async () => {
    const [signed, unsigned] = await Promise.all([
      buildStyles(),
      buildStyles({ unsigned: ['abv1'] }),
    ])
    const key = lines(signed).find((line) => line.startsWith(OPEN_GHOST_KEY)) ?? ''

    expect(Buffer.byteLength(`${key}\n`)).toBe(151)
    expect(unsigned).toBe(withoutOpenGhost(signed))
    expect(lines(signed).length - lines(unsigned).length).toBe(1)
  })

  it('leaves every other class of the state with pdy1 unsigned as it is when all are signed', async () => {
    const [signed, unsigned] = await Promise.all([
      buildStyles(),
      buildStyles({ unsigned: ['pdy1'] }),
    ])
    const kept = declarationsByClass(unsigned)
    const all = declarationsByClass(signed)
    const changed = kept
      .keys()
      .filter((name) => JSON.stringify(kept.get(name)) !== JSON.stringify(all.get(name)))

    expect(kept.size).toBe(58)
    expect(changed.toArray()).toEqual([])
  })

  it('reds a pdy1-unsigned build that keeps the six Combobox-only rules, in bytes and in classes (control)', () => {
    const kept = withoutRules(allSigned, DRAFT_CLASSES.pdy1.slice(0, 1))

    expect(Buffer.byteLength(kept)).toBe(29_974)
    expect(classesOf(kept).size).toBe(64)
    expect(sha256(kept)).not.toBe(rows.pdy1?.sha256)
    expect(classesOf(kept)).not.toEqual(tablePClassesFor(['pdy1']))
    expect(listDifference(kept, deriveState(allSigned, ['pdy1']))).toBeDefined()
  })

  it.each(DRAFTS.filter((draft) => draft !== 'abv1'))(
    'tells the all-signed list from the state without %s (control)',
    (draft) => {
      expect(listDifference(allSigned, deriveState(allSigned, [draft]))).toBeDefined()
    },
  )

  it('names the drafts the build is parameterised by, in the order the table lists them', async () => {
    const url = new URL('../styles/drafts.ts', import.meta.url).href
    const drafts = (await import(/* @vite-ignore */ url)) as { DRAFTS: readonly string[] }

    expect(drafts.DRAFTS).toEqual([...DRAFTS])
  })
})
