/**
 * Reduced motion, cross-layer.
 *
 * The reset and the token layer both collapse durations under
 * `prefers-reduced-motion: reduce`, and they have to agree on the value they collapse to. They
 * used to disagree (0ms against 0.01ms), and 0ms is the wrong one: a transition with a zero
 * combined duration is never generated at all, so `transitionend` never fires and consumer code
 * awaiting it hangs, for exactly the population that asked for reduced motion. A prior fix found
 * that only the token half of that was instrumented.
 *
 * WHY THIS LIVES IN `@navecss/core` AND NOT IN `@navecss/tokens`. `@navecss/tokens#test`
 * declares its cache inputs from `packages/tokens/` alone, so with `packages/core/src/reset.css`
 * edited it is replayed FROM CACHE, on the exact edit this check exists to catch: an unforced
 * local `turbo run test --filter=@navecss/tokens` returns FULL TURBO and exit 0. CI is
 * unaffected (no turbo remote cache) and the Phase 3 review gate forces `TURBO_FORCE=1`, so the
 * exposure is the local run, which is the first signal the next person sees. `@navecss/core#test`
 * has `src/reset.css` in its own input set and depends on `@navecss/tokens`, so it invalidates
 * on BOTH sides. (An `inputs` entry on `tokens#test` was weighed and rejected: turbo inputs are
 * package-scoped, and the next person adding a cross-package read has to remember it.)
 *
 * The token side is read through the export map, the way a consumer reaches it; the reset side
 * is read from this package's own source, which is what `core#test` hashes.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGES = path.resolve(HERE, '../..')

interface ExportTarget {
  [condition: string]: ExportTarget | string
}

/**
 * Picks the CSS/ESM target out of an export-map entry, honouring conditions. Written as a loop
 * down the condition chain rather than `consumer-path.test.ts`'s recursion, which is the same
 * walk: this file is reachable by the repo-root ESLint run and that one is not.
 */
function pickTarget(entry: ExportTarget | string): string {
  let target: ExportTarget | string = entry
  while (typeof target !== 'string') {
    const conditions = target
    const next = ['style', 'import', 'default']
      .map((condition) => conditions[condition])
      .find((value) => value !== undefined)
    if (next === undefined) throw new Error(`no resolvable condition in ${JSON.stringify(target)}`)
    target = next
  }
  return target
}

/**
 * Resolves a bare `@navecss/*` specifier through that package's export map, the same walk
 * `consumer-path.test.ts` does. A raw relative path into a sibling package's `dist/` would read
 * a file no consumer is promised, and would keep reading it after the export map moved.
 */
function resolveWorkspace(specifier: string): string {
  const [, name, ...rest] = specifier.split('/')
  const packageDir = path.join(PACKAGES, name!)
  const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
    exports: ExportTarget
  }
  const subpath = rest.length > 0 ? `./${rest.join('/')}` : '.'
  const entry = manifest.exports[subpath]
  if (entry === undefined) throw new Error(`${specifier} is not in the export map`)
  return path.join(packageDir, pickTarget(entry))
}

const tokensCss = readFileSync(resolveWorkspace('@navecss/tokens/css'), 'utf8')
const resetCss = readFileSync(path.resolve(HERE, '../src/reset.css'), 'utf8')

const REDUCED_MOTION_AT_RULE = '@media (prefers-reduced-motion: reduce)'

/**
 * Both patterns are left-anchored on purpose: without the lookbehind, a custom property whose
 * name merely ENDS in one of these (`--x-transition-duration`) matches too, which is a false red
 * on a stylesheet that never touched the real property.
 */
const TOKEN_DURATION_PATTERN = /(?<![\w-])(--nave-motion-duration-[\w-]+):\s*([^;]+);/g
const RESET_DURATION_PATTERN = /(?<![\w-])(animation-duration|transition-duration):\s*([^;]+);/g

/**
 * The duration properties the reset collapses, pinned BY NAME so one silently leaving the
 * collapse set reddens this test rather than only the whole-file snapshot. This is an assertion
 * ABOUT the reset's reduced-motion block, not a restatement of it: the block's non-duration
 * declarations' VALUES are neither named nor characterised here — a separate, unnamed class
 * assertion below does characterise every declaration in the block,
 * duration or not, but only for whether it carries `!important`, which is a different property
 * than the one this constant pins.
 */
