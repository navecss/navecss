/**
 * Finding `@nave` at-rules in a PostCSS tree and reporting what is wrong with one, and the whole
 * handling of a directive that sits anywhere but directly in a style rule (those are all
 * refused; a directive directly in a style rule is expanded with its rule, `postcss-rule.ts`).
 */
import type { AtRule as PostCSSAtRule, Result } from 'postcss'

import type { Diagnostic } from './directive/diagnostics-types.ts'
import type { ExtendMap } from './directive/resolve.ts'
import type { FoldEntry } from './postcss-fold.ts'

import { formatDiagnostic } from './directive/diagnostics-format.ts'
import { plan } from './directive/plan.ts'
import { tokenize } from './directive/tokenizer.ts'
import { hasWorkaroundSentence, isInsideKeyframes } from './postcss-node-utils.ts'

export interface DirectiveContext {
  atRule: PostCSSAtRule
  onUnknown: 'warn' | 'error' | 'ignore'
  result: Result
  extend: ExtendMap
  /**
  Where an `'error'`-mode diagnostic lands instead of throwing immediately — the fold is per stylesheet, not per directive.
   */
  fold: FoldEntry[]
}

export interface NaveMatch {
  /**
  Whether `atRule` is a `@nave` directive — case-insensitive on the unescaped value (`@NAVE`, `@n\61ve`). PostCSS's own `.name` keeps escapes literal, and worse: its name/params split is a naive, escape-unaware character scan, so an escape spanning what PostCSS thinks is that boundary (`@n\61ve flex;` splits `"n"` / `"\61ve flex"`) makes it miss a directive whose real, unescaped name is "nave".
   */
  readonly isNave: boolean
  /**
  The prelude text, as authored, starting right after the directive's real name and running to its end: the comments PostCSS keeps in `raws.afterName`, `raws.params.raw` and `raws.between` included.
   */
  readonly prelude: string
  /**
  Where `prelude` starts within `'@' + atRule.name + (raws.afterName ?? ' ') + params + between` — for repositioning a diagnostic's own prelude-relative offset back onto `atRule` (`atRuleErrorIndex`).
   */
  readonly preludeStartIndex: number
}

/**
 * `atRule.params` as PostCSS's own stringifier would print it: `raws.params`
 * only when its recorded `value` still matches the live `params` — the same
 * staleness check PostCSS's own `stringifier` applies before trusting a
 * `raws` entry. An earlier plugin in the pipeline can reassign `.params`
 * without touching `.raws.params`, leaving that raw text (comments and all)
 * stale; reading it unconditionally would resolve a directive against a
 * prelude no longer authored anywhere in the AST.
 */
function currentParams(atRule: PostCSSAtRule): string {
  const raw = atRule.raws.params
  if (raw?.value === atRule.params) return raw.raw
  return atRule.params
}

/**
 * Re-tokenizes `'@' + atRule.name + afterName + params + between` with the core
 * tokenizer to find the directive's real name across a boundary PostCSS's
 * own parser draws in the wrong place whenever an escape spans it. The prelude
 * is everything between the name and the end of the directive: PostCSS keeps a
 * comment there in `raws.afterName` (right after the name), in `raws.params.raw`
 * (between names) or in `raws.between` (before the `;`), so the three are joined.
 */
export function matchNaveAtRule(atRule: PostCSSAtRule): NaveMatch {
  const afterName = atRule.raws.afterName ?? ' '
  const paramsRaw = currentParams(atRule)
  const between = atRule.raws.between ?? ''
  const nameBoundary = 1 + atRule.name.length
  const full = `@${atRule.name}${afterName}${paramsRaw}${between}`
  const token = tokenize(full)[0]
  const commonPrelude = { prelude: full.slice(nameBoundary), preludeStartIndex: nameBoundary }
  if (token?.type !== 'at-keyword-token') return { isNave: false, ...commonPrelude }
  const isNave = (token.structured?.value as string).toLowerCase() === 'nave'
  // The common case: PostCSS's own name already ends exactly where the real
  // token does, so the text after it is the prelude. Only when an escape
  // pushed the real name past that boundary is the prelude recomputed from
  // the re-tokenized text instead.
  if (token.endIndex === nameBoundary) return { isNave, ...commonPrelude }
  return { isNave, prelude: full.slice(token.endIndex), preludeStartIndex: token.endIndex }
}

