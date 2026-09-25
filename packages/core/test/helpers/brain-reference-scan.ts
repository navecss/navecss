/**
 * AC-consumer-constraints-04's brain-reference scan (tracker refs, persona ids, dated ids,
 * brain/cowork paths), shared by every slice's own shape test rather than reimplemented per
 * slice - the duplicate copy across slices 1 and 3 is exactly what SonarCloud's new-code
 * duplication gate caught on this slice's own pull request.
 *
 * Every fixture below is COMPOSED at runtime from short fragments, mirroring
 * `no-bare-issue-refs.test.ts`'s own convention: a literal roster id, dated id or bare
 * `#`+digits sitting in this file would itself be exactly the shape the repository's own
 * brain-reference and bare-issue-reference guards exist to keep out of a public repository.
 */
import { expect } from 'vitest'

const join = (...parts: string[]) => parts.join('')

export const PERSONA_IDS = [
  'PM',
  join('PR', 'IN'),
  'ENG',
  'QA',
  join('DS', 'GN'),
  join('DEV', 'REL'),
  join('STEW', 'ARD'),
  join('OR', 'CH'),
  join('LI', 'B'),
  join('AS', 'ST'),
]

export const DATED_ID = /\b(?:F|D|E|LE|L|Lc)-\d{8}(?:-[a-z0-9]+)*\b/

export const HASH = String.fromCharCode(35)

/** A synthetic dated id, for a test that plants one without writing a literal recognisable id. */
export function syntheticDatedId(): string {
  return join('D', '-', '20200101', '-', '01')
}

/**
 * Asserts `text` (read from `label`) carries no tracker reference (bare `#N` or qualified
 * private-tracker repo name), no persona id as a whole word, no dated id (`F-`/`D-`/`E-`/`LE-`/
 * `L-`/`Lc-`), and no brain/cowork path.
 */
export function scanForBrainReferences(text: string, label: string): void {
  for (const id of PERSONA_IDS) {
    expect(new RegExp(`\\b${id}\\b`).test(text), `${label} contains persona id ${id}`).toBe(false)
  }
  expect(DATED_ID.test(text), `${label} contains a dated id`).toBe(false)
  expect(text, `${label} contains a bare tracker reference`).not.toMatch(
    /(?<![\w/-])#(\d{1,4})(?!\d)/,
  )
  expect(text, `${label} contains a private-tracker repo reference`).not.toContain(
    join('navecss', '-', 'cowork'),
  )
  expect(text, `${label} contains a brain/cowork path`).not.toMatch(/\bbrain\/|\bcowork\//)
}
