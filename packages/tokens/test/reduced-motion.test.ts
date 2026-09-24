/**
 * Reduced motion, token layer.
 *
 * The token layer used to collapse durations to 0ms while the reset collapsed
 * to 0.01ms: same intent, two values. 0ms is the wrong one, because a transition
 * with a zero combined duration is never generated at all, so `transitionend`
 * never fires and consumer code awaiting it hangs, for exactly the population
 * that asked for reduced motion.
 *
 * The cross-layer half of that agreement (does the reset collapse to the same
 * value the token layer does) lives in
 * `packages/core/test/reset-reduced-motion.test.ts`, not here. This package's
 * `test` task takes its cache inputs from `packages/tokens/` alone, so a run of
 * it is replayed from cache on an edit to `packages/core/src/reset.css`, which
 * is the one edit that half exists to catch (found in a Phase 3 review).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOKENS_CSS = path.resolve(HERE, '../dist/tokens.css')
const tokensCss = readFileSync(TOKENS_CSS, 'utf8')

const REDUCED_MOTION_AT_RULE = '@media (prefers-reduced-motion: reduce)'

/**
 * The emitted duration custom properties. Held once rather than spelled at each call site:
 * the two copies drifted apart under the `--nave-` prefix rename and had to be merged by hand.
 *
 * Left-anchored on purpose: without the lookbehind, a custom property whose name merely ENDS
 * in one of these (`--x--nave-motion-duration-fast`) matches too.
 */
const TOKEN_DURATION_PATTERN = /(?<![\w-])(--nave-motion-duration-[\w-]+):\s*([^;]+);/g

/**
 * Exactly the duration tokens the build collapses under reduced motion, pinned BY NAME so a
 * token silently dropping out of the collapse set reddens this test rather than only the
 * whole-file snapshot (which goes red on any formatting change and is refreshed with `-u`).
 * `--nave-motion-duration-instant` is deliberately absent: it is already 0ms, so there is
 * nothing to collapse. Adding a reducible duration token is a deliberate edit to this list.
 */
const COLLAPSED_TOKEN_PROPERTIES = [
  '--nave-motion-duration-base',
  '--nave-motion-duration-fast',
  '--nave-motion-duration-slow',
]

interface Declaration {
  property: string
  value: string
}

/**
 * The index of the `}` that closes the block opened at `open`, or -1 if that block never closes.
 * Its own function so the depth counter is not a loop nested inside the block scan's loop.
 */
function matchingCloseBrace(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * The BODY of every `@media (prefers-reduced-motion: reduce)` block in the stylesheet, each
 * bounded by its own matching close brace.
 *
 * The bound is the whole point. Slicing from the at-rule to the file's last `}` gives a window
 * of "block opening to end of file", which (a) still matches a declaration that has been moved
 * OUT of the media query, the false green, and (b) sweeps in any rule sitting after the block
 * and everything between two reduced-motion blocks, the false reds.
 *
 * Comments are stripped first so a brace inside one cannot move a boundary. An unterminated
 * block throws rather than silently degrading back into a window that runs to end of file.
 */
function reducedMotionBlocks(css: string): string[] {
  const source = css.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const blocks: string[] = []

  let at = source.indexOf(REDUCED_MOTION_AT_RULE)
  while (at !== -1) {
    const open = source.indexOf('{', at)
    if (open === -1) throw new Error(`${REDUCED_MOTION_AT_RULE} at ${String(at)} opens no block`)
    const close = matchingCloseBrace(source, open)
    if (close === -1) throw new Error(`${REDUCED_MOTION_AT_RULE} at ${String(at)} never closes`)

    blocks.push(source.slice(open + 1, close))
    at = source.indexOf(REDUCED_MOTION_AT_RULE, close)
  }

  return blocks
}

/**
 * Every declaration inside a reduced-motion block whose property matches `propertyPattern`
 * (capture 1 the property, capture 2 the value), with any `!important` stripped. The
 * `!important` match is case- and space-insensitive: `! important` and `!IMPORTANT` are the
 * same declaration to a browser, and treating them as a different value is a false red.
 */
function reducedMotionDeclarations(css: string, propertyPattern: RegExp): Declaration[] {
  return reducedMotionBlocks(css).flatMap((block) =>
    block
      .matchAll(propertyPattern)
      .map(([, property, value]) => ({
        property: property!,
        value: value!.replaceAll(/\s*!\s*important/gi, '').trim(),
      }))
      .toArray(),
  )
}

/**
 * The SET of properties collapsed, not a sorted list of them: a stylesheet may legitimately
 * collapse the same property in two reduced-motion blocks, and a multiset comparison would call
 * that a violation. What `COLLAPSED_TOKEN_PROPERTIES` claims is WHICH properties collapse, not
 * how many rules say so.
 */
const collapsedProperties = (declarations: readonly Declaration[]): Set<string> =>
  new Set(declarations.map(({ property }) => property))

const values = (declarations: readonly Declaration[]): Set<string> =>
  new Set(declarations.map((declaration) => declaration.value))

describe('reduced motion: token layer', () => {
  it('collapses exactly the reducible duration tokens, to 0.01ms and never 0ms', () => {
    const declarations = reducedMotionDeclarations(tokensCss, TOKEN_DURATION_PATTERN)

    // An exact set, not `length > 0`: a duration leaving the collapse set is named here.
    expect(collapsedProperties(declarations)).toEqual(new Set(COLLAPSED_TOKEN_PROPERTIES))
    expect(values(declarations)).toEqual(new Set(['0.01ms']))
  })
})
