/**
 * AC-token-build-20 covers: R20. For a seed of EACH accepted
 * form (hex at each of its four widths, `rgb()`, `hsl()`, `oklch()`, `lab()`, `lch()`,
 * `color()` in both of its accepted spaces), the build record's `input` is typed and populated
 * to express THAT form specifically, never coerced into one form's shape, with the resolved
 * OKLCH triple recorded alongside it in every case. R5 rider 1 is the
 * obligation (the input AS GIVEN and the resolved triple, both); this criterion is what stops
 * it being discharged by a type that cannot fail.
 *
 * Driven through the shipped entry point and the artifact it writes (`build-record.json`),
 * because the record is the consumer-readable half of the obligation and the type alone proves
 * nothing about what lands on disk.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { build } from '../../src/facade.ts'
import { SHIPPED_SEEDS } from '../../src/theming/shipped-seeds.ts'
import { cleanupScratchDirs, scratchDir } from '../helpers/scratch-dir.ts'

afterAll(cleanupScratchDirs)

const ACCEPTED_FORMS: readonly {
  expected: Record<string, unknown>
  input: string
  label: string
}[] = [
  { expected: { form: 'hex', width: 3 }, input: '#2d6', label: '3-digit hex' },
  { expected: { form: 'hex', width: 4 }, input: '#2d6f', label: '4-digit hex (opaque alpha)' },
  { expected: { form: 'hex', width: 6 }, input: '#27d4c6', label: '6-digit hex' },
  {
    expected: { form: 'hex', width: 8 },
    input: '#27d4c6ff',
    label: '8-digit hex (opaque alpha)',
  },
  { expected: { form: 'rgb' }, input: 'rgb(39 212 198)', label: 'rgb()' },
  { expected: { form: 'hsl' }, input: 'hsl(175 69% 49%)', label: 'hsl()' },
  { expected: { form: 'oklch' }, input: 'oklch(78.59% 0.1316 186.17)', label: 'oklch()' },
  { expected: { form: 'lab' }, input: 'lab(51.4321 -5.22826 -40.1438)', label: 'lab()' },
  { expected: { form: 'lch' }, input: 'lch(51.4321 40.4828 262.58)', label: 'lch()' },
  {
    expected: { form: 'color', space: 'srgb' },
    input: 'color(srgb 0.25 0.5 0.75)',
    label: 'color(srgb …)',
  },
  {
    expected: { form: 'color', space: 'display-p3' },
    input: 'color(display-p3 0 1 0)',
    label: 'color(display-p3 …)',
  },
]

interface RecordedSeed {
  input: Record<string, unknown> & { form: string; value?: unknown }
  resolved: { c: number; h: number; l: number }
}

async function buildRecordFor(
  seed: string,
): Promise<{ danger: RecordedSeed; primary: RecordedSeed }> {
  const outDir = scratchDir('navecss-tokens-build-record-')
  await build({ outDir, seed })
  const record = JSON.parse(readFileSync(path.join(outDir, 'build-record.json'), 'utf8')) as {
    seeds: { danger: RecordedSeed; primary: RecordedSeed }
  }
  return record.seeds
}

const AN_OKLCH_TRIPLE = {
  c: expect.any(Number) as number,
  h: expect.any(Number) as number,
  l: expect.any(Number) as number,
}

describe('AC-token-build-20 covers: R20', () => {
  it.each(ACCEPTED_FORMS)(
    "$label: the record's `input` names THAT form, carries the seed AS GIVEN, and the resolved triple sits alongside",
    async ({ expected, input }) => {
      const { primary } = await buildRecordFor(input)
      expect(primary.input).toMatchObject({ ...expected, raw: input })
      // The conversion's own output, before normalisation, so a reader can see what the
      // string they gave became and then what the build used.
      expect(primary.input.value).toEqual(AN_OKLCH_TRIPLE)
      expect(primary.resolved).toEqual(AN_OKLCH_TRIPLE)
    },
  )

  it('across the eleven inputs the recorded forms are the seven R5 names, never one shape standing in for everything', async () => {
    const forms = new Set<string>()
    for (const { input } of ACCEPTED_FORMS) {
      const { primary } = await buildRecordFor(input)
      forms.add(primary.input.form)
    }
    expect([...forms].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'color',
      'hex',
      'hsl',
      'lab',
      'lch',
      'oklch',
      'rgb',
    ])
  })

  it("a seed authored as an OKLCH triple (the shipped danger default) is recorded as `{ form: 'oklch', value }` with no `raw`, because the triple IS what was given", async () => {
    const { danger } = await buildRecordFor('#27d4c6')
    expect(danger.input).toEqual({ form: 'oklch', value: SHIPPED_SEEDS.danger })
  })
})
