/**
 * Rule 1, the class channel: inside a JSX `className`/`class` value, no class text is written as
 * a literal outside `cx.raw()` unless the consumer declared it as theirs, and an argument of
 * Nave's `cx()` must name a real atom. Helper calls (`clsx`, `classnames`, `cn`, and any `cx` not
 * bound to Nave's) are checked through their arguments, never passed or flagged outright. What
 * counts as a literal lives in `class-channel-walk.ts`; this file selects the attribute and
 * words the reports.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { JSSyntaxElement, Rule } from 'eslint'

import { atomNameForClass } from '../atoms.ts'
import { collectCxBindings, type CxBindings, NO_CX_BINDINGS } from '../cx-binding.ts'
import {
  cxAtomMessage,
  isNaveOutputLike,
  literalClassMessage,
  naveOutputMessage,
  renderDeclared,
} from '../messages.ts'
import { isReportedPiece } from '../raw-admission.ts'
import { compileAllow, type CompiledAllowEntry, getNaveSettings } from '../settings.ts'
import { type ClassHit, collectValueHits } from './class-channel-walk.ts'

/**
True for a `className`/`class` JSX attribute (rule 1 reads neither `classNames` nor a slot prop).
 */
function isClassAttribute(node: TSESTree.JSXAttribute): boolean {
  return (
    node.name.type === 'JSXIdentifier' &&
    (node.name.name === 'className' || node.name.name === 'class')
  )
}

/**
 * The message for an `&&` directly in a class position, quoting its operands as written: as the
 * whole value a falsy condition becomes the attribute itself, in a template slot it is
 * interpolated into the class list.
 */
function slotAndMessage(rendered: string, isWhole: boolean): string {
  return isWhole
    ? `A falsy condition becomes the whole className: false/null/undefined drop the attribute and 0 renders as the class "0". Use cx.raw(${rendered}) or a ternary ending ": undefined".`
    : `A falsy condition's own value is interpolated into the class list here (false/undefined/null/0). Use cx.raw(${rendered}) or a ternary ending ": ''".`
}

/**
The message rule 1 reports for `hit`, or `undefined` when nothing is reported.
 */
function hitMessage(
  hit: ClassHit,
  context: Rule.RuleContext,
  declared: string,
  allowEntries: CompiledAllowEntry[],
): string | undefined {
  const { sourceCode } = context
  if (hit.kind === 'slot-and') {
    return slotAndMessage(sourceCode.getText(hit.node as never), hit.isWhole)
  }
  if (!isReportedPiece(hit, allowEntries)) return undefined
  if (isNaveOutputLike(hit.text)) {
    return naveOutputMessage(hit.text, atomNameForClass(hit.text))
  }
  if (hit.kind === 'atom') {
    return cxAtomMessage(sourceCode.getText(hit.callee as never), hit.rendered, declared)
  }
  return literalClassMessage(hit.text, declared)
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
    const declared = renderDeclared(allowEntries)
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

        const ctx = { bindings, helpers: settings.helpers, sourceCode: context.sourceCode }
        const scope = context.sourceCode.getScope(node as never)
        // One report per offending construct: the same literal reached twice (one `const`
        // named in both branches of a conditional) is still one class written once.
        const reported = new Set<string>()
        for (const hit of collectValueHits(ctx, expression, scope)) {
          const message = hitMessage(hit, context, declared, allowEntries)
          const key = `${hit.node.range.join(':')}|${message}`
          if (message === undefined || reported.has(key)) continue
          reported.add(key)
          context.report({ node: hit.node as unknown as JSSyntaxElement, message })
        }
      },
    }
  },
}