const COLLAPSED_RESET_PROPERTIES = ['animation-duration', 'transition-duration']

/**
 * The token-layer duration custom properties collapsed under reduced motion, pinned by name for
 * the same reason. `--nave-motion-duration-instant` is deliberately absent: it is already 0ms.
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
 *
 * Duplicated from `packages/tokens/test/reduced-motion.test.ts` rather than imported: the two
 * live in different packages, and a cross-package import of a test file is the reach this check
 * was moved here to stop making.
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
 * collapse the same property in two reduced-motion blocks (a second block scoped to one
 * selector), and a multiset comparison would call that a violation. What the pinned constants
 * claim is which properties collapse, not how many rules say so.
 */
const collapsedProperties = (declarations: readonly Declaration[]): Set<string> =>
  new Set(declarations.map(({ property }) => property))

const values = (declarations: readonly Declaration[]): Set<string> =>
  new Set(declarations.map((declaration) => declaration.value))

describe('reduced motion: packages/core/src/reset.css', () => {
  it('collapses exactly the duration properties named in COLLAPSED_RESET_PROPERTIES, to one value', () => {
    const declarations = reducedMotionDeclarations(resetCss, RESET_DURATION_PATTERN)

    // An exact set, not `length > 0`: a duration leaving the collapse set is named here.
    expect(collapsedProperties(declarations)).toEqual(new Set(COLLAPSED_RESET_PROPERTIES))
    expect(values(declarations).size).toBe(1)
  })

  /**
   * Per the project's accessibility steward, Cap 2's obligation is RETENTION
   * of the four `!important` flags, which neither existing instrument guards. A lint forbidding
   * a NEW `!important` in reset.css does not assert retention (a contributor who deletes all
   * four flags also deletes their disables and the build stays green); `reducedMotionDeclarations`
   * strips the flag before this file's other assertions ever see it, which is the exact
   * blindness this one closes by reading the block through `reducedMotionBlocks` instead. A
   * CLASS assertion, not an enumeration: it does not name the four properties, so a fifth
   * declaration added to the block is covered on arrival and any one losing its flag reddens.
   *
   * A plain `;`-split of the block body also matches the nested selector's opening fragment and
   * the block's own trailing close-brace fragment, neither of which is a declaration — matching
   * `property: value;` directly (rather than splitting) is what keeps this to real declarations
   * only, verified against a real injected removal before trusting it.
   */
  it('every declaration inside every reduced-motion block carries !important (Cap 2 retention)', () => {
    const DECLARATION_PATTERN = /([\w-]+)\s*:\s*([^;{}]+);/g
    let checked = 0
    for (const block of reducedMotionBlocks(resetCss)) {
      for (const [, property, value] of block.matchAll(DECLARATION_PATTERN)) {
        checked += 1
        expect(
          value,
          "Every declaration in the reset's reduced-motion block must carry !important. " +
            'Important declarations reverse cascade-layer order, and that is the only thing ' +
            'that lets this block reach motion authored outside Nave in a later layer, which ' +
            'is the whole reason it exists. Removing a flag is a deliberate change to a ' +
            `recorded exception, not a tidy-up: open an issue. (Failing declaration: "${property!}".)`,
        ).toMatch(/!\s*important/i)
      }
    }
    // A pattern match producing zero declarations would pass vacuously; assert it actually ran.
    expect(checked).toBeGreaterThan(0)
  })
})

describe('reduced motion: the reset and the token layer agree on the collapse value', () => {
  it('both collapse to 0.01ms, the value the reset is compared against rather than pinned twice', () => {
    const tokenDeclarations = reducedMotionDeclarations(tokensCss, TOKEN_DURATION_PATTERN)
    const resetDeclarations = reducedMotionDeclarations(resetCss, RESET_DURATION_PATTERN)

    expect(collapsedProperties(tokenDeclarations)).toEqual(new Set(COLLAPSED_TOKEN_PROPERTIES))

    // One literal, then agreement: the second assertion has an independent way to fail, which
    // comparing two sets that are each already pinned to the same literal does not.
    const tokenValues = values(tokenDeclarations)
    expect(tokenValues).toEqual(new Set(['0.01ms']))
    expect(values(resetDeclarations)).toEqual(tokenValues)
  })
})
