import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as AdjacencySourceModule from '../../src/theming/adjacency-source.ts'
import type * as SemanticsModule from '../../src/theming/semantics.ts'

import { type Adjacency, ADJACENCY } from '../../src/theming/adjacency-source.ts'
import { assertCoverageFloor, coverageCategories } from '../../src/theming/adjacency.ts'
import { composeBuildRecord } from '../../src/theming/build-record.ts'
import { composeThemingOutputs } from '../../src/theming/build-step.ts'
import { checkSameStepLint, runContrastHarness } from '../../src/theming/contrast.ts'
import { type PipelineResult, runPipeline } from '../../src/theming/pipeline.ts'
import {
  ACHROMATIC_BRANCH_SLOTS,
  ACHROMATIC_MAPPING,
  CHROMATIC_MAPPING,
  SEMANTIC_SLOTS,
  type SlotMapping,
} from '../../src/theming/semantics.ts'

/**
 * `action.secondary` gains a hover and an active fill. They change the fill only, sit beside
 * their rest in the source and in the emitted CSS, are not re-pointed by the achromatic branch,
 * and are declared as text under the secondary action's one foreground, and nowhere else.
 */

const HOVER = 'action.secondary.hover'
const ACTIVE = 'action.secondary.active'
const STATES = [HOVER, ACTIVE] as const
const isState = (slot: string): boolean => (STATES as readonly string[]).includes(slot)
const FOREGROUND = 'action.secondary.foreground'
const HOVER_NAME = '--nave-color-action-secondary-hover'
const ACTIVE_NAME = '--nave-color-action-secondary-active'

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }
const ACHROMATIC = { l: 0.5, c: 0, h: 0 }
const seeds = (
  primary = TEAL,
): { danger: typeof DANGER; declaredTintHue: number; primary: typeof TEAL } => ({
  primary,
  danger: DANGER,
  declaredTintHue: 186.17,
})
const COLUMNS = [
  ['the shipped default seed', TEAL],
  ['an achromatic seed', ACHROMATIC],
] as const

/**
The steps each state takes, per scheme, and the rest they sit beside.
 */
const EXPECTED_STEPS: Readonly<Record<string, Readonly<Record<'dark' | 'light', number>>>> = {
  'action.secondary': { light: 100, dark: 800 },
  [HOVER]: { light: 150, dark: 700 },
  [ACTIVE]: { light: 200, dark: 850 },
}

const here = import.meta.dirname
const dist = (file: string): string => readFileSync(path.resolve(here, '../../dist', file), 'utf8')
const tokensJsonText = readFileSync(path.resolve(here, '../../tokens.json'), 'utf8')

type AdjacencyBlock = Record<string, { against: string; class: string }[] | string>

const shippedBlock = (): AdjacencyBlock =>
  (
    JSON.parse(tokensJsonText) as {
      $extensions: { 'dev.navecss.theming': { adjacency: AdjacencyBlock } }
    }
  ).$extensions['dev.navecss.theming'].adjacency

/**
The custom-property names a stylesheet declares, comments stripped, anchored at line start.
 */
const declaredNames = (css: string): string[] =>
  css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/^[ \t]*(--[\w-]+)\s*:/gm)
    .map((match) => match[1] ?? '')
    .toArray()

/**
 * Where a slot list breaks the order this change promises: the rest, its two states and the
 * highlight, consecutive and in that order. `undefined` when it holds.
 */
function orderBreak(slots: readonly string[]): string | undefined {
  const expected = ['action.secondary', HOVER, ACTIVE, 'action.highlight']
  const at = slots.indexOf('action.secondary')
  const found = slots.slice(at, at + expected.length)
  return at !== -1 && found.join(',') === expected.join(',')
    ? undefined
    : `expected ${expected.join(', ')} consecutively, found ${found.join(', ')}`
}

/**
 * Every state slot and scheme whose resolved step is not the one this change ships, named
 * slot and scheme first.
 */
