import { describe, expect, it } from 'vitest'

import { assertLadderOrder, LADDER } from '../../src/theming/ladder.ts'

// PARTIAL COVERAGE. Every assertion in
// this file is against LADDER, an internal constant: not exported, in no dist/ file, and not
// what a consumer reads. AC-theming-34 and -36 range over the customization ladder AS
// PUBLISHED, which is README.md's theming section at
// 0.1.0, landed via a separate PR.
//
// THAT SECTION NOW EXISTS (that PR landed) and the published-side coverage this note used to
// record as owed IS NOW WRITTEN: scripts/readme-ac-theming-34-36.test.mjs reads
// README.md directly and asserts AC-theming-34's seven rows, every rung's five
// what-you-write/where/cost/preserves/voids declarations, and AC-theming-36's proposition
// that rungs 1b, 3, 4 and 5 are each documented as reached through the entry point with
// their own upgrade posture and none documented as unavailable, unsupported or merely
// tracked. What survives and is still true of THIS file: every assertion below is against
// the internal LADDER constant, not the published artifact, so this file alone does not
// certify what a reader of the README sees. See scripts/readme-ac-theming-34-36.test.mjs for
// the published-side half.
//
// Deliberately not fixed by exporting LADDER: product's ruling names that as the trap, since it
// "would make the criterion pass while still not checking the thing it names" (the
// proxy-assertion class this note was raised for). LADDER stays internal; these tests stay as
// correct checks of the data structure, marked so the grep gate does not overstate them.
describe('AC-theming-34 covers: R29, R33', () => {
  it('has seven rows ordered 0, 1a, 1b, 2, 3, 4, 5 by how much of generation is retained', () => {
    expect(() => assertLadderOrder()).not.toThrow()
    expect(LADDER.map((r) => r.rung)).toEqual(['0', '1a', '1b', '2', '3', '4', '5'])
  })

  it('every rung declares all five of what-you-write/where/cost/preserves/voids', () => {
    for (const rung of LADDER) {
      expect(rung.whatYouWrite).toBeTruthy()
      expect(rung.whereItLives).toBeTruthy()
      expect(rung.cost).toBeTruthy()
      expect(rung.preserves).toBeTruthy()
      expect(rung.voids).toBeTruthy()
    }
  })

  it('rungs 1a and 1b record a fine 0.x upgrade posture; rungs 4 and 5 record unbounded-in-0.x/bounded-at-1.0', () => {
    const byRung = new Map(LADDER.map((r) => [r.rung, r]))
    expect(byRung.get('1a')!.upgrade).toBe('fine')
    expect(byRung.get('1b')!.upgrade).toBe('fine')
    expect(byRung.get('4')!.upgrade).toBe('unbounded-0x-bounded-1.0')
    expect(byRung.get('5')!.upgrade).toBe('unbounded-0x-bounded-1.0')
  })

  it('rung 0 is reserved with zero presets shipped, independent of whether a build exists', () => {
    const rung0 = LADDER.find((r) => r.rung === '0')!
    expect(rung0.reserved).toBe(true)
  })
})

// PARTIAL COVERAGE: see the note at the
// top of this file. R30's "as published" half is now covered too, by
// scripts/readme-ac-theming-34-36.test.mjs, which asserts rungs 1b, 3, 4 and 5 are each
// documented as reached through the entry point with their own upgrade posture and none as
// unavailable. This file's own assertions below stay internal-constant checks.
describe('AC-theming-36 covers: R30', () => {
  it('rungs 1b, 3, 4 and 5 are none of them documented as unavailable — the 0.1.0 build ships', () => {
    for (const rungId of ['1b', '3', '4', '5']) {
      const rung = LADDER.find((r) => r.rung === rungId)!
      expect(rung.whereItLives).not.toMatch(/not shipped|unavailable/i)
    }
  })
})
