/**
 * What the Astro criteria compare a build with: the atom sets the fixture's code names, the
 * parity comparison of a filtered layer against the `'all'` build's, and small readers of a page.
 */
import { isDeepStrictEqual } from 'node:util'

import { atomClassMap } from '../../src/atoms.ts'
import { classesOf, keepOnly, parseAtomicLayer, withoutAtomicLayer } from './css-layer.ts'
import { atomLayerAtoms, atoms } from './used-atoms-css.ts'

/**
 * Every built-in atom, sorted as the tests sort a set.
 */
export const ALL_ATOMS: string[] = atoms(...Object.keys(atomClassMap))

/**
 * The atoms only code the browser runs names: `OnlyIsland.tsx`, `lib/lazy.ts` and the `<script>`
 * of `index.astro`.
 */
export const BROWSER_ONLY = ['inlineFlex', 'wFull', 'truncate']

/**
 * The `navePlugin(...)` argument that lists them in `keep`.
 */
export const BROWSER_KEEP = `{ keep: ['inlineFlex', 'wFull', 'truncate'] }`

/**
 * The atoms the fixture's pages and islands name, with the browser-only keep.
 */
export function eSet(...extra: string[]): string[] {
  return atoms(
    'block',
    'flex',
    'textCenter',
    'grid',
    'justifyCenter',
    'flexWrap',
    'itemsEnd',
    'relative',
    ...BROWSER_ONLY,
    ...extra,
  )
}

/**
 * The atoms a stylesheet's atomic layer names.
 */
export function setOfCss(css: string): string[] {
  return atomLayerAtoms(css)
}

/**
 * What differs between a filtered stylesheet and the `'all'` build's: the layer must hold, for
 * each atom of the filtered one's set, the rules the full layer gives it and no other atom's,
 * and everything outside the layer must be byte for byte the same. An empty list is parity.
 */
export function parityProblems(used: string, all: string): string[] {
  const problems: string[] = []
  const set = atomLayerAtoms(used)
  const expected = keepOnly(parseAtomicLayer(all), classesOf(...set))
  if (!isDeepStrictEqual(parseAtomicLayer(used), expected))
    problems.push(`the layer is not the full layer pruned to ${set.join(', ')}`)
  if (withoutAtomicLayer(used) !== withoutAtomicLayer(all))
    problems.push('the text outside the layer differs')
  return problems
}

/**
 * The `class` attribute of the element with `id` in `html`.
 */
export function classOf(html: string, id: string): string | undefined {
  const tag = new RegExp(String.raw`<[a-z][^>]*\bid="${id}"[^>]*>`).exec(html)?.[0]
  return tag === undefined ? undefined : /\bclass="([^"]*)"/.exec(tag)?.[1]
}

/**
 * The `Set` of all of a list's duplicates removed, sorted.
 */
export function unique(list: readonly string[]): string[] {
  return [...new Set(list)].toSorted()
}