function stepMismatches(result: PipelineResult): string[] {
  return Object.entries(EXPECTED_STEPS).flatMap(([slot, steps]) =>
    (['light', 'dark'] as const).flatMap((scheme) => {
      const resolved = result.slots.find((s) => s.slot === slot && s.branch === scheme)?.resolved
      const want = `neutral ${steps[scheme]}`
      const got = resolved ? `${resolved.scale} ${resolved.step}` : 'nothing'
      return got === want ? [] : [`${slot} ${scheme}: resolves to ${got}, expected ${want}`]
    }),
  )
}

/**
 * The text the build emits for a neutral step in one scheme, read from another slot that
 * resolves to the same step, so the comparison is with the build's own writing of it.
 */
function emittedTextFor(result: PipelineResult, step: number, scheme: 'dark' | 'light'): string {
  const other = result.slots.find(
    (s) =>
      !isState(s.slot) &&
      s.branch === scheme &&
      s.resolved.scale === 'neutral' &&
      s.resolved.step === step &&
      s.resolved.alpha === undefined,
  )
  if (!other) throw new Error(`no other slot resolves to neutral ${step} in ${scheme}`)
  return other.css
}

const withoutStateEntries = (adjacency: readonly Adjacency[]): Adjacency[] =>
  adjacency.filter((pair) => !(pair.subject === FOREGROUND && isState(pair.against)))

const byText = (a: string, b: string): number => a.localeCompare(b)

const pairKey = (pair: Adjacency): string => `${pair.subject}|${pair.against}|${pair.class}`

/**
 * The semantics module as a copy: `mapping` replaces the chromatic column, and the slot list and
 * the resolver follow it, so a pipeline run over the copy resolves what the copy says.
 */
const semanticsCopy =
  (mapping: Record<string, SlotMapping>) => async (): Promise<Record<string, unknown>> => {
    const actual = await vi.importActual<typeof SemanticsModule>('../../src/theming/semantics.ts')
    return {
      ...actual,
      CHROMATIC_MAPPING: mapping,
      SEMANTIC_SLOTS: Object.keys(mapping),
      resolveSlotMapping: (slot: string, isAchromaticBranch: boolean): SlotMapping => {
        const override = isAchromaticBranch ? actual.ACHROMATIC_MAPPING[slot] : undefined
        const resolved = override ?? mapping[slot]
        if (!resolved) throw new Error(`Unknown semantic slot: ${slot}`)
        return resolved
      },
    }
  }

const withoutStates = (): Record<string, SlotMapping> =>
  Object.fromEntries(Object.entries(CHROMATIC_MAPPING).filter(([slot]) => !isState(slot)))

afterEach(() => {
  vi.doUnmock('../../src/theming/semantics.ts')
  vi.resetModules()
})

