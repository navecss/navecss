/**
 * `seed-channel-split.ts`'s own unit: whitespace trimming, numeric-token reading, and the
 * paren-depth-aware channel/alpha split, exercised directly rather than only indirectly through
 * `seed-ingest.test.ts`'s refusal-classification tests. Focused here on the CSS-whitespace-edge
 * trimming `splitChannelArgs`/`readNumericToken` share, and its time complexity.
 */
import { describe, expect, it } from 'vitest'

import { readNumericToken, splitChannelArgs } from '../../src/theming/seed-channel-split.ts'

describe('CSS-whitespace-only trimming', () => {
  it('trims CSS whitespace (space, tab, newline, CR, form feed) from both edges', () => {
    expect(splitChannelArgs(' \t\n\r\f1 2 3\f\r\n\t ').parts).toEqual(['1', '2', '3'])
  })

  it('leaves a non-CSS Unicode space (NBSP) in place, where readNumericToken refuses it', () => {
    const { parts } = splitChannelArgs('1\u{A0}2 3')
    // NBSP is not a CSS separator, so "1\u{A0}2" stays one token, not two.
    expect(parts).toEqual(['1\u{A0}2', '3'])
    expect(readNumericToken(parts[0]!)).toBeNaN()
  })

  it('a channel token surrounded by CSS whitespace on both sides still reads correctly', () => {
    expect(readNumericToken(' \t 42 \t ')).toBeNaN() // readNumericToken itself does not trim
    expect(splitChannelArgs(' \t 42 \t ').parts).toEqual(['42'])
  })

  // `cssTrim` (internal) used to be `text.replaceAll(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '')`: a
  // real polynomial-time ReDoS on library input (CodeQL `js/polynomial-redos`), because its two
  // alternatives anchor at OPPOSITE ends (`^` vs `$`). Only the leading alternative can ever
  // match at position 0, so every interior starting position falls through to the trailing one,
  // which greedily consumes the whitespace run starting there and then backtracks it one
  // character at a time hunting for a `$` that a run not reaching the string's end can never
  // produce — O(run length) wasted work at EVERY position inside the run, O(n²) total. A channel
  // argument shaped `<non-space><tabs>*N<non-space>` (neither space touching an edge of the
  // whole `args` string) is exactly what a hostile or malformed seed value can contain, and
  // exactly the reported trigger shape ("many repetitions of '\t'"). Measured against the old
  // regex-based implementation directly (not reproduced here, to avoid shipping a slow path):
  // 20,000 tabs took ~0.75 s, 40,000 ~3.2 s and 80,000 ~12 s, four times the time for twice the
  // input: quadratic. `cssTrim` is now a two-pointer scan with no regex in the whitespace-edge
  // path at all, so it has nothing to backtrack on; this pins the bound going forward without
  // needing to run the vulnerable shape to prove it.
  it('a long run of tabs neither leading nor trailing the whole args string does not blow up quadratically', () => {
    const pathological = `1${'\t'.repeat(200_000)}2`
    const t0 = performance.now()
    const { parts } = splitChannelArgs(pathological)
    const elapsedMs = performance.now() - t0
    // The tab run sits between two channel tokens (not at an edge of `args`), so
    // `splitTopLevel`'s own whitespace split turns it into two parts; `cssTrim` itself finds
    // nothing to strip here (neither edge is whitespace) but is exercised first regardless, on
    // the full pathological string, which is what the timing bound below pins.
    expect(parts).toEqual(['1', '2'])
    // A quadratic implementation takes about a minute here (see the measurement above); a
    // linear one takes tens of milliseconds, so the bound leaves room for a loaded CI runner
    // without letting the quadratic path through.
    expect(elapsedMs).toBeLessThan(2000)
  })
})
