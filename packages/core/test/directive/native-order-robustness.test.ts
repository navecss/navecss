/**
 * AC-native-apply-order-54: the order check never fails a build and does not grow faster than
 * the stylesheet it reads. A selector nested so deep that it cannot be read is not compared, a
 * deeply nested group is still read, and the three shapes that made the check superlinear scale
 * as the stylesheet does. The scaling rows compare the time of a subject with the time of a
 * linear control of the same size in the same process, never with a clock budget.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { afterAll, describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { expandText } from '../../src/directive/expand-text.ts'
import { navePlugin } from '../../src/postcss.ts'
import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROBE = path.resolve(HERE, '../helpers/order-depth-probe.ts')

const scratch: string[] = []
afterAll(() => {
  for (const directory of scratch) rmSync(directory, { force: true, recursive: true })
})

interface Seen {
  readonly columns?: number[]
  readonly error?: string
  readonly hasSelector?: boolean
  readonly host: string
  readonly mode: string
}

/**
 * What every host did with a selector nesting `fn` to `depth`, in a process of its own.
 */
function probe(fn: string, depth: number, isCliRun: boolean): Seen[] {
  const directory = isCliRun ? mkdtempSync(path.join(tmpdir(), 'order-depth-')) : undefined
  if (directory !== undefined) scratch.push(directory)
  const result = spawnSync(
    process.execPath,
    [PROBE, fn, String(depth), ...(directory === undefined ? [] : [directory])],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error(`probe ${fn} ${depth} failed: ${result.stderr}`)
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Seen[]
}

describe.each(['not', 'is'])('AC-native-apply-order-54 — a selector nested %s( deep', (fn) => {
  it.each([10, 100])('is read at %i levels and warns once in every host', (depth) => {
    const column = `.x { @nave focusRing; `.length + 1

    for (const seen of probe(fn, depth, false)) {
      expect(seen.error, `${seen.host} ${seen.mode}`).toBeUndefined()
      expect(seen.columns, `${seen.host} ${seen.mode}`).toEqual([column])
      expect(seen.hasSelector).toBe(true)
    }
  })

  it.each([1000, 20_000])(
    'completes at %i levels, keeps the rule and agrees across hosts',
    (depth) => {
      const seenAll = probe(fn, depth, depth === 20_000)

      for (const seen of seenAll) {
        expect(seen.error, `${seen.host} ${seen.mode}`).toBeUndefined()
        expect(seen.hasSelector, `${seen.host} ${seen.mode}`).toBe(true)
      }
      const counts = seenAll
        .filter((seen) => seen.host !== 'expand')
        .map((seen) => (seen.columns ?? []).length)
      expect(new Set(counts).size).toBe(1)
      expect(counts[0]).toBeLessThanOrEqual(1)
    },
    60_000,
  )
})

/**
 * A rule holding `focusRing` and `levels` nested `@media` rules around a later outline-color.
 */
function nestedMedia(levels: number): string {
  return `.x { @nave focusRing; ${'@media (x) { '.repeat(levels)}&:focus-visible { outline-color: red }${' }'.repeat(levels)} }`
}

describe('AC-native-apply-order-54 — a nested group is read however deep it is', () => {
  it.each([7, 8, 9, 20, 40, 100])(
    'warns at %i nested @media levels, in both hosts',
    async (levels) => {
      expect(warningsViaText(nestedMedia(levels))).toHaveLength(1)
      expect(await warningsViaPostcss(nestedMedia(levels))).toHaveLength(1)
    },
  )

  it('completes at 5000 nested @media levels with a directive, in both hosts', async () => {
    const css = nestedMedia(5000)

    expect(() => warningsViaText(css)).not.toThrow()
    expect(() => expandText(css)).not.toThrow()
    await expect(warningsViaPostcss(css)).resolves.toBeDefined()
  }, 60_000)
})

/**
 * The least of `runs` timings of `work`, in milliseconds.
 */
function leastOf(work: () => void, runs = 5): number {
  let least = Infinity
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    work()
    least = Math.min(least, performance.now() - start)
  }
  return least
}

/**
 * How many times longer `subject` takes than `control`, each by its fastest of five runs.
 */
