/**
 * The two focus atoms and what a later declaration can take from them. `focusRing` draws the
 * keyboard focus indicator, and a later declaration that leaves no outline over it removes the
 * indicator; `srOnlyFocusable` reveals itself on focus, and a later declaration that hides it again
 * leaves a skip link hidden when it has focus. A value that cannot be read statically (`var()`,
 * `env()`, `attr()`) or that another rule decides (`inherit`, `revert`) is never judged.
 */
import type { Finding, OrderDeclaration } from './order-model.ts'

import { type Token, tokenize } from './tokenizer.ts'

export const RING_CLAUSE = 'This hides the keyboard focus indicator that "focusRing" draws.'
export const REVEAL_CLAUSE =
  'This hides again what "srOnlyFocusable" reveals on focus, such as a skip link.'

const OUTLINE_PROPERTIES = new Set([
  'all',
  'outline',
  'outline-color',
  'outline-style',
  'outline-width',
])
const STYLE_KEYWORDS = new Set([
  'auto',
  'dashed',
  'dotted',
  'double',
  'groove',
  'inset',
  'outset',
  'ridge',
  'solid',
])
const UNJUDGED_FUNCTIONS = new Set(['attr', 'env', 'var'])
const STYLE_RESETTING = new Set(['all', 'outline', 'outline-style'])
const DECIDED_ELSEWHERE = new Set(['inherit', 'revert', 'revert-layer'])

/**
 * The tokens of a value without whitespace or comments.
 */
function significantTokens(value: string): Token[] {
  return tokenize(value).filter((t) => t.type !== 'whitespace-token' && t.type !== 'comment')
}

/**
 * A value as the lowercase text of its significant tokens joined, without whitespace or comments,
 * so `inset( /* c *\/ 50% )` reads as `inset(50%)`.
 */
function compact(value: string): string {
  return significantTokens(value)
    .map((token) => token.raw)
    .join('')
    .toLowerCase()
}

/**
 * The lowercase text of an ident token.
 */
function identOf(token: Token | undefined): string | undefined {
  return token?.type === 'ident-token' ? String(token.structured?.value).toLowerCase() : undefined
}

/**
 * Whether a token is a zero length or a bare zero.
 */
function isZero(token: Token): boolean {
  return (
    (token.type === 'number-token' || token.type === 'dimension-token') &&
    (token.structured as { value: number }).value === 0
  )
}

const BLOCK_OPENERS = new Set(['(-token', '[-token', 'function-token', '{-token'])
const BLOCK_CLOSERS = new Set([')-token', ']-token', '}-token'])

/**
 * The tokens of a value that stand at its top level: outside every function and every
 * parenthesis, bracket or brace, through its matching close. A zero channel in `rgb(255 0 0)` or
 * a zero term in `calc(0px + 2px)` is not a zero width, and nothing inside them is read.
 */
function topLevelTokens(tokens: readonly Token[]): Token[] {
  let depth = 0
  const kept: Token[] = []
  for (const token of tokens) {
    if (BLOCK_OPENERS.has(token.type)) depth += 1
    else if (BLOCK_CLOSERS.has(token.type)) depth = Math.max(0, depth - 1)
    else if (depth === 0) kept.push(token)
  }
  return kept
}

/**
 * Whether an `outline` shorthand leaves no visible outline: no style other than `none`, or a zero
 * width, or `transparent`, each read from the shorthand's top level.
 */
function isOutlineShorthandHiding(tokens: readonly Token[]): boolean {
  const top = topLevelTokens(tokens)
  const idents = top.map((token) => identOf(token))
  if (idents.every((ident) => ident === undefined || !STYLE_KEYWORDS.has(ident))) return true
  return top.some((token) => isZero(token)) || idents.includes('transparent')
}

/**
 * Whether a declaration sets the outline style to `auto`, which asks for the browser's own ring:
 * `outline-style: auto`, or `auto` at the top level of an `outline`.
 */
function isAutoStyle(declaration: OrderDeclaration): boolean {
  const property = declaration.prop.toLowerCase()
  const tokens = significantTokens(declaration.value)
  if (property === 'outline-style') return identOf(tokens[0]) === 'auto'
  if (property !== 'outline') return false
  return topLevelTokens(tokens).some((token) => identOf(token) === 'auto')
}

