/**
 * The counting rule (R9): `off` in `recommended`. Reports, at `error`, every `cx.raw()` call
 * rule 2 counts (with or without a reason — a reason does not leave the count) and every disable
 * comment that names one of this plugin's rules, or names no rule at all. ESLint's own bulk
 * suppressions (`eslint --suppress-rule`) turn that report into a project's held escape count.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Rule } from 'eslint'

import { collectCxBindings, NO_CX_BINDINGS, resolveCxCallee } from '../cx-binding.ts'
import { reportablePiecesInCall } from '../raw-admission.ts'
import { compileAllow, getNaveSettings } from '../settings.ts'

/**
 * The directive list ESLint's JavaScript `SourceCode` builds for itself (present since before
 * this package's ESLint floor, and part of ESLint's language interface), which its own `SourceCode`
 * type does not declare.
 */
interface DirectiveSource {
  getDisableDirectives(): {
    directives: {
      node: unknown
      type: 'disable' | 'disable-line' | 'disable-next-line' | 'enable'
      value: string
    }[]
  }
}

/**
 * The rule ids a disable directive's value names, split the way ESLint splits it: on commas,
 * each trimmed and stripped of one pair of matching quotes. An empty list means the directive
 * names no rule, which covers every rule.
 */
function directiveRuleNames(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim().replace(/^(['"]?)(.*)\1$/su, '$2'))
    .filter((name) => name.length > 0)
}

/**
True when a directive's rule list is empty (every rule) or names an id under this plugin's prefix.
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
    let bindings = NO_CX_BINDINGS
    const prefix = context.id.split('/', 1)[0]!

    return {
      Program(node) {
        bindings = collectCxBindings(
          context.sourceCode,
          node as unknown as TSESTree.Program,
          settings.cxModules,
          context.filename,
        )

        // ESLint's own parse of every disable directive in the file (its grammar, its handling
        // of a `-- description` and of a block comment running over several lines), so a
        // comment ESLint honours is never one this rule reads differently.
        const { directives } = (
          context.sourceCode as unknown as DirectiveSource
        ).getDisableDirectives()
        for (const directive of directives) {
          if (directive.type === 'enable') continue
          if (isMatchingThisPlugin(directiveRuleNames(directive.value), prefix)) {
            const comment = directive.node as TSESTree.Comment
            context.report({ loc: comment.loc, messageId: 'disableComment' })
          }
        }
      },
      CallExpression(node) {
        const call = node as unknown as TSESTree.CallExpression
        const scope = context.sourceCode.getScope(node)
        if (resolveCxCallee(call.callee, bindings, scope) !== 'raw') return
        const ctx = { bindings, helpers: settings.helpers, sourceCode: context.sourceCode }
        if (reportablePiecesInCall(ctx, call, scope, allowEntries).length > 0) {
          context.report({ node, messageId: 'escape' })
        }
      },
    }
  },
}