function ratio(subject: () => void, control: () => void): number {
  subject()
  control()
  return leastOf(subject) / leastOf(control)
}

/**
 * `.a` inside `levels` nested `:not(`.
 */
function nesting(levels: number): string {
  return `${':not('.repeat(levels)}.a${')'.repeat(levels)}`
}

describe('AC-native-apply-order-54 — the limit on nested selectors, and a rule whose own selector exceeds it', () => {
  it.each([
    [255, 1],
    [256, 1],
    [257, 0],
  ])('reads %i nested :not( levels and warns %i times, in both hosts', async (levels, count) => {
    const css = `.x { @nave focusRing; &${nesting(levels)} { outline-color: red } }`

    expect(warningsViaText(css)).toHaveLength(count)
    expect(await warningsViaPostcss(css)).toHaveLength(count)
  })

  it("completes when the rule's own selector nests 300 levels, in both hosts", async () => {
    const css = `.x${nesting(300)} { @nave focusRing; &:focus-visible { outline-color: red } }`

    expect(() => warningsViaText(css)).not.toThrow()
    await expect(warningsViaPostcss(css)).resolves.toBeDefined()
  })
})

describe('AC-native-apply-order-54 — scaling, as a ratio to a linear control', () => {
  it('has a calibration the scenarios can trust: a quadratic pattern is far slower than its twin', () => {
    const digits = '1'.repeat(20_000)
    const quadratic = new RegExp(String.raw`^\d+\.?\d*[a-z]+$`)
    const linear = new RegExp(String.raw`^\d+(?:\.\d*)?[a-z]+$`)

    const measured = ratio(
      () => quadratic.test(digits),
      () => linear.test(digits),
    )

    expect(measured, 'inconclusive: the quadratic twin must be far slower').toBeGreaterThan(100)
  })

  it('reads a media length of 20000 digits no slower than the same length with a unit', () => {
    const size = 20_000
    const digits = '1'.repeat(size)
    const measured = ratio(
      () =>
        warningsViaText(`.x { @nave hideDesktopUp; @media (width < ${digits}) { display: flex } }`),
      () =>
        warningsViaText(
          `.x { @nave hideDesktopUp; @media (width < ${digits}px) { display: flex } }`,
        ),
    )

    expect(measured).toBeLessThan(20)
  })

  // The two rows below compare a subject whose cost is its pairs with a control that has none, so
  // the ratio moves with the control: a rule costs under half of what it did before a plain object
  // stopped throwing five errors to be recognised, and the ratio went from 3 to 4 up to 7 to 8
  // (4 to 5 under coverage). They guard the growth. They cannot guard the constant: the check as it
  // was before the first memoisation grows the same way, at about four times the cost per pair, and
  // measures 12 to 16 here, which a loaded machine reaches too. The cost per pair is counted in
  // native-order-counts.test.ts instead.
  it('compares the atoms of one directive in time proportional to the pairs, not more', () => {
    const size = 400
    const measured = ratio(
      () => warningsViaText(`.x { @nave ${'hideDesktopUp '.repeat(size)}; }`),
      () => warningsViaText('.x { @nave hideDesktopUp; }\n'.repeat(size)),
    )

    expect(measured).toBeLessThan(16)
  }, 60_000)

  it('compares the directives of one rule in time proportional to the pairs, not more', () => {
    const size = 320
    const measured = ratio(
      () => warningsViaText(`.x { ${'@nave hideDesktopUp textLeft; '.repeat(size)} }`),
      () => warningsViaText('.x { @nave hideDesktopUp textLeft; }\n'.repeat(size)),
    )

    expect(measured).toBeLessThan(16)
  }, 60_000)
})

/**
 * `.x` holding `size` nested rules that each carry a directive, then `size` rules that override
 * it, inside `wrap` (a group, or nothing), the directives marked or not.
 */
function grid(
  size: number,
  options: { readonly isMarked?: boolean; readonly wrap?: string } = {},
): string {
  const marker = options.isMarked ? '/* nave-allow-override: display */ ' : ''
  const directives = Array.from(
    { length: size },
    (_, i) => `&.a${i} { @nave ${marker}hideDesktopUp }`,
  )
  const overrides = Array.from({ length: size }, (_, i) => `&.b${i} { display: flex }`)
  const inner = `${directives.join(' ')} ${overrides.join(' ')}`
  return `.x { ${options.wrap === undefined ? inner : `${options.wrap} { ${inner} }`} }`
}