describe('AC-secondary-action-states-01 covers: R1', () => {
  it('SEMANTIC_SLOTS holds action.secondary, its hover, its active and action.highlight consecutively, in that order', () => {
    expect(orderBreak(SEMANTIC_SLOTS)).toBeUndefined()
  })

  it('the order check reds a copy placing the two states after action.highlight (the control)', () => {
    const moved = SEMANTIC_SLOTS.filter((slot) => !isState(slot))
    moved.splice(moved.indexOf('action.highlight') + 1, 0, HOVER, ACTIVE)
    expect(orderBreak(moved)).toMatch(/found action\.secondary, action\.highlight/)
  })

  it('the two states resolve to neutral 150/700 and 200/850, and the rest stays neutral 100/800, under the shipped seed', () => {
    const result = runPipeline(seeds())
    expect(stepMismatches(result)).toEqual([])
  })

  it('a source copy giving the hover neutral 200 light reds the step check, naming the slot and the scheme (the control)', async () => {
    vi.resetModules()
    vi.doMock(
      '../../src/theming/semantics.ts',
      semanticsCopy({
        ...CHROMATIC_MAPPING,
        [HOVER]: { light: { scale: 'neutral', step: 200 }, dark: { scale: 'neutral', step: 700 } },
      }),
    )
    const pipeline = await import('../../src/theming/pipeline.ts')
    const result = pipeline.runPipeline(seeds())
    expect(stepMismatches(result)).toEqual([
      'action.secondary.hover light: resolves to neutral 200, expected neutral 150',
    ])
  })

  it('dist/tokens.css declares each state once, between the rest and the highlight, as the light-dark() of the text the build emits for its steps', () => {
    const result = runPipeline(seeds())
    const lines = dist('tokens.css').split('\n')
    const declaring = (name: string): number[] =>
      lines.flatMap((line, index) => (line.startsWith(`    ${name}:`) ? [index] : []))
    for (const name of [HOVER_NAME, ACTIVE_NAME]) expect(declaring(name), name).toHaveLength(1)
    const [rest] = declaring('--nave-color-action-secondary')
    const [highlight] = declaring('--nave-color-action-highlight')
    expect(declaring(HOVER_NAME)[0]).toBe((rest ?? NaN) + 1)
    expect(declaring(ACTIVE_NAME)[0]).toBe((rest ?? NaN) + 2)
    expect(highlight).toBe((rest ?? NaN) + 3)
    for (const [slot, name] of [
      [HOVER, HOVER_NAME],
      [ACTIVE, ACTIVE_NAME],
    ] as const) {
      const steps = EXPECTED_STEPS[slot] ?? { light: NaN, dark: NaN }
      expect(lines[declaring(name)[0] ?? -1]).toBe(
        `    ${name}: light-dark(${emittedTextFor(result, steps.light, 'light')}, ${emittedTextFor(result, steps.dark, 'dark')});`,
      )
    }
  })

  it('the names dist/tokens.css declares are those a copy without the two states declares, plus exactly the two', async () => {
    const shippedTheming = new Set(declaredNames(composeThemingOutputs().css))
    const builtNames = new Set(declaredNames(dist('tokens.css')))
    for (const name of shippedTheming) expect(builtNames, name).toContain(name)

    vi.resetModules()
    vi.doMock('../../src/theming/semantics.ts', semanticsCopy(withoutStates()))
    const pipeline = await import('../../src/theming/pipeline.ts')
    const emit = await import('../../src/theming/emit.ts')
    const { css } = emit.emitCss(pipeline.runPipeline(seeds()))
    const copyTheming = new Set(declaredNames(css))

    expect([...shippedTheming.difference(copyTheming)].toSorted(byText)).toEqual(
      [HOVER_NAME, ACTIVE_NAME].toSorted(byText),
    )
    expect([...copyTheming.difference(shippedTheming)]).toEqual([])
  })

  it('ColorPropertyName in dist/tokens.d.ts names both states once, and TokenName names neither', () => {
    const dts = dist('tokens.d.ts')
    const union = /export declare type ColorPropertyName =\n((?:\s*\|\s*'[^']+'\n?)+)/.exec(
      dts,
    )?.[1]
    const members = (union ?? '')
      .matchAll(/'([^']+)'/g)
      .map((m) => m[1])
      .toArray()
    for (const name of [HOVER_NAME, ACTIVE_NAME]) {
      expect(
        members.filter((member) => member === name),
        name,
      ).toHaveLength(1)
    }
    const tokensObject = dts.slice(0, dts.indexOf('export declare type TokenName'))
    expect(tokensObject).not.toContain(HOVER_NAME)
    expect(tokensObject).not.toContain(ACTIVE_NAME)
  })
})