/**
 * Whether a single keyword value (`initial`, `unset`) hides the ring on `property`; `undefined`
 * when the value is not one of them, `false` for the ones another rule decides.
 */
function keywordHides(property: string, keyword: string): boolean | undefined {
  if (keyword === 'initial' || keyword === 'unset') return STYLE_RESETTING.has(property)
  if (DECIDED_ELSEWHERE.has(keyword)) return false
  return undefined
}

/**
 * Whether the value of a longhand or shorthand of the outline hides the ring.
 */
function isRingHiddenByValue(property: string, tokens: readonly Token[]): boolean {
  if (property === 'outline') return isOutlineShorthandHiding(tokens)
  if (property === 'outline-style') return identOf(tokens[0]) === 'none'
  if (property === 'outline-width') return tokens.length === 1 && isZero(tokens[0]!)
  if (property === 'outline-color') return identOf(tokens[0]) === 'transparent'
  return false
}

/**
 * Whether a declaration leaves `focusRing`'s outline hidden, judged on what can be read.
 */
function isRingHidden(declaration: OrderDeclaration): boolean {
  const property = declaration.prop.toLowerCase()
  if (!OUTLINE_PROPERTIES.has(property)) return false
  const tokens = significantTokens(declaration.value)
  if (
    tokens.some(
      (t) =>
        t.type === 'function-token' &&
        UNJUDGED_FUNCTIONS.has(String(t.structured?.value).toLowerCase()),
    )
  ) {
    return false
  }
  const keyword = tokens.length === 1 ? identOf(tokens[0]) : undefined
  const judged = keyword === undefined ? undefined : keywordHides(property, keyword)
  return judged ?? isRingHiddenByValue(property, tokens)
}

/**
 * Whether a declaration of a later block hides the ring: its value hides it, and no declaration of
 * its block sets the style to `auto`.
 */
function isRingHiddenInBlock(
  declaration: OrderDeclaration,
  siblings: readonly OrderDeclaration[],
): boolean {
  return isRingHidden(declaration) && siblings.every((sibling) => !isAutoStyle(sibling))
}

/**
 * Whether `declaration` is `clip-path: inset(50%)`.
 */
function isClipPathInset(declaration: OrderDeclaration): boolean {
  return (
    declaration.prop.toLowerCase() === 'clip-path' && compact(declaration.value) === 'inset(50%)'
  )
}

/**
 * Whether a declaration is one of the three that hide a skip link again.
 */
function isHidingSize(declaration: OrderDeclaration): boolean {
  const prop = declaration.prop.toLowerCase()
  return (prop === 'width' || prop === 'height') && compact(declaration.value) === '1px'
}

/**
 * Whether `declarations` hold `width: 1px`, `height: 1px` and `overflow: hidden` together.
 */
function isHidingTrio(declarations: readonly OrderDeclaration[]): boolean {
  const isPresent = (prop: string, value: string): boolean =>
    declarations.some((d) => d.prop.toLowerCase() === prop && compact(d.value) === value)
  return isPresent('width', '1px') && isPresent('height', '1px') && isPresent('overflow', 'hidden')
}

/**
 * Whether a declaration of a later block hides the reveal again.
 */
function isRevealHidden(
  declaration: OrderDeclaration,
  siblings: readonly OrderDeclaration[],
): boolean {
  if (isClipPathInset(declaration)) return true
  const prop = declaration.prop.toLowerCase()
  const isTrioMember =
    isHidingSize(declaration) || (prop === 'overflow' && compact(declaration.value) === 'hidden')
  return isTrioMember && isHidingTrio(siblings)
}

/**
 * The focus clause a finding carries, if the later declaration takes something from a focus atom.
 */
export function focusClauseOf(finding: Finding): string | undefined {
  const { atom } = finding.unit
  const { declaration, siblings } = finding.candidate
  if (atom.name === 'focusRing' && isRingHiddenInBlock(declaration, siblings)) return RING_CLAUSE
  if (atom.name === 'srOnlyFocusable' && isRevealHidden(declaration, siblings)) return REVEAL_CLAUSE
  return undefined
}
