/**
 * R5's "read literal parts" algorithm, shared by rule 1 (the class channel), rule 2 (the
 * `cx.raw()` reason requirement) and the counting rule: every place in this plugin that has to
 * decide "is this class text a literal an author wrote" reads a piece the same way, or the three
 * rules would disagree on the same source.
 *
 * A piece is a run of non-whitespace class text reachable through: a string literal; the static
 * parts of a template literal (split on whitespace); both branches of a conditional; the right
 * side of `&&` and both sides of `||`/`??`; both sides of a string `+`; an identifier bound by a
 * `const` in scope, followed exactly one hop; and TypeScript's `as`, `satisfies` and non-null `!`
 * wrappers. A piece produced by a template literal's static text next to a `${}` slot is marked
 * `truncated`, since only a prefix entry (never a pattern) can admit a rendered token that is cut
 * off mid-word.
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

const isStringLiteral = (node: Node): node is TSESTree.StringLiteral =>
  node.type === 'Literal' && typeof node.value === 'string'

/**
 * Splits text on whitespace, tagging the last resulting token as `truncated` (right-cut by a
 * following `${}` slot) where asked. A token that is instead LEFT-cut (glued to a PRECEDING
 * slot's rendered value) is never a piece at all: it is a suffix fragment of an unknown runtime
 * string, and a prefix entry cannot soundly admit something that is not anchored at its own
 * start (`` `${styles.root}--wide` ``'s "--wide" passes unconditionally, never reported).
 */
function splitWhitespace(
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
function collectTemplatePieces(node: TSESTree.TemplateLiteral): LiteralPiece[] {
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
Resolves `node` to its single `const` initializer, one hop, or returns `undefined`.
 */
export function resolveConstHop(node: Node, scope: Scope.Scope): Node | undefined {
  if (node.type !== 'Identifier') return undefined
  let current: Scope.Scope | null = scope
  while (current) {
    const variable = current.variables.find((candidate) => candidate.name === node.name)
    if (variable) {
      if (variable.defs.length !== 1) return undefined
      const def = variable.defs[0]!
      if (def.type !== 'Variable' || def.parent.kind !== 'const') return undefined
      return (def.node.init as Node | null) ?? undefined
    }
    current = current.upper
  }
  return undefined
}

/**
 * Collects every literal piece reachable from `node`. `canHopIdentifier` gates the one const
 * hop: it is true only for the piece passed in from the caller, never for a hop's own init, so a
 * second hop (`const B = A`) is never followed.
 *
 * Unwraps the single-child productions (`&&`'s right side, a TS wrapper, one identifier hop) in
 * a loop rather than by tail-recursing into each: same algorithm, but a loop reassigning `node`
 * is what a single-branch unwrap actually is, and it keeps the branching productions below
 * (conditional, `||`/`??`, string `+`) as the only real recursion in this function.
 *
 * One dispatch per grammar production R5 defines; splitting it across files would scatter one
 * algorithm the three calling rules must agree on byte-for-byte.
 */
// eslint-disable-next-line complexity
export function collectLiteralPieces(
  node: Node,
  scope: Scope.Scope,
  canHopIdentifier = true,
): LiteralPiece[] {
  let current = node
  let canHop = canHopIdentifier

  while (true) {
    if (isStringLiteral(current)) {
      return splitWhitespace(current.value, current, false, false)
    }

    if (current.type === 'TemplateLiteral') {
      return collectTemplatePieces(current)
    }

    if (current.type === 'ConditionalExpression') {
      return [
        ...collectLiteralPieces(current.consequent, scope, canHop),
        ...collectLiteralPieces(current.alternate, scope, canHop),
      ]
    }

    if (current.type === 'LogicalExpression') {
      if (current.operator === '&&') {
        current = current.right
        continue
      }
      // '||' and '??': both sides are candidates for the literal being used.
      return [
        ...collectLiteralPieces(current.left, scope, canHop),
        ...collectLiteralPieces(current.right, scope, canHop),
      ]
    }

    if (current.type === 'BinaryExpression' && current.operator === '+') {
      return [
        ...collectLiteralPieces(current.left, scope, canHop),
        ...collectLiteralPieces(current.right, scope, canHop),
      ]
    }

    if (TRANSPARENT_WRAPPER_TYPES.has(current.type)) {
      current = (current as TSESTree.TSAsExpression).expression
      continue
    }

    if (canHop) {
      const hopInit = resolveConstHop(current, scope)
      if (hopInit) {
        current = hopInit
        canHop = false
        continue
      }
    }

    return []
  }
}