describe('AC-secondary-action-states-02 covers: R1, R5', () => {
  const ACHROMATIC_SIX = [
    'action.primary',
    'action.primary.active',
    'action.primary.hover',
    'border.focus',
    'content.link',
    'on-action.primary',
  ]
  /**
The two branch-data rows of the theming suite, as predicates over a mapping and its slot list.
   */
  const branchRowsHold = (
    mapping: Record<string, SlotMapping>,
    slots: readonly string[],
  ): string[] => {
    const keys = Object.keys(mapping).toSorted((a, b) => a.localeCompare(b))
    return [
      keys.join(',') === ACHROMATIC_SIX.join(',')
        ? undefined
        : 'ACHROMATIC_MAPPING is not exactly the six',
      [...slots].toSorted((a, b) => a.localeCompare(b)).join(',') === keys.join(',')
        ? undefined
        : "ACHROMATIC_BRANCH_SLOTS is not the mapping's keys",
    ].filter((problem) => problem !== undefined)
  }

  it.each(COLUMNS)('both states resolve to the same steps under %s', (_label, primary) => {
    const result = runPipeline(seeds(primary))
    expect(stepMismatches(result)).toEqual([])
  })

  it('the achromatic seed takes the branch, and its record substitutes exactly the six, neither state among them', () => {
    const result = runPipeline(seeds(ACHROMATIC))
    expect(result.records.achromaticBranch).toBe(true)
    const record = composeBuildRecord(seeds(ACHROMATIC), result)
    expect([...record.achromaticBranch.substitutedSlots].toSorted(byText)).toEqual(ACHROMATIC_SIX)
    expect(branchRowsHold(ACHROMATIC_MAPPING, ACHROMATIC_BRANCH_SLOTS)).toEqual([])
    for (const state of STATES) {
      expect(Object.keys(ACHROMATIC_MAPPING)).not.toContain(state)
      expect(ACHROMATIC_BRANCH_SLOTS).not.toContain(state)
    }
  })

  it('the emitted slot names are the same under both seeds, both new names in each', () => {
    const [chromatic, achromatic] = COLUMNS.map(([, primary]) =>
      declaredNames(composeThemingOutputs({ seeds: seeds(primary) }).css),
    )
    expect(achromatic).toEqual(chromatic)
    expect(chromatic).toContain(HOVER_NAME)
    expect(chromatic).toContain(ACTIVE_NAME)
  })

  it('a copy adding action.secondary.hover to ACHROMATIC_MAPPING alone reds both branch rows (the control)', () => {
    const widened = { ...ACHROMATIC_MAPPING, [HOVER]: EXPECTED_STEPS_MAPPING(HOVER) }
    expect(branchRowsHold(widened, ACHROMATIC_BRANCH_SLOTS)).toEqual([
      'ACHROMATIC_MAPPING is not exactly the six',
      "ACHROMATIC_BRANCH_SLOTS is not the mapping's keys",
    ])
  })
})

function EXPECTED_STEPS_MAPPING(slot: string): SlotMapping {
  const steps = EXPECTED_STEPS[slot] ?? { light: NaN, dark: NaN }
  return {
    light: { scale: 'neutral', step: steps.light },
    dark: { scale: 'neutral', step: steps.dark },
  }
}

describe('AC-secondary-action-states-06 covers: R3, R4', () => {
  it.each(COLUMNS)(
    'under %s, the harness computes the pairs of a copy without the two entries plus exactly the two text pairs, in each scheme',
    (_label, primary) => {
      const result = runPipeline(seeds(primary))
      const listed = (adjacency: readonly Adjacency[]): string[] =>
        runContrastHarness(result, adjacency).map((r) => `${r.scheme} ${pairKey(r.pair)}`)
      const shipped = listed(ADJACENCY)
      const copy = new Set(listed(withoutStateEntries(ADJACENCY)))
      expect(shipped.filter((entry) => !copy.has(entry)).toSorted(byText)).toEqual(
        [
          `dark ${FOREGROUND}|${ACTIVE}|text`,
          `dark ${FOREGROUND}|${HOVER}|text`,
          `light ${FOREGROUND}|${ACTIVE}|text`,
          `light ${FOREGROUND}|${HOVER}|text`,
        ].toSorted(byText),
      )
      expect([...copy].filter((entry) => !shipped.includes(entry))).toEqual([])
    },
  )

  it.each(COLUMNS)(
    'under %s, no harness pair puts a state fill against a surface, the rest, the other state, border.focus or content.inverse',
    (_label, primary) => {
      const forbidden = new Set(['action.secondary', ...STATES, 'border.focus', 'content.inverse'])
      const results = runContrastHarness(runPipeline(seeds(primary)))
      const partners = results.flatMap(({ pair }) => stateFillPartner(pair))
      expect(partners.filter((other) => other.startsWith('surface.'))).toEqual([])
      expect(partners.filter((other) => forbidden.has(other))).toEqual([])
    },
  )

  it.each(COLUMNS)(
    'the build composes under %s with no pair below its floor and no same-step hit',
    (_label, primary) => {
      expect(() => composeThemingOutputs({ seeds: seeds(primary) })).not.toThrow()
      const result = runPipeline(seeds(primary))
      expect(runContrastHarness(result).filter((r) => !r.pass)).toEqual([])
      expect(checkSameStepLint(result, 'nave')).toEqual([])
    },
  )
})

