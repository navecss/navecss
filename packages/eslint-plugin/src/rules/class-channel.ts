/**
 * Rule 1, the class channel (R5, R5a, R6, R7): inside a JSX `className`/`class` value, no class
 * text is written as a literal outside `cx.raw()` unless the consumer declared it as theirs, and
 * a string passed to Nave's `cx()` must name a real atom. Helper calls (`clsx`, `classnames`,
 * `cn`, and any `cx` not bound to Nave's) are checked through their arguments, never passed or
 * flagged outright. The walk-and-report logic lives in `class-channel-walk.ts`; this file owns
 * only the JSX-attribute selection and the rule's registration.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { JSSyntaxElement, Rule } from 'eslint'

import { collectCxBindings, type CxBindings, NO_CX_BINDINGS } from '../cx-binding.ts'
import { compileAllow, getNaveSettings } from '../settings.ts'
import { type CheckState, walkTopLevelPosition } from './class-channel-walk.ts'

/**
True for a `className`/`class` JSX attribute (rule 1 reads neither `classNames` nor a slot prop).
 */
function isClassAttribute(node: TSESTree.JSXAttribute): boolean {
  return (
    node.name.type === 'JSXIdentifier' &&
    (node.name.name === 'className' || node.name.name === 'class')
  )
}

export const classChannelRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'No class text is written as a literal outside cx.raw() unless declared.',
      url: 'https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#rule-1-the-class-channel',
    },
    schema: [],
  },
  create(context) {
    const settings = getNaveSettings(context)
    const allowEntries = compileAllow(settings.allow)
    let bindings: CxBindings = NO_CX_BINDINGS

    return {
      Program(node) {
        bindings = collectCxBindings(
          context.sourceCode,
          node as unknown as TSESTree.Program,
          settings.cxModules,
          context.filename,
        )
      },
      JSXAttribute(node: JSSyntaxElement) {
        const attribute = node as unknown as TSESTree.JSXAttribute
        const { value } = attribute
        if (!value || !isClassAttribute(attribute)) return
        const expression = value.type === 'JSXExpressionContainer' ? value.expression : value
        if (expression.type === 'JSXEmptyExpression') return

        const state: CheckState = { context, bindings, settings, allowEntries }
        const scope = context.sourceCode.getScope(node as never)
        walkTopLevelPosition(state, expression, scope, true)
      },
    }
  },
}
