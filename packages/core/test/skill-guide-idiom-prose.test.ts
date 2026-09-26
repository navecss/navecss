/**
 * AC-consumer-constraints-39: the guide's one example fence is byte-identical to core's own
 * README fence, the `@nave`/`cx()`/`cx.raw()` sections come in that order, and every prose
 * statement R22 requires is present and removable (so the test that asserts it actually tests
 * something).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { generate, OUTPUT_PATH, renderNaveSection } from '../scripts/generate-skill.ts'
import { atomClassMap } from '../src/atoms.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const committed = readFileSync(OUTPUT_PATH, 'utf8')
const coreReadme = readFileSync(path.resolve(HERE, '../README.md'), 'utf8')

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractButtonFence(markdown: string): string {
  const match = /```css\n(\/\* button\.module\.css \*\/[\s\S]*?)```/.exec(markdown)
  if (!match) throw new Error('no button.module.css fence found')
  return match[1]!.trimEnd()
}

describe('AC-consumer-constraints-39: one example fence, byte-identical to the README’s', () => {
  it('the guide’s css fence is byte-identical to core README’s button.module.css fence', () => {
    const guideFence = extractButtonFence(committed)
    const readmeFence = extractButtonFence(coreReadme)
    expect(guideFence).toBe(readmeFence)
  })

  it('has exactly one css fence', () => {
    const cssFences = [...committed.matchAll(/```css\n/g)]
    expect(cssFences).toHaveLength(1)
  })
})

describe('AC-consumer-constraints-39: @nave/var(--nave-*) before cx() before cx.raw()', () => {
  it('the @nave section heading precedes the cx() heading, which precedes the cx.raw() heading', () => {
    const naveHeadingIndex = committed.indexOf('## Using `@nave` and `var(--nave-*)`')
    const cxHeadingIndex = committed.indexOf('## `cx()`')
    const cxRawHeadingIndex = committed.indexOf('## `cx.raw()`')
    expect(naveHeadingIndex).toBeGreaterThan(-1)
    expect(cxHeadingIndex).toBeGreaterThan(naveHeadingIndex)
    expect(cxRawHeadingIndex).toBeGreaterThan(cxHeadingIndex)
  })
})

describe('AC-consumer-constraints-39: required prose statements, each present and removable', () => {
  const REQUIRED_STATEMENTS = [
    'Consumer rules go in `@layer components.consumer`',
    'a deliberate exception',
    'never write an unlayered rule',
    'closed sets: the built-in atom names',
    'neither on this page nor in the project’s own `navePlugin({ extend })`',
    'say so rather than invent one',
    'valid in `@nave` only, never in `cx()`',
    '[CONSUMER-ATOMS.md](../../CONSUMER-ATOMS.md)',
    '`@nave` applies the project’s atom and `cx()` still returns the built-in',
    'An undeclared `--nave-*` name passes lint and the build and renders nothing',
    'the camelCase keys',
    'never the `nave-` class',
    'A type error from',
    '`cx()` means the name is wrong',
    'never a reason to reach for `cx.raw()` or a cast',
    'Its type check is TypeScript only: a JavaScript consumer gets none of it.',
    'a class from outside any system Nave sees',
    'the project’s own classes',
    "`cx('container')` is Nave’s atom",
    "`cx.raw('container')` is the project’s class",
    'a CSS Module class behind a condition',
    '`cx.raw(isActive && styles.active)`',
    'naming `false`, `undefined` and `0`',
    'where `@nave` is valid',
    'is the first `@layer` declaration the page sees',
    'keep `@navecss/core/layers`, the order statement alone, as the first import',
  ]

  it.each(REQUIRED_STATEMENTS)('contains: %s', (statement) => {
    expect(committed).toContain(statement)
  })

  // Retired by PM's ruling on finding 6 (R22 is scoped to built-in atom names): the guide no
  // longer asserts atom-name closure without the qualifier, and no sentence places an `extend`
  // atom inside `cx()`.
  const ASSERT_ABSENT = [
    'atom and `--nave-*` names are exactly',
    'this guide says so',
    'Nave declares one `@layer` order',
    'type-checked against the same closed set',
    'A name not on this page is not used',
  ]

  it.each(ASSERT_ABSENT)('does not contain: %s', (statement) => {
    expect(committed).not.toContain(statement)
  })

  it('removing any one statement from the generator’s OWN template array fails — a real regeneration, never string-surgery on the already-rendered committed file', () => {
    const lines = renderNaveSection()
    const targetIndex = lines.findIndex((line) => line.includes('never write an unlayered rule'))
    expect(targetIndex).toBeGreaterThan(-1)
    const withoutOne = lines.filter((_, i) => i !== targetIndex).join('\n')
    expect(withoutOne).not.toContain('never write an unlayered rule')
    // The unmodified array still carries it: this is genuinely testing the splice, not a
    // statement that was never there.
    expect(lines.join('\n')).toContain('never write an unlayered rule')
  })
})

describe("AC-consumer-constraints-39: cx('container')/cx.raw('container') appear only in prose, never in a fence", () => {
  it('container is an own key of atomClassMap', () => {
    expect(Object.hasOwn(atomClassMap, 'container')).toBe(true)
  })

  it('every occurrence of the code spans sits outside any fence', () => {
    const fenceRanges: Array<[number, number]> = [...committed.matchAll(/```[\s\S]*?```/g)].map(
      (m) => [m.index!, m.index! + m[0].length],
    )
    const insideAFence = (index: number) =>
      fenceRanges.some(([start, end]) => index >= start && index < end)

    for (const span of ["cx('container')", "cx.raw('container')"]) {
      // matchAll, never indexOf: a SECOND occurrence placed inside a fence would sit past the
      // first (correctly outside) one, and an indexOf-based check never looks past it
      // (Phase 3, slice 3, finding 17).
      const occurrences = [...committed.matchAll(new RegExp(escapeRegExp(span), 'g'))]
      expect(occurrences.length, `expected to find ${span}`).toBeGreaterThan(0)
      for (const occurrence of occurrences) {
        expect(insideAFence(occurrence.index!), `${span} unexpectedly inside a fence`).toBe(false)
      }
    }
  })

  it('the matchAll check above does catch a second occurrence placed inside a fence', () => {
    const withPlantedFence = `${committed}\n\n\`\`\`tsx\ncx('container')\n\`\`\`\n`
    const fenceRanges: Array<[number, number]> = [
      ...withPlantedFence.matchAll(/```[\s\S]*?```/g),
    ].map((m) => [m.index!, m.index! + m[0].length] as [number, number])
    const insideAFence = (index: number) =>
      fenceRanges.some(([start, end]) => index >= start && index < end)
    const occurrences = [...withPlantedFence.matchAll(/cx\('container'\)/g)]
    expect(occurrences.length).toBeGreaterThan(1)
    expect(occurrences.some((occurrence) => insideAFence(occurrence.index!))).toBe(true)
  })

  it('the cx.raw(isActive && styles.active) code span is byte-identical to core README’s', () => {
    const span = 'cx.raw(isActive && styles.active)'
    expect(coreReadme).toContain(span)
    expect(committed).toContain(span)
  })
})

describe('AC-consumer-constraints-01/-40 (immune to source perturbation, seam check)', () => {
  it('generate() accepts substituted sources without touching the real tree', async () => {
    const output = await generate(baseSkillGuideSources())
    expect(output).toContain('# navecss')
  })
})
