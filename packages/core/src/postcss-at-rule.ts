/**
 * Turns `plan()`'s per-directive answer into PostCSS nodes for one `@nave`
 * at-rule — split out of `postcss.ts`, one level further than the
 * resolver/PostCSS-emitter split this refactor is built around, to keep
 * that file under the project's file-length lint.
 */
import type { AtRule as PostCSSAtRule, Result } from 'postcss'

import postcss from 'postcss'

import type { Diagnostic } from './directive/diagnostics-types.ts'
import type { ExtendMap } from './directive/resolve.ts'
import type { FoldEntry } from './postcss-fold.ts'

import { formatDiagnostic } from './directive/diagnostics-format.ts'
import { type AnchoredBlock, type Declaration, plan, type PlanResult } from './directive/plan.ts'
import { tokenize } from './directive/tokenizer.ts'
import { isFollowingNestedNode } from './postcss-nested-builders.ts'
import { isInsideKeyframes, stampSource } from './postcss-node-utils.ts'

export interface DirectiveContext {
  atRule: PostCSSAtRule
  onUnknown: 'warn' | 'error' | 'ignore'
  result: Result
  extend: ExtendMap
  /**
  Where an `'error'`-mode diagnostic lands instead of throwing immediately — R6's fold is per stylesheet, not per directive.
   */
  fold: FoldEntry[]
}

/**
The at-keyword's decoded, ASCII-lowercased name — R5(a): case-insensitive on the unescaped value (`@NAVE`, `@n\61ve`). PostCSS's own `.name` keeps escapes literal.
 */
function decodedAtRuleName(atRule: PostCSSAtRule): string {
  const token = tokenize(`@${atRule.name}`)[0]
  return token?.type === 'at-keyword-token' ? (token.structured?.value as string).toLowerCase() : ''
}

/**
 * The `atRule.error()`/`.warn()` `index` option, relative to the at-rule's
 * OWN source text (`@` at index 0): `unknown-atom` and `bad-token` position
 * at their own token inside the prelude (R6 "unknown-atom at the name"), so
 * this adds back everything PostCSS's `index` counts from the `@` that a
 * prelude-relative `diagnostic.offset` does not — the name, and the exact
 * (possibly comment-carrying) text between the name and the prelude.
 */
function atRuleErrorIndex(atRule: PostCSSAtRule, diagnostic: Diagnostic): number | undefined {
  if (diagnostic.code !== 'unknown-atom' && diagnostic.code !== 'bad-token') return undefined
  const afterName = atRule.raws.afterName ?? ' '
  return 1 + atRule.name.length + afterName.length + diagnostic.offset
}

/**
 * Reports one diagnostic per `onUnknown`, defaulting to fold-and-throw: an
 * unrecognised `onUnknown` value must not select the most permissive mode.
 * `'error'` never throws HERE — every diagnostic in the stylesheet lands in
 * `ctx.fold` first, so R6's fold covers every directive, not just the one
 * that happened to be walked first (AC-directive-core-16).
 */
function reportDiagnostic(diagnostic: Diagnostic, ctx: DirectiveContext): void {
  const isNestedGroup = diagnostic.code === 'bad-parent' && ctx.atRule.parent?.type !== 'root'
  const text = formatDiagnostic(
    isNestedGroup ? { ...diagnostic, detail: 'nested-group' } : diagnostic,
    {
      extend: ctx.extend,
    },
  )
  const index = atRuleErrorIndex(ctx.atRule, diagnostic)
  if (ctx.onUnknown === 'warn') {
    ctx.atRule.warn(ctx.result, text, index === undefined ? {} : { index })
    return
  }
  if (ctx.onUnknown === 'ignore') return
  ctx.fold.push({ atRule: ctx.atRule, text, index })
}

/**
One rendered declaration, stamped with the directive's own source.
 */
function declNode(atRule: PostCSSAtRule, decl: Declaration): ReturnType<typeof postcss.decl> {
  const node = postcss.decl({ prop: decl.prop, value: decl.value })
  if (atRule.source) node.source = atRule.source
  return node
}

/**
 * Inserts the inline declarations at the directive's authored position:
 * bare when nothing precedes them that requires nesting, or wrapped in a
 * single `& { … }` when `wrapInAmpersand` is true.
 */