/**
 * What a pair that names a state fill puts against it: the other side, or nothing when the pair
 * names no state fill.
 */
function stateFillPartner(pair: Adjacency): string[] {
  if (isState(pair.subject)) return [pair.against]
  return isState(pair.against) ? [pair.subject] : []
}

/**
 * The entries naming a state fill beyond the two text pairs under the secondary foreground.
 */
function extraStateFillEntries(block: AdjacencyBlock): string[] {
  return Object.entries(block).flatMap(([subject, partners]) =>
    (Array.isArray(partners) ? partners : [])
      .filter(({ against }) => isState(subject) || isState(against))
      .filter(
        ({ against, class: kind }) =>
          !(subject === FOREGROUND && kind === 'text' && isState(against)),
      )
      .map(({ against, class: kind }) => `extra: ${subject} against ${against} (${kind})`),
  )
}

/**
 * The adjacency entries that name a state fill, judged: what is declared beyond the two text
 * pairs under the secondary foreground, and which of those two is missing.
 */
function stateFillEntryProblems(block: AdjacencyBlock): string[] {
  const foreground = block[FOREGROUND]
  const declared = Array.isArray(foreground) ? foreground : []
  const missing = STATES.filter((state) =>
    declared.every((p) => !(p.against === state && p.class === 'text')),
  ).map((state) => `missing: ${FOREGROUND} against ${state} (text)`)
  return [...extraStateFillEntries(block), ...missing]
}

describe('AC-secondary-action-states-07 covers: R4', () => {
  it('the only entries naming a state fill are the two text pairs under action.secondary.foreground, whose array is the rest, the hover, the active', () => {
    const block = shippedBlock()
    expect(stateFillEntryProblems(block)).toEqual([])
    expect(block[FOREGROUND]).toEqual([
      { against: 'action.secondary', class: 'text' },
      { against: HOVER, class: 'text' },
      { against: ACTIVE, class: 'text' },
    ])
    for (const state of STATES) expect(Object.keys(block)).not.toContain(state)
  })

  it.each([
    [HOVER, 'surface.base', 'non-text'],
    [ACTIVE, 'action.secondary', 'text'],
    [HOVER, ACTIVE, 'text'],
    [HOVER, 'surface.inverse', 'non-text'],
    ['border.focus', ACTIVE, 'non-text'],
    ['content.inverse', HOVER, 'text'],
    ['content.primary', HOVER, 'text'],
  ])(
    'a planted %s against %s (%s) reds the check, naming it (the control)',
    (subject, against, kind) => {
      const block = structuredClone(shippedBlock())
      const partners = block[subject]
      block[subject] = [...(Array.isArray(partners) ? partners : []), { against, class: kind }]
      expect(stateFillEntryProblems(block)).toEqual([
        `extra: ${subject} against ${against} (${kind})`,
      ])
    },
  )

  it.each(STATES)(
    'a copy without the %s entry reds the check, naming the missing one (the control)',
    (state) => {
      const block = structuredClone(shippedBlock())
      const partners = block[FOREGROUND]
      block[FOREGROUND] = (Array.isArray(partners) ? partners : []).filter(
        (p) => p.against !== state,
      )
      expect(stateFillEntryProblems(block)).toEqual([
        `missing: ${FOREGROUND} against ${state} (text)`,
      ])
    },
  )
})

