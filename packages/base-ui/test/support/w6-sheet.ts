/**
 * Stylesheet readings for the completion tests that are arithmetic or exact text rather than a
 * render: a class's declarations, a value resolved against the built tokens, the ring's reach,
 * and a rule's text with a class name swapped.
 */
import { atoms } from '@navecss/core/atoms'

import { type FlatDeclaration, flatten } from './stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './tokens.ts'

const PX_PER_REM = 16

/**
The declarations of one class, every rule and nesting of it, in order.
 */
export const declarationsOf = (css: string, cls: string): FlatDeclaration[] =>
  flatten(css).filter(({ owner }) => owner === cls)

/**
A length with the built tokens substituted for its `var()`s (a fallback only where the token is
not declared), in pixels.
 */
export const pixels = (
  value: string,
  tokens: ReadonlyMap<string, string> = builtTokens(),
): number => {
  const substituted = value.replaceAll(
    /var\((--[\w-]+)(?:,\s*([^)]*))?\)/g,
    (_, name: string, fallback: string | undefined) => tokens.get(name) ?? fallback ?? '',
  )
  const resolved = substituted === value ? value : substituted
  const match = /^(-?\d*\.?\d+)(px|rem)$/.exec(resolved.trim())
  if (match === null) {
    throw new Error(`${value} does not resolve to a length (got ${resolved})`)
  }
  const amount = Number(match[1])
  return match[2] === 'rem' ? amount * PX_PER_REM : amount
}

/**
The custom properties the workspace's built tokens declare.
 */
export const builtTokens = (): ReadonlyMap<string, string> => declaredTokens(workspaceTokensCss())

/**
The ring `atoms.focusRing` draws, in pixels: its width W and its offset O. A band outside a
control's border box reaches W + O.
 */
export const ringReach = (): { offset: number; reach: number; width: number } => {
  const block = atoms.focusRing.pseudos[':focus-visible']
  const width = pixels(block['outline-width'] ?? '')
  const offset = pixels(block['outline-offset'] ?? '')
  return { offset, reach: width + offset, width }
}

/**
The pixel values of every word of a declaration of the class (`padding: 6px 8px` is two).
 */
export const wordsInPixels = (css: string, cls: string, property: string): number[] =>
  declarationsOf(css, cls)
    .filter((item) => item.property === property && item.selectors.length === 1)
    .flatMap(({ value }) => value.split(/\s+/).map((word) => pixels(word)))
