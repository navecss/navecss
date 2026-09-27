/**
 * How class text an author wrote is cut into pieces, shared by every rule that has to decide
 * "is this class text a literal an author wrote": a string literal is split on whitespace, and a
 * template literal's static text is split the same way (and so is a run of string literals joined
 * by `+`, read as the one string it forms), a piece cut off by an adjacent `${}` slot
 * being marked `truncated`, since only a prefix entry (never a pattern) can admit a rendered
 * token that is cut off mid-word. The grammar that reaches these literals (conditionals, logical
 * operators, calls) lives in `rules/class-channel-walk.ts`.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

export interface LiteralPiece {
  /**
   * The class text itself, as written (one whitespace-free token).
   */
  text: string
  /**
   * The innermost node whose own text is this piece (for reporting the exact construct).
   */
  node: TSESTree.Node
  /**
   * True when this piece is a template's static text cut off by an adjacent `${}` slot.
   */
  truncated: boolean
}

type Node = TSESTree.Node

/**
 * Single-child wrappers read straight through: TypeScript's `as`, `satisfies` and non-null `!`,
 * and an optional chain (`cx?.('flex')` is a call wrapped in one).
 */
export const TRANSPARENT_WRAPPER_TYPES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
])

export const isStringLiteral = (node: Node): node is TSESTree.StringLiteral =>
  node.type === 'Literal' && typeof node.value === 'string'

/**
 * Splits text on whitespace, tagging the last resulting token as `truncated` (right-cut by a
 * following `${}` slot) where asked. A token that is instead LEFT-cut (glued to a PRECEDING
 * slot's rendered value) is never a piece at all: it is a suffix fragment of an unknown runtime
 * string, and a prefix entry cannot soundly admit something that is not anchored at its own
 * start (`` `${styles.root}--wide` ``'s "--wide" passes unconditionally, never reported).
 */
export function splitWhitespace(
  text: string,
  node: Node,
  isCutOnLeft: boolean,
  isCutOnRight: boolean,
): LiteralPiece[] {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0)
  const lastIndex = tokens.length - 1
  return tokens
    .filter((_token, index) => !(index === 0 && isCutOnLeft))
    .map((token, index) => ({
      text: token,
      node,
      truncated: index + (isCutOnLeft ? 1 : 0) === lastIndex && isCutOnRight,
    }))
}

/**
Collects the literal pieces from a template literal's own static quasis (never its slots).
 */
export function collectTemplatePieces(node: TSESTree.TemplateLiteral): LiteralPiece[] {
  const pieces: LiteralPiece[] = []
  for (const [index, quasi] of node.quasis.entries()) {
    const hasLeftSlot = index > 0
    const hasRightSlot = index < node.expressions.length
    const text = quasi.value.cooked ?? quasi.value.raw
    if (text.length === 0) continue
    const isStartingWithSpace = /^\s/.test(text)
    const isEndingWithSpace = /\s$/.test(text)
    pieces.push(
      ...splitWhitespace(
        text,
        quasi,
        hasLeftSlot && !isStartingWithSpace,
        hasRightSlot && !isEndingWithSpace,
      ),
    )
  }
  return pieces
}

/**
The operands of a chain of string `+`, in source order (`a + b + c` is `(a + b) + c`).
 */
export function concatOperands(node: Node): Node[] {
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return [...concatOperands(node.left), ...concatOperands(node.right)]
  }
  return [node]
}

/**
 * The pieces of a run of adjacent string literals in a `+` chain, read as the one string they
 * join into (`'legacy' + '-card'` is the one piece `legacy-card`), each piece at the literal it
 * starts in.
 */
export function joinedLiteralPieces(literals: TSESTree.StringLiteral[]): LiteralPiece[] {
  const starts: number[] = []
  let offset = 0
  for (const literal of literals) {
    starts.push(offset)
    offset += literal.value.length
  }
  const text = literals.map((literal) => literal.value).join('')
  return text
    .matchAll(/\S+/gu)
    .map((match) => {
      const owner = starts.findLastIndex((start) => start <= match.index)
      return { text: match[0], node: literals[owner]!, truncated: false }
    })
    .toArray()
}

export interface ConstHop {
  init: Node
  /**
  The scope the `const` was declared in, where names inside its initializer resolve.
   */
  scope: Scope.Scope
}

/**
 * Resolves an identifier to its single `const` initializer, one hop, or returns `undefined`. A
 * `let` or `var` is never followed: it can be reassigned, so its declaration does not say what
 * it holds. A TypeScript type-only declaration of the same name is skipped: it names a type,
 * never the value the identifier reads.
 */
export function resolveConstHop(node: Node, scope: Scope.Scope): ConstHop | undefined {
  if (node.type !== 'Identifier') return undefined
  let current: Scope.Scope | null = scope
  while (current) {
    const variable = current.set.get(node.name)
    if (variable && (variable as { isValueVariable?: boolean }).isValueVariable !== false) {
      if (variable.defs.length !== 1) return undefined
      const def = variable.defs[0]!
      if (def.type !== 'Variable' || def.parent.kind !== 'const') return undefined
      const init = def.node.init as Node | null
      return init ? { init, scope: variable.scope } : undefined
    }
    current = current.upper
  }
  return undefined
}
