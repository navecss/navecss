/**
 * Rule 2, the `cx.raw()` reason requirement (R8): a `cx.raw()` call needs a reason exactly when
 * it carries literal class text rule 1 would otherwise report — a literal piece R6 does not
 * admit, or a "Nave outputs this" literal. Everything else in `cx.raw()` (a member expression, an
 * identifier, a call) is composition: it needs no reason and a stray comment near it is inert.
 * Not scoped to `className` — a `cx.raw()` call anywhere in the file is checked.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Rule } from 'eslint'

import { collectCxBindings, NO_CX_BINDINGS, resolveCxCallee } from '../cx-binding.ts'
import { requiresReasonForCall } from '../raw-admission.ts'
import { compileAllow, getNaveSettings } from '../settings.ts'

export const MARKER = 'nave-escape'

const FILLER_REASONS = new Set(['fixme', 'n/a', 'reason', 'todo', 'wip'])

/**
True when `text` (a comment's own text, without the `//`/`/* *\/` delimiters) is a valid reason.
 */
function isValidReasonText(text: string): boolean {
  const colon = text.indexOf(':')
  if (colon === -1 || !text.trimStart().startsWith(MARKER)) return false
  const markerPart = text.slice(0, colon).trim()
  if (markerPart !== MARKER) return false
  const reason = text.slice(colon + 1).trim()
  if (!/[a-zA-Z0-9]/.test(reason)) return false
  return !FILLER_REASONS.has(reason.toLowerCase())
}

/**
The first comment token right after the call's opening `(`, if any.
 */
function firstInsideParens(
  context: Rule.RuleContext,
  node: TSESTree.CallExpression,
): TSESTree.Comment | undefined {
  const sourceCode = context.sourceCode
  const openParen = sourceCode.getTokenAfter(node.callee as never, {
    filter: (token) => token.value === '(',
  })
  if (!openParen) return undefined
  const next = sourceCode.getTokenAfter(openParen, { includeComments: true })
  if (!next || (next.type !== 'Block' && next.type !== 'Line')) return undefined
  return next as unknown as TSESTree.Comment
}

/**
 *
 */
function hasMarkerAnywhere(comments: TSESTree.Comment[]): boolean {
  return comments.some((comment) => comment.value.trimStart().startsWith(MARKER))
}

/**
 *
 */
function isMisplaced(context: Rule.RuleContext, node: TSESTree.CallExpression): boolean {
  const sourceCode = context.sourceCode
  const before = sourceCode.getCommentsBefore(node as never) as unknown as TSESTree.Comment[]
  if (hasMarkerAnywhere(before)) return true
  for (const argument of node.arguments) {
    const inside = sourceCode.getCommentsInside(argument as never) as unknown as TSESTree.Comment[]
    if (hasMarkerAnywhere(inside)) return true
  }
  return false
}

export const rawReasonRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A cx.raw() call carrying undeclared literal class text needs a reason.',
      url: 'https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#rule-2-the-cxraw-reason',
    },
    messages: {
      missing:
        'This cx.raw() call carries class text this project does not declare as its own, and needs a reason: cx.raw(/* nave-escape: why this class */ ...).',
      misplaced:
        "The nave-escape reason must be the first thing inside cx.raw()'s parentheses, before any argument.",
    },
    schema: [],
  },
  create(context) {
    const settings = getNaveSettings(context)
    const allowEntries = compileAllow(settings.allow)
    let bindings = NO_CX_BINDINGS

    return {
      Program(node) {
        bindings = collectCxBindings(
          context.sourceCode,
          node as unknown as TSESTree.Program,
          settings.cxModules,
          context.filename,
        )
      },
      CallExpression(node) {
        const call = node as unknown as TSESTree.CallExpression
        const scope = context.sourceCode.getScope(node)
        if (resolveCxCallee(call.callee, bindings, scope) !== 'raw') return

        if (!requiresReasonForCall(call, scope, allowEntries)) return

        const reasonComment = firstInsideParens(context, call)
        if (reasonComment && isValidReasonText(reasonComment.value)) return

        if (isMisplaced(context, call)) {
          context.report({ node, messageId: 'misplaced' })
        } else {
          context.report({ node, messageId: 'missing' })
        }
      },
    }
  },
}
