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
import { afterAll, describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
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

  it('compares the atoms of one directive in time proportional to the pairs, not more', () => {
    const size = 400
    const measured = ratio(
      () => warningsViaText(`.x { @nave ${'hideDesktopUp '.repeat(size)}; }`),
      () => warningsViaText('.x { @nave hideDesktopUp; }\n'.repeat(size)),
    )

    expect(measured).toBeLessThan(8)
  }, 60_000)

  it('compares the directives of one rule in time proportional to the pairs, not more', () => {
    const size = 320
    const measured = ratio(
      () => warningsViaText(`.x { ${'@nave hideDesktopUp textLeft; '.repeat(size)} }`),
      () => warningsViaText('.x { @nave hideDesktopUp textLeft; }\n'.repeat(size)),
    )

    expect(measured).toBeLessThan(8)
  }, 60_000)
})