type Guard = 'assertCoverageFloor' | 'assertNoOrphanedSemanticSlot'

/**
 * A copy of `tokens.json` whose secondary foreground declares only the given state fills, on
 * disk, so the build reads it as it reads the shipped file.
 */
function tokensJsonDeclaring(states: readonly string[]): { file: string; source: unknown } {
  const source = JSON.parse(tokensJsonText) as {
    $extensions: { 'dev.navecss.theming': { adjacency: AdjacencyBlock } }
  }
  const block = source.$extensions['dev.navecss.theming'].adjacency
  const partners = block[FOREGROUND]
  block[FOREGROUND] = (Array.isArray(partners) ? partners : []).filter(
    (p) => !isState(p.against) || states.includes(p.against),
  )
  const directory = mkdtempSync(path.join(tmpdir(), 'nave-secondary-states-'))
  const file = path.join(directory, 'tokens.json')
  writeFileSync(file, `${JSON.stringify(source, undefined, 2)}\n`)
  return { file, source }
}

const noOrphanCheck = (): { excluded: string[]; open: string[] } => ({ excluded: [], open: [] })

/**
 * The message the theming build fails with over a `tokens.json` copy, with the named guards'
 * calls taken out of the build; `undefined` when it composes.
 */
async function buildFailure(file: string, removed: readonly Guard[]): Promise<string | undefined> {
  vi.resetModules()
  vi.doMock('../../src/theming/tokens-source.ts', async () => ({
    ...(await vi.importActual<Record<string, unknown>>('../../src/theming/tokens-source.ts')),
    TOKENS_JSON_PATH: file,
    loadShippedTokensSource: (): unknown => JSON.parse(readFileSync(file, 'utf8')),
  }))
  vi.doMock('../../src/theming/adjacency.ts', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('../../src/theming/adjacency.ts')
    return {
      ...actual,
      ...(removed.includes('assertCoverageFloor') && { assertCoverageFloor: (): void => {} }),
      ...(removed.includes('assertNoOrphanedSemanticSlot') && {
        assertNoOrphanedSemanticSlot: noOrphanCheck,
      }),
    }
  })
  const step = await import('../../src/theming/build-step.ts')
  try {
    step.composeThemingOutputs({ tokensSourcePaths: [file] })
    return undefined
  } catch (error) {
    return (error as Error).message
  }
}

const ORPHAN_MESSAGE = (slot: string): string =>
  `Adjacency coverage: the semantic slot "${slot}" carries no adjacency declaration`

describe('AC-secondary-action-states-07 covers: R4 (the build fails closed without the two entries)', () => {
  afterEach(() => {
    vi.doUnmock('../../src/theming/tokens-source.ts')
    vi.doUnmock('../../src/theming/adjacency.ts')
  })

  const INPUTS = [
    ['neither entry declared', HOVER, []],
    ['only the active entry removed', ACTIVE, [HOVER]],
  ] as const

  it.each(INPUTS)(
    'with %s, the build exits non-zero naming the category (or the slot, should the orphan guard ever run first)',
    async (_label, slot, kept) => {
      const message = await buildFailure(tokensJsonDeclaring(kept).file, [])
      expect(message).toMatch(
        new RegExp(`"secondaryForegroundOnStates"|"${slot.replaceAll('.', String.raw`\.`)}"`),
      )
    },
  )

  it.each(INPUTS)(
    'with %s, the orphan guard itself names %s over the copy',
    async (_label, slot, kept) => {
      const { materializeAdjacency, assertNoOrphanedSemanticSlot } = await vi.importActual<
        typeof AdjacencySourceModule
      >('../../src/theming/adjacency-source.ts')
      const copy = materializeAdjacency(tokensJsonDeclaring(kept).source)
      expect(() => assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS, copy)).toThrow(ORPHAN_MESSAGE(slot))
    },
  )

  it.each(INPUTS)(
    'with %s and the coverage floor taken out of the build, the build fails with the orphan guard naming %s',
    async (_label, slot, kept) => {
      expect(await buildFailure(tokensJsonDeclaring(kept).file, ['assertCoverageFloor'])).toMatch(
        new RegExp(`^${ORPHAN_MESSAGE(slot).replaceAll('.', String.raw`\.`)}`),
      )
    },
  )

  it.each(INPUTS)(
    'with %s and both guards taken out, neither message appears (the control)',
    async (_label, _slot, kept) => {
      const message =
        (await buildFailure(tokensJsonDeclaring(kept).file, [
          'assertCoverageFloor',
          'assertNoOrphanedSemanticSlot',
        ])) ?? ''
      expect(message).not.toContain('secondaryForegroundOnStates')
      expect(message).not.toContain('Adjacency coverage: the semantic slot')
    },
  )
})

