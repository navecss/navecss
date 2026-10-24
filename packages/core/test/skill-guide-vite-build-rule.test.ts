/**
 * AC-used-atoms-57 covers: R15.
 *
 * The agent guide's `cx()` section carries the rule of the Vite plugin's build: it reads every
 * `cx()` call and fails on one it cannot list, so an agent passes names it can read, chooses by a
 * value with one call per case, sends a name known only at run time through `cx.dynamic()` with
 * `keep`, takes the report's first fitting remedy, and never sets `atomic: 'all'`, builds a `nave-`
 * class from pieces or applies a class taken from `@navecss/core/atoms` to make a report go away.
 * The paragraph is one line, so a byte-exact match does not depend on collapsing whitespace.
 *
 * AC-nextjs-used-atoms-44 covers the Next.js half: the paragraph names `withNave()` from
 * `@navecss/prune` as the Next.js home of `keep`, and its "never" list holds moving a Next.js
 * project back to `@navecss/core/postcss` and removing `withNave()` to make a report go away.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { generate, OUTPUT_PATH, renderCxSection } from '../scripts/generate-skill.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

const committed = readFileSync(OUTPUT_PATH, 'utf8')

/**
 * The paragraph, byte-exact. Kept as one literal here (never rebuilt from the generator's own
 * source) so this test cannot pass merely because it shares a typo with it.
 */
const PARAGRAPH =
  "In a project whose Vite config uses `navePlugin()` from `@navecss/core/vite`, or whose Next.js config is wrapped in `withNave()` from `@navecss/prune`, the build reads every `cx()` call and fails on one whose atoms it cannot list. Pass names it can read (a literal, a condition between literals, a `const` in the same file); to choose by a value, call `cx()` once per case and pick between the results; pass a name known only at run time to `cx.dynamic()`, with its atoms in `keep`, an option of `navePlugin()` on Vite and of `withNave()` on Next.js. The build's report names its remedies, most preferred first: take the first one that fits; on Next.js, `next dev` prints it in its terminal, not in the browser. Never set `atomic: 'all'`, never move a Next.js project back to `@navecss/core/postcss` or remove `withNave()`, never build a `nave-` class from pieces, and never apply a class taken from `@navecss/core/atoms`, to make a report go away. The dev server serves the atoms the build would ship, chosen from the code it has read, so a `nave-*` class with no rule in dev is written where the build cannot see it: move it into code the build reads, or list its atom in `keep`."

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/**
 * What every row below asks of a text: it holds the paragraph exactly once.
 */
const hasParagraph = (text: string): boolean => countOccurrences(text, PARAGRAPH) === 1

describe('AC-used-atoms-57: the guide carries the build’s rule', () => {
  it('the committed guide holds the paragraph byte-exact, once, inside its cx() section', () => {
    const start = committed.indexOf('## `cx()`\n')
    const end = committed.indexOf('\n## ', start + 1)

    expect(hasParagraph(committed)).toBe(true)
    expect(committed.slice(start, end)).toContain(PARAGRAPH)
  })

  it('a freshly generated guide holds it too, and equals the committed file', async () => {
    const fresh = await generate()

    expect(hasParagraph(fresh)).toBe(true)
    expect(fresh).toBe(committed)
  })

  it('comes from the generator’s own cx() section, so removing it there fails (the control)', async () => {
    const lines = renderCxSection()
    const fresh = await generate(baseSkillGuideSources())

    expect(lines.filter((line) => line === PARAGRAPH)).toHaveLength(1)
    expect(fresh).toContain(lines.join('\n'))
    expect(hasParagraph(lines.join('\n'))).toBe(true)
    expect(
      hasParagraph(lines.filter((line) => line !== PARAGRAPH).join('\n')),
      'a cx() section without the paragraph line does not hold the paragraph',
    ).toBe(false)
  })
})

describe('AC-nextjs-used-atoms-44: the guide names the Next.js home of keep and the two things never to do', () => {
  const CLAUSES = [
    'or whose Next.js config is wrapped in `withNave()` from `@navecss/prune`',
    'an option of `navePlugin()` on Vite and of `withNave()` on Next.js',
    'never move a Next.js project back to `@navecss/core/postcss` or remove `withNave()`',
  ]

  it('holds each clause in the committed guide, and in a fresh one', async () => {
    const fresh = await generate(baseSkillGuideSources())
    for (const clause of CLAUSES) {
      expect(committed, clause).toContain(clause)
      expect(fresh, clause).toContain(clause)
    }
  })

  it('fails when a clause is removed from the generator (the control)', () => {
    const section = renderCxSection().join('\n')
    for (const clause of CLAUSES) {
      expect(section, clause).toContain(clause)
      expect(section.replace(clause, ''), clause).not.toContain(clause)
    }
    expect(committed).not.toContain('@navecss/nextjs')
  })
})