/**
 * `size` rules that each hold one directive and one override: the same pairs, none of them n by n.
 */
function control(
  size: number,
  options: { readonly isMarked?: boolean; readonly wrap?: string } = {},
): string {
  const marker = options.isMarked ? '/* nave-allow-override: display */ ' : ''
  const body = `&.a0 { @nave ${marker}hideDesktopUp } &.b0 { display: flex }`
  const rule = `.x { ${options.wrap === undefined ? body : `${options.wrap} { ${body} }`} }`
  return `${rule}\n`.repeat(size)
}

describe('AC-native-apply-order-54 — the move check costs what the pairs cost, not their square', () => {
  it('reads 40 nested directives against 40 later blocks as it reads 40 small rules', () => {
    const measured = ratio(
      () => warningsViaText(grid(40)),
      () => warningsViaText(control(40)),
    )

    expect(measured).toBeLessThan(25)
  }, 300_000)

  it('reads the same shape inside a group, 20 by 20', () => {
    const wrap = '@media (width >= 60em)'
    const measured = ratio(
      () => warningsViaText(grid(20, { wrap })),
      () => warningsViaText(control(20, { wrap })),
    )

    expect(measured).toBeLessThan(25)
  }, 300_000)

  it('reads 40 marked directives against 40 later blocks as it reads 40 small rules', () => {
    const measured = ratio(
      () => warningsViaText(grid(40, { isMarked: true })),
      () => warningsViaText(control(40, { isMarked: true })),
    )

    expect(measured).toBeLessThan(25)
  }, 300_000)

  it('completes 80 by 80 in a process of its own, with every warning', () => {
    const result = spawnSync(
      process.execPath,
      ['--max-old-space-size=1024', path.resolve(HERE, '../helpers/order-scale-probe.ts'), '80'],
      { encoding: 'utf8', timeout: 240_000 },
    )

    expect(result.status, result.stderr.slice(-300)).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({ warnings: 6400 })
  }, 300_000)
})

// The bounds are coarse on purpose: 40 samples on a machine running 12 busy loops, under coverage,
// measured up to 4.6, 10.5 and 5.9 (unloaded 1.6, 5 and 3). What each speedup of the check saves is
// counted exactly in native-order-counts.test.ts, which a loaded machine cannot move.
describe('AC-native-apply-order-54 — a small rule with a directive costs what a small rule costs', () => {
  const size = 300

  it('expands 300 rules of one atom in the text host no slower than 8 times 300 plain ones', () => {
    const measured = ratio(
      () => expandText('.a { @nave flex; }\n'.repeat(size)),
      () => expandText('.a { display: flex; }\n'.repeat(size)),
    )

    expect(measured).toBeLessThan(8)
  }, 120_000)

  it('expands 300 rules of one atom in the PostCSS host no slower than 20 times 300 plain ones', () => {
    const plugin = navePlugin()
    const process = (css: string): void => {
      postcss([plugin]).process(css, { from: undefined }).sync()
    }
    const measured = ratio(
      () => process('.a { @nave flex; }\n'.repeat(size)),
      () => process('.a { display: flex; }\n'.repeat(size)),
    )

    expect(measured).toBeLessThan(20)
  }, 120_000)

  it('makes a plugin from 80 atoms in no more than 30 times the time of parsing them as a stylesheet', () => {
    const atoms: Record<string, AtomDefinition> = {}
    for (let i = 0; i < 80; i++) {
      atoms[`a${i}`] = {
        declarations: { color: 'red', margin: '1px' },
        pseudos: { ':hover': { color: 'blue' } },
        media: { '(width >= 40em)': { declarations: { color: 'green' } } },
      }
    }
    const css = Object.keys(atoms)
      .map(
        (name) =>
          `.${name}{color:red;margin:1px}.${name}:hover{color:blue}@media (width >= 40em){.${name}{color:green}}`,
      )
      .join('\n')
    const measured = ratio(
      () => navePlugin({ extend: atoms }),
      () => postcss.parse(css),
    )

    expect(measured).toBeLessThan(30)
  }, 120_000)
})