function insertDeclarations(
  atRule: PostCSSAtRule,
  declarations: readonly Declaration[],
  isWrapped: boolean,
): void {
  if (declarations.length === 0) return
  if (!isWrapped) {
    for (const decl of declarations) atRule.before(declNode(atRule, decl))
    return
  }
  const wrapper = postcss.rule({ selector: '&' })
  if (atRule.source) wrapper.source = atRule.source
  for (const decl of declarations) wrapper.append(declNode(atRule, decl))
  atRule.before(wrapper)
}

/**
A rule node with `selector`, holding `declarations`.
 */
function buildRule(
  selector: string,
  declarations: readonly Declaration[],
): ReturnType<typeof postcss.rule> {
  const rule = postcss.rule({ selector })
  for (const decl of declarations) rule.append(postcss.decl({ prop: decl.prop, value: decl.value }))
  return rule
}

/**
The PostCSS nodes one appended block contributes, in `plan()`'s already-anchored, already-ordered shape.
 */
function buildAppendedNode(
  block: AnchoredBlock,
): ReturnType<typeof postcss.rule> | ReturnType<typeof postcss.atRule> {
  if (block.kind === 'pseudo') return buildRule(block.selector, block.declarations)
  const node = postcss.atRule({ name: block.kind, params: block.condition })
  if (block.declarations.length > 0) node.append(buildRule('&', block.declarations))
  for (const pseudo of block.pseudos) node.append(buildRule(pseudo.selector, pseudo.declarations))
  return node
}

/**
Converts a `resolve()` malformed-atom throw into a positioned PostCSS error (R2, outside onUnknown and outside R6's fold).
 */
function throwMalformedAtom(atRule: PostCSSAtRule, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  throw atRule.error(message)
}

interface PlanAtRuleResult {
  readonly isStyleRuleParent: boolean
  readonly parent: PostCSSAtRule['parent']
  readonly result: PlanResult
}

/**
`plan()`'s three facts, answered from the PostCSS AST, plus the call itself (a malformed atom's throw is repositioned onto the at-rule).
 */
function planAtRule(atRule: PostCSSAtRule, extend: ExtendMap): PlanAtRuleResult {
  const parent = atRule.parent
  const isStyleRuleParent = parent?.type === 'rule'
  const isFollowingNestedNodeHere = isStyleRuleParent
    ? isFollowingNestedNode(parent, atRule)
    : false

  try {
    return {
      isStyleRuleParent,
      parent,
      result: plan(
        atRule.raws.params?.raw ?? atRule.params,
        {
          isStyleRuleParent,
          isInsideKeyframes: parent !== undefined && isInsideKeyframes(parent),
          isFollowingNestedNode: isFollowingNestedNodeHere,
        },
        { extend },
      ),
    }
  } catch (error) {
    return throwMalformedAtom(atRule, error)
  }
}

/**
 * R5(c): a directive with a `{}` block is a diagnostic through `onUnknown`,
 * never a silent deletion — `plan()` never sees this (it only receives the
 * prelude text, not whether a block follows), so it is entirely the
 * adapter's own structural fact to report, mirroring `expandText()`'s own
 * `item.blockStart !== undefined` check on its own item shape.
 */
function hasBlock(atRule: PostCSSAtRule): boolean {
  return atRule.nodes !== undefined
}

/**
 * Walks one `@nave` at-rule against this run's resolved `extend` and folds
 * its diagnostics.
 */
export function handleAtRule(atRule: PostCSSAtRule, ctx: Omit<DirectiveContext, 'atRule'>): void {
  if (decodedAtRuleName(atRule) !== 'nave') return

  const fullCtx: DirectiveContext = { ...ctx, atRule }
  const { isStyleRuleParent, parent, result: planResult } = planAtRule(atRule, ctx.extend)

  for (const diagnostic of planResult.diagnostics) reportDiagnostic(diagnostic, fullCtx)
  if (hasBlock(atRule)) {
    reportDiagnostic({ code: 'has-block', offset: 0, endOffset: atRule.toString().length }, fullCtx)
  }

  insertDeclarations(atRule, planResult.declarations, planResult.wrapInAmpersand)
  atRule.remove()

  if (isStyleRuleParent && parent) {
    for (const block of planResult.blocks) {
      const node = buildAppendedNode(block)
      stampSource(node, atRule.source)
      parent.append(node)
    }
  }
}
