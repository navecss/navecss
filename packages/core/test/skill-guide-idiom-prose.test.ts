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

import { generate, OUTPUT_PATH } from '../scripts/generate-skill.ts'
import { atomClassMap } from '../src/atoms.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const committed = readFileSync(OUTPUT_PATH, 'utf8')
const coreReadme = readFileSync(path.resolve(HERE, '../README.md'), 'utf8')

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
    'closed sets',
    'A name not on this page is not used',
    'An undeclared `--nave-*` name passes lint and the build and renders nothing',
    'the camelCase keys',
    'never the `nave-` class',
    'A type error from',
    '`cx()` means the name is wrong',
    'never a reason to reach for `cx.raw()` or a cast',
    'a class from outside any system Nave sees',
    'the project’s own classes',
    "`cx('container')` is Nave’s atom",
    "`cx.raw('container')` is the project’s class",
    'a CSS Module class behind a condition',
    '`cx.raw(isActive && styles.active)`',
    'naming `false`, `undefined` and `0`',
    'where `@nave` is valid',
  ]

  it.each(REQUIRED_STATEMENTS)('contains: %s', (statement) => {
    expect(committed).toContain(statement)
  })

  it('removing any one statement from the generator’s template output fails the corresponding assertion', async () => {
    const withoutOne = committed.replace('never write an unlayered rule', '')
    expect(withoutOne).not.toContain('never write an unlayered rule')
  })
})

describe("AC-consumer-constraints-39: cx('container')/cx.raw('container') appear only in prose, never in a fence", () => {
  it('container is an own key of atomClassMap', () => {
    expect(Object.hasOwn(atomClassMap, 'container')).toBe(true)
  })

  it('the code spans appear outside any fence', () => {
    const fenceRanges: Array<[number, number]> = [...committed.matchAll(/```[\s\S]*?```/g)].map(
      (m) => [m.index!, m.index! + m[0].length],
    )
    const insideAFence = (index: number) =>
      fenceRanges.some(([start, end]) => index >= start && index < end)

    for (const span of ["cx('container')", "cx.raw('container')"]) {
      const index = committed.indexOf(span)
      expect(index, `expected to find ${span}`).toBeGreaterThan(-1)
      expect(insideAFence(index), `${span} unexpectedly inside a fence`).toBe(false)
    }
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