/**
 * The `atRule.error()`/`.warn()` `index` option, relative to the at-rule's
 * OWN source text (`@` at index 0): `unknown-atom` and `bad-token` position
 * at their own token inside the prelude, so
 * this adds back everything PostCSS's `index` counts from the `@` that a
 * prelude-relative `diagnostic.offset` does not.
 */
function atRuleErrorIndex(preludeStartIndex: number, diagnostic: Diagnostic): number | undefined {
  if (diagnostic.code !== 'unknown-atom' && diagnostic.code !== 'bad-token') return undefined
  return preludeStartIndex + diagnostic.offset
}

/**
 * Reports one diagnostic per `onUnknown`, defaulting to fold-and-throw: an
 * unrecognised `onUnknown` value must not select the most permissive mode.
 * `'error'` never throws HERE — every diagnostic in the stylesheet lands in
 * `ctx.fold` first, so the fold covers every directive, not just the one
 * that happened to be walked first (AC-directive-core-16).
 */
export function reportDiagnostic(
  diagnostic: Diagnostic,
  ctx: DirectiveContext,
  preludeStartIndex: number,
): void {
  // The workaround sentence names a group rule the directive can be moved
  // into via `& { }` — only meaningful when the refused parent is one of
  // those group rules (never @keyframes, where `&` has no such use, nor any
  // other at-rule such as @font-face, which cannot itself nest inside a
  // style rule the way these can) AND a style rule sits somewhere above it,
  // however many further group rules come between
  // (`.a { @media (x) { @media (y) { @nave flex; } } }` still gets it).
  const refusedParent = ctx.atRule.parent
  const isNestedGroup =
    diagnostic.code === 'bad-parent' &&
    refusedParent !== undefined &&
    hasWorkaroundSentence(refusedParent)
  const text = formatDiagnostic(
    isNestedGroup ? { ...diagnostic, detail: 'nested-group' } : diagnostic,
    {
      extend: ctx.extend,
    },
  )
  const index = atRuleErrorIndex(preludeStartIndex, diagnostic)
  if (ctx.onUnknown === 'warn') {
    ctx.atRule.warn(ctx.result, text, index === undefined ? {} : { index })
    return
  }
  if (ctx.onUnknown === 'ignore') return
  ctx.fold.push({ atRule: ctx.atRule, text, index })
}

/**
 * A directive with a `{}` block is a diagnostic through `onUnknown`,
 * never a silent deletion — `plan()` never sees this (it only receives the
 * prelude text, not whether a block follows), so it is entirely the
 * adapter's own structural fact to report, mirroring `expandText()`'s own
 * `item.blockStart !== undefined` check on its own item shape.
 */
export function hasBlock(atRule: PostCSSAtRule): boolean {
  return atRule.nodes !== undefined
}

/**
 * Converts a `resolve()` malformed-atom throw into a positioned PostCSS error (a registration
 * defect, outside onUnknown and outside the fold).
 */
export function throwMalformedAtom(atRule: PostCSSAtRule, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  throw atRule.error(message)
}

/**
 * Reports a `@nave` that is not directly in a style rule: refused, with the reason `plan()` gives.
 * A directive directly in a style rule is the rule's to expand, not this function's.
 */
export function handleAtRule(atRule: PostCSSAtRule, ctx: Omit<DirectiveContext, 'atRule'>): void {
  const match = matchNaveAtRule(atRule)
  if (!match.isNave) return
  const parent = atRule.parent
  if (parent?.type === 'rule') return

  const fullCtx: DirectiveContext = { ...ctx, atRule }
  const diagnostics = plan(
    match.prelude,
    {
      isStyleRuleParent: false,
      isInsideKeyframes: parent !== undefined && isInsideKeyframes(parent),
    },
    { extend: ctx.extend },
  ).diagnostics
  for (const diagnostic of diagnostics) {
    reportDiagnostic(diagnostic, fullCtx, match.preludeStartIndex)
  }
  if (hasBlock(atRule)) {
    reportDiagnostic(
      { code: 'has-block', offset: 0, endOffset: atRule.toString().length },
      fullCtx,
      match.preludeStartIndex,
    )
  }
  atRule.remove()
}
