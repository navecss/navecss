/**
 * What the source shows about a name given to Nave's `cx.dynamic()`: whether a name built at run
 * time (a template literal with slots, a string `+` chain with an operand that is not literal
 * text) can ever be an atom name, judged from the text written around its slots, and whether a
 * node holds a value chosen at run time.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

import { hasMatchingAtom } from './atoms.ts'
import {
  concatOperands,
  isBuiltName,
  isStringLiteral,
  resolveConstHop,
  unwrap,
} from './literal-pieces.ts'

type Node = TSESTree.Node

/**
 * One part of a built name read in source order: the static text, or `undefined` for a slot that
 * stands for any run of characters (the empty run included).
 */
type Part = string | undefined

/**
 * The text of a string literal, an expression-free template, or a `+` chain made only of such
 * operands, read through `as`/`satisfies`/`!`; `undefined` for anything else.
 */
function literalText(node: Node): string | undefined {
  const current = unwrap(node)
  if (isStringLiteral(current)) return current.value
  if (current.type === 'TemplateLiteral' && current.expressions.length === 0) {
    return current.quasis[0]!.value.cooked ?? current.quasis[0]!.value.raw
  }
  if (current.type === 'BinaryExpression' && current.operator === '+') {
    const texts = concatOperands(current).map((operand) => literalText(operand))
    return texts.every((text) => text !== undefined) ? texts.join('') : undefined
  }
  return undefined
}

/**
 * The parts of a built name (see `isBuiltName`): a template's static text and slots, or a
 * chain's literal-text operands and every other operand as a slot.
 */
function nameParts(node: Node): Part[] {
  if (node.type === 'TemplateLiteral') {
    return node.quasis.flatMap((quasi, index): Part[] => [
      quasi.value.cooked ?? quasi.value.raw,
      ...(index < node.expressions.length ? [undefined] : []),
    ])
  }
  return concatOperands(node).map((operand) => literalText(operand))
}

const escapeText = (text: string): string =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)

/**
 * True when some atom name is the static texts of the built name `node`, in order, with each slot
 * standing for any run of characters; atom names are the installed core's own, compared
 * case-sensitively, so static text holding whitespace fits nothing.
 */
export function isFitByAtom(node: Node): boolean {
  const pattern = nameParts(node)
    .map((part) => (part === undefined ? '.*' : escapeText(part)))
    .join('')
  const fit = new RegExp(`^${pattern}$`, 'u')
  return hasMatchingAtom((name) => fit.test(name))
}

/**
 * The operands whose own nature decides whether `node` holds a value chosen at run time, or
 * `undefined` when `node` is itself such a value (a call, a member, a built name): both branches
 * of a conditional, the right side of `&&` only (its left side is a condition), both sides of
 * `||` and `??`, the operands of a `+` chain, and the one slot of a single-slot template.
 */
function valueParts(node: Node): Node[] | undefined {
  switch (node.type) {
    case 'BinaryExpression': {
      return node.operator === '+' ? concatOperands(node) : undefined
    }
    case 'ConditionalExpression': {
      return [node.consequent, node.alternate]
    }
    case 'LogicalExpression': {
      return node.operator === '&&' ? [node.right] : [node.left, node.right]
    }
    case 'TemplateLiteral': {
      if (node.expressions.length === 0) return []
      return isBuiltName(node) ? undefined : [node.expressions[0]!]
    }
    default: {
      return undefined
    }
  }
}

/**
 * True when `node` holds a value chosen at run time rather than a literal: anything but a
 * literal, `undefined`, an expression-free template or a chain of those, looking through
 * wrappers, one `const` hop and the parts `valueParts` names.
 */
export function isRunTimeValue(node: Node, scope: Scope.Scope, canHop = true): boolean {
  const current = unwrap(node)
  if (current.type === 'Literal') return false
  if (current.type === 'Identifier') {
    if (current.name === 'undefined') return false
    const hop = canHop ? resolveConstHop(current, scope) : undefined
    return hop ? isRunTimeValue(hop.init, hop.scope, false) : true
  }
  const parts = valueParts(current)
  return parts === undefined || parts.some((part) => isRunTimeValue(part, scope, canHop))
}
