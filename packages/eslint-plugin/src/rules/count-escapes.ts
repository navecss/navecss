/**
 * The counting rule (R9): `off` in `recommended`. Reports, at `error`, every `cx.raw()` call
 * rule 2 counts (with or without a reason — a reason does not leave the count) and every disable
 * comment that names one of this plugin's rules, or names no rule at all. ESLint's own bulk
 * suppressions (`eslint --suppress-rule`) turn that report into a project's held escape count.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Rule } from 'eslint'

import { collectCxBindings, resolveCxCallee } from '../cx-binding.ts'
import { requiresReasonForCall } from '../raw-admission.ts'
import { compileAllow, getNaveSettings } from '../settings.ts'

const DIRECTIVE_RE = /^\s*(eslint-disable(?:-next-line|-line)?|eslint-enable)(?:\s+([^\n]*))?$/s

/**
 *
 */
function directiveRuleNames(rest: string | undefined): string[] {
  if (!rest) return []
  const withoutDescription = rest.split(/\s+--\s/, 1)[0]!
  return withoutDescription
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

/**
 *
 */
function isMatchingThisPlugin(ruleNames: string[], prefix: string): boolean {
  if (ruleNames.length === 0) return true
  return ruleNames.some((name) => name.split('/', 1)[0] === prefix)
}

export const countEscapesRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Counts every cx.raw() escape and every disable comment that could hide one.',
      url: 'https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#the-count',
    },
    messages: {
      escape: 'This cx.raw() call carries an undeclared class: counted as an escape.',
      disableComment: 'This disable comment can hide an escape from the count.',
    },
    schema: [],
  },
  create(context) {
    const settings = getNaveSettings(context)
    const allowEntries = compileAllow(settings.allow)
    let bindings = { cxNames: new Set<string>(), rawNames: new Set<string>() }
    const prefix = context.id.split('/', 1)[0]!

    return {
      Program(node) {
        bindings = collectCxBindings(
          node as unknown as TSESTree.Program,
          settings.cxModules,
          context.filename,
        )

        for (const comment of context.sourceCode.getAllComments() as unknown as TSESTree.Comment[]) {
          const match = DIRECTIVE_RE.exec(comment.value)
          if (!match) continue
          const [, keyword, rest] = match
          if (keyword === 'eslint-enable') continue
          if (isMatchingThisPlugin(directiveRuleNames(rest), prefix)) {
            context.report({ loc: comment.loc, messageId: 'disableComment' })
          }
        }
      },
      CallExpression(node) {
        const call = node as unknown as TSESTree.CallExpression
        const scope = context.sourceCode.getScope(node)
        if (resolveCxCallee(call.callee, bindings, scope) !== 'raw') return
        if (requiresReasonForCall(call, scope, allowEntries)) {
          context.report({ node, messageId: 'escape' })
        }
      },
    }
  },
}
