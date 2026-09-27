import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { SHIPPED_SEEDS } from '../../src/theming/shipped-seeds.ts'
import { STEP_TABLE, stepLightness } from '../../src/theming/step-table.ts'

/**
 * `tokens.json`'s `$extensions['dev.navecss.theming']` block DECLARES what the shipped
 * defaults are, for a reader of the source; the single computation of those defaults lives in
 * `packages/tokens/src/theming/` (`shipped-seeds.ts`, `step-table.ts`). Nothing compared the
 * two, so a declared value could drift from what the source actually computes with every other
 * `@navecss/tokens` test still green.
 *
 * This file checks exactly that relation, for the declared values that restate a source
 * computation: `seeds.primary.oklch`, `seeds.danger.oklch`, and the three numbers embedded in
 * the `stepTable` string (its row count, its first and last step, and the lightness of its
 * named row). It does not check `achromaticBranch` or `adjacency.comment`: those describe
 * relations this file does not see.
 *
 * `stepTable` is prose, not data, so its facts are pulled out with a regex per fact rather than
 * compared as one string: a rewording that drops or changes a single number reds here even if
 * the rest of the sentence changes shape.
 */

const TOKENS_JSON_PATH = path.resolve(import.meta.dirname, '../../tokens.json')

interface TokensJsonTheming {
  seeds: {
    danger: { oklch: [number, number, number] }
    primary: { oklch: [number, number, number] }
  }
  stepTable: string
}

function readTheming(): TokensJsonTheming {
  const raw = readFileSync(TOKENS_JSON_PATH, 'utf8')
  const parsed = JSON.parse(raw) as {
    $extensions: { 'dev.navecss.theming': TokensJsonTheming }
  }
  return parsed.$extensions['dev.navecss.theming']
}

/**
 * The `the <step> row at L <lightness>` fact in the `stepTable` prose, or `undefined` when
 * absent.
 */
function namedRowFact(text: string): { lightness: number; step: number } | undefined {
  const match = /the\s+(\d+)\s+row\s+at\s+L\s+(\d+(?:\.\d+)?)/.exec(text)
  return match ? { lightness: Number(match[2]), step: Number(match[1]) } : undefined
}

describe('tokens.json theming declaration matches its source of truth', () => {
  const theming = readTheming()

  it('seeds.primary.oklch equals the SHIPPED_SEEDS primary triple', () => {
    const { primary } = SHIPPED_SEEDS
    expect(theming.seeds.primary.oklch).toEqual([primary.l, primary.c, primary.h])
  })

  it('seeds.danger.oklch equals the SHIPPED_SEEDS danger triple', () => {
    const { danger } = SHIPPED_SEEDS
    expect(theming.seeds.danger.oklch).toEqual([danger.l, danger.c, danger.h])
  })

  it("the stepTable string's row count matches STEP_TABLE.length", () => {
    const match = /(\d+)\s+rows\b/.exec(theming.stepTable)
    expect(match, `no "<N> rows" fact found in: ${theming.stepTable}`).not.toBeNull()
    expect(Number(match![1])).toBe(STEP_TABLE.length)
  })

  it("the stepTable string's first-to-last range matches STEP_TABLE's own first and last step", () => {
    const match = /(\d+)\s+to\s+(\d+)\b/.exec(theming.stepTable)
    expect(match, `no "<N> to <N>" fact found in: ${theming.stepTable}`).not.toBeNull()
    expect(Number(match![1])).toBe(STEP_TABLE.at(0)!.step)
    expect(Number(match![2])).toBe(STEP_TABLE.at(-1)!.step)
  })

  it("the stepTable string's named row and its lightness match STEP_TABLE", () => {
    const fact = namedRowFact(theming.stepTable)
    expect(fact, `no "the <N> row at L <N>" fact found in: ${theming.stepTable}`).toBeDefined()
    expect(stepLightness(fact!.step)).toBe(fact!.lightness)
  })

  it('captures the named-row lightness when a full stop immediately follows it', () => {
    expect(namedRowFact('the 850 row at L 0.225.')).toEqual({ lightness: 0.225, step: 850 })
  })
})