describe('AC-secondary-action-states-08 covers: R4', () => {
  const PREVIOUS_NINE = [
    'contentOnSurface',
    'inversePair',
    'onActionOnAction',
    'textOnFeedback',
    'sunken',
    'borderControl',
    'borderFocus',
    'filledAction',
    'filledFeedback',
  ]

  it('the shipped set passes the floor, whose categories are the previous nine plus the one for the secondary foreground on its states', () => {
    expect(() => assertCoverageFloor()).not.toThrow()
    const categories = Object.keys(coverageCategories())
    expect(categories.slice(0, PREVIOUS_NINE.length)).toEqual(PREVIOUS_NINE)
    expect(categories).toHaveLength(PREVIOUS_NINE.length + 1)
  })

  it.each(STATES)(
    'a copy without the %s pair fails the floor, naming the new category',
    (state) => {
      const category = Object.keys(coverageCategories()).find(
        (name) => !PREVIOUS_NINE.includes(name),
      )
      const narrowed = ADJACENCY.filter(
        (pair) => !(pair.subject === FOREGROUND && pair.against === state),
      )
      expect(narrowed).toHaveLength(ADJACENCY.length - 1)
      expect(() => assertCoverageFloor(narrowed)).toThrow(`"${category}"`)
    },
  )

  it('a copy adding a pair beyond the minimum still passes (widening is ungated)', () => {
    expect(() =>
      assertCoverageFloor([
        ...ADJACENCY,
        { subject: 'content.secondary', against: HOVER, class: 'text' },
      ]),
    ).not.toThrow()
  })

  it('no category requires a state fill against action.secondary, and state differentiation stays action.primary against its own states', () => {
    const withStateAgainstRest: Adjacency[] = [
      ...ADJACENCY,
      { subject: HOVER, against: 'action.secondary', class: 'non-text' },
    ]
    expect(coverageCategories(withStateAgainstRest)).toEqual(coverageCategories())
    const withoutPrimaryStates = ADJACENCY.filter(
      (pair) =>
        !(pair.subject === 'on-action.primary' && pair.against.startsWith('action.primary.')),
    )
    expect(coverageCategories(withoutPrimaryStates).secondaryForegroundOnStates).toBe(true)
  })
})

describe('AC-secondary-action-states-15 covers: R8', () => {
  it("TOKENS.md lists both states, each following --nave-color-tint, directly after action.secondary's own row", () => {
    const rows = readFileSync(path.resolve(here, '../../TOKENS.md'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('| `--nave-color-action-'))
    const cells = rows.map((row) => row.split('|').map((cell) => cell.trim()))
    const at = cells.findIndex((cell) => cell[1] === '`--nave-color-action-secondary`')
    expect(cells.slice(at + 1, at + 3).map((cell) => [cell[1], cell[2]])).toEqual([
      [`\`${HOVER_NAME}\``, 'yes'],
      [`\`${ACTIVE_NAME}\``, 'yes'],
    ])
  })
})
