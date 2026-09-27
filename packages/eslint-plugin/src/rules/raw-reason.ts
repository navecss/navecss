/**
 * Rule 2, the `cx.raw()` reason requirement: a `cx.raw()` call needs a reason exactly when it
 * carries literal class text rule 1 would report anywhere else, read the way rule 1 reads it
 * (so a helper or Nave `cx()` call inside it is read through its arguments). Everything else in
 * `cx.raw()` (a member expression, an identifier, a call to any other function) is composition:
 * it needs no reason, and a stray comment near it is inert. Not scoped to `className`: a
 * `cx.raw()` call anywhere in the file is checked.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Rule } from 'eslint'

import { atomNameForClass } from '../atoms.ts'
import { collectCxBindings, NO_CX_BINDINGS, resolveCxCallee } from '../cx-binding.ts'
import { rawProblemText, rawRemedyText, renderDeclared } from '../messages.ts'
import { reportablePiecesInCall } from '../raw-admission.ts'
import { compileAllow, getNaveSettings } from '../settings.ts'

const MARKER = 'nave-escape'

const FILLER_REASONS = new Set(['fixme', 'n/a', 'reason', 'todo', 'wip'])

/**
 * A comment's own text with block-comment decoration removed: the extra `*` that opens a
 * `/** ... *\/` comment, and the ` * ` a multi-line block comment starts each line with, so
 * the reason reads the same however the comment is laid out.
 */
function commentText(comment: TSESTree.Comment): string {
  if (comment.type === 'Line') return comment.value
  return comment.value
    .replace(/^\*/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*(?!\/)/, ''))
    .join(' ')
}

/**
True when a comment starts with the marker, however it is laid out.
 */
function hasMarker(comment: TSESTree.Comment): boolean {
  return commentText(comment).trimStart().startsWith(MARKER)
}

/**
 * True when `comment` is a valid reason: the marker, a colon, then text holding at least one
 * letter or digit in any script, and not one of the filler words (compared whole, trimmed,
 * case-insensitively).
 */
function isValidReason(comment: TSESTree.Comment): boolean {
  const text = commentText(comment)
  const colon = text.indexOf(':')
  if (colon === -1 || text.slice(0, colon).trim() !== MARKER) return false
  const reason = text.slice(colon + 1).trim()
  if (!/[\p{L}\p{N}]/u.test(reason)) return false
  return !FILLER_REASONS.has(reason.toLowerCase())
}

/**
The call's opening `(`, right after its callee.
 */
function openParenOf(
  context: Rule.RuleContext,
  node: TSESTree.CallExpression,
): ReturnType<Rule.RuleContext['sourceCode']['getTokenAfter']> {
  return context.sourceCode.getTokenAfter(node.callee as never, {
    filter: (token) => token.value === '(',
  })
}

/**
The first comment token right after the call's opening `(`, if any.
 */
function firstInsideParens(
  context: Rule.RuleContext,
  node: TSESTree.CallExpression,
): TSESTree.Comment | undefined {
  const openParen = openParenOf(context, node)
  if (!openParen) return undefined
  const next = context.sourceCode.getTokenAfter(openParen, { includeComments: true })
  if (!next || (next.type !== 'Block' && next.type !== 'Line')) return undefined
  return next as unknown as TSESTree.Comment
}

/**
 * True when a marker sits anywhere but first inside the parentheses: before the call, inside
 * the parentheses after something else (between or after the arguments, a second comment,
 * inside an argument or an inner call), or right after the call.
 */
function isMisplaced(
  context: Rule.RuleContext,
  node: TSESTree.CallExpression,
  first: TSESTree.Comment | undefined,
): boolean {
  const { sourceCode } = context
  const comments = [
    ...sourceCode.getCommentsBefore(node as never),
    ...sourceCode.getCommentsInside(node as never),
    ...sourceCode.getCommentsAfter(node as never),
  ] as unknown as TSESTree.Comment[]
  return comments.some((comment) => comment !== first && hasMarker(comment))
}

/**
The call's arguments as written, whitespace collapsed, for the reason form a message prints.
 */
function argumentsText(context: Rule.RuleContext, node: TSESTree.CallExpression): string {
  const first = node.arguments[0]
  const last = node.arguments.at(-1)
  if (!first || !last) return ''
  const text = context.sourceCode.text.slice(first.range[0], last.range[1])
  return text.replaceAll(/\s+/g, ' ')
}

export const rawReasonRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A cx.raw() call carrying undeclared literal class text needs a reason.',
      url: 'https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#rule-2-the-cxraw-reason',
    },
    messages: {
      missing: '{{problem}} {{remedies}}',
      misplaced:
        "A nave-escape reason counts only as the first thing inside {{callee}}()'s parentheses, before any argument: {{reasonForm}}.",
    },
    schema: [],
  },
  create(context) {
    const settings = getNaveSettings(context)
    const allowEntries = compileAllow(settings.allow)
    const declared = renderDeclared(allowEntries)
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

        const ctx = { bindings, helpers: settings.helpers, sourceCode: context.sourceCode }
        const [piece] = reportablePiecesInCall(ctx, call, scope, allowEntries)
        if (!piece) return

        const reasonComment = firstInsideParens(context, call)
        if (reasonComment && isValidReason(reasonComment)) return

        const callee = context.sourceCode.getText(call.callee as never)
        const reasonForm = `${callee}(/* ${MARKER}: ... */ ${argumentsText(context, call)})`
        if (isMisplaced(context, call, reasonComment)) {
          context.report({ node, messageId: 'misplaced', data: { callee, reasonForm } })
          return
        }
        context.report({
          node,
          messageId: 'missing',
          data: {
            problem: rawProblemText(
              piece.text,
              callee,
              atomNameForClass(piece.text),
              piece.kind === 'atom'
                ? {
                    callee: context.sourceCode.getText(piece.callee as never),
                    isContainer: piece.isContainer,
                    rendered: piece.rendered,
                  }
                : undefined,
            ),
            remedies: rawRemedyText(declared, piece.text, reasonForm),
          },
        })
      },
    }
  },
}
