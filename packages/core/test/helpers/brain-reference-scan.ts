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

/** A requirement/acceptance-criteria id, e.g. `AC-consumer-constraints-39` (Phase 3 finding 14:
 * this had no clause of its own, so a copy carrying only this kind of reference scanned clean). */
export const AC_ID = /\bAC-[a-z0-9-]+-\d+\b/

export const HASH = String.fromCharCode(35)

/** A synthetic dated id, for a test that plants one without writing a literal recognisable id. */
export function syntheticDatedId(): string {
  return join('D', '-', '20200101', '-', '01')
}

const BARE_HASH_REF = /(?<![\w/-])#(\d{1,4})(?!\d)/g

/**
 * Whether the `#digits` match at `matchIndex` in `text` is an all-decimal, 3/4/6/8-digit hex
 * colour literal sitting inside a backtick-fenced code span, rather than a tracker reference —
 * the false positive Phase 3 finding 14 named, since a hex value of one of those widths is also
 * a valid bare `#N` shape. A colour outside any code span is not exempted: nothing marks it as a
 * colour rather than a reference.
 */
function isHexColourContext(text: string, matchIndex: number, digits: string): boolean {
  const looksHex = /^[0-9a-fA-F]+$/.test(digits) && [3, 4, 6, 8].includes(digits.length)
  if (!looksHex) return false
  const before = text.slice(0, matchIndex)
  const after = text.slice(matchIndex + 1 + digits.length)
  return before.endsWith('`') && after.startsWith('`')
}

/**
 * Every check `scanForBrainReferences` runs, each independent of the others rather than
 * short-circuited by `expect`'s throw-on-first-failure — so a single composite planted string
 * violating more than one check proves EVERY violated check fires, not only whichever happened
 * to run first (Phase 3, slice 3, finding 14). Returns the label of each violation found, `[]`
 * when `text` is clean.
 */
function findBrainReferenceViolations(text: string): string[] {
  const violations: string[] = []
  for (const id of PERSONA_IDS) {
    if (new RegExp(`\\b${id}\\b`).test(text)) violations.push(`persona id ${id}`)
  }
  if (DATED_ID.test(text)) violations.push('a dated id')
  if (AC_ID.test(text)) violations.push('an AC id')
  for (const match of text.matchAll(BARE_HASH_REF)) {
    if (!isHexColourContext(text, match.index, match[1]!)) {
      violations.push('a bare tracker reference')
      break
    }
  }
  if (text.includes(join('navecss', '-', 'cowork'))) {
    violations.push('a private-tracker repo reference')
  }
  if (text.includes(join('navecss', '/', 'cowork'))) {
    violations.push('a private-tracker repo reference (slash form)')
  }
  if (/\bbrain\/|\bcowork\//.test(text)) violations.push('a brain/cowork path')
  return violations
}

/**
 * Asserts `text` (read from `label`) carries no tracker reference (bare `#N`, exempting a hex
 * colour in a code span, or a qualified private-tracker repo name in either `-` or `/` form), no
 * persona id as a whole word, no dated id (`F-`/`D-`/`E-`/`LE-`/`L-`/`Lc-`), no requirement/AC
 * id, and no brain/cowork path.
 */
export function scanForBrainReferences(text: string, label: string): void {
  const violations = findBrainReferenceViolations(text)
  expect(violations, `${label} contains: ${violations.join(', ')}`).toEqual([])
}
