/**
 * R2: placement lives in the core, once. `plan()` takes the directive's
 * prelude as authored and the three facts any host can answer, and returns
 * the inline declarations with their wrap flag, the blocks to append (already
 * positioned and anchored — no adapter re-implements a placement rule), and
 * the diagnostics.
 */
import type { Diagnostic } from './diagnostics-types.ts'

import { anchorSelectorList } from '../selector-utils.ts'
import { type PreludeComponent, readPreludeComponents } from './prelude-components.ts'
import { type Declaration, type ExtendMap, resolve, type ResolvedBlock } from './resolve.ts'

export type { Declaration } from './resolve.ts'

export interface PlanContext {
  readonly isStyleRuleParent: boolean
  readonly isInsideKeyframes: boolean
  readonly isFollowingNestedNode: boolean
}

export interface PlanOptions {
  readonly extend?: ExtendMap | undefined
}

export interface AnchoredPseudoBlock {
  readonly kind: 'pseudo'
  readonly selector: string
  readonly declarations: readonly Declaration[]
}

export interface AnchoredConditionalBlock {
  readonly kind: 'media' | 'container'
  readonly condition: string
  readonly declarations: readonly Declaration[]
  readonly pseudos: readonly AnchoredPseudoBlock[]
}

export type AnchoredBlock = AnchoredPseudoBlock | AnchoredConditionalBlock

export interface PlanResult {
  readonly declarations: readonly Declaration[]
  readonly wrapInAmpersand: boolean
  readonly blocks: readonly AnchoredBlock[]
  readonly diagnostics: readonly Diagnostic[]
}

/**
`resolve()`'s raw block, with every selector anchored (`&`) for direct emission.
 */
function anchorBlock(block: ResolvedBlock): AnchoredBlock {
  if (block.kind === 'pseudo') {
    return { kind: 'pseudo', selector: anchorSelectorList(block.selector), declarations: block.declarations }
  }
  return {
    kind: block.kind,
    condition: block.condition,
    declarations: block.declarations,
    pseudos: block.pseudos.map((p) => ({ ...p, selector: anchorSelectorList(p.selector) })),
  }
}

/**
A `plan()` short-circuit: no declarations, no blocks, just the one diagnostic that stopped it.
 */
function emptyResult(diagnostics: readonly Diagnostic[]): PlanResult {
  return { declarations: [], wrapInAmpersand: false, blocks: [], diagnostics }
}

/**
The candidate atom names, plus one `bad-token` diagnostic per non-ident component.
 */
function readNames(components: readonly PreludeComponent[]): { diagnostics: Diagnostic[]; names: string[]; } {
  const names: string[] = []
  const diagnostics: Diagnostic[] = []
  for (const component of components) {
    if (component.kind === 'ident') {
      names.push(component.name)
      continue
    }
    diagnostics.push({ code: 'bad-token', offset: component.offset, endOffset: component.endOffset })
  }
  return { names, diagnostics }
}

/**
One `unknown-atom` diagnostic per name `resolve()` could not find, positioned at its own component.
 */
function readUnknownAtomDiagnostics(
  unresolved: readonly string[],
  components: readonly PreludeComponent[],
): Diagnostic[] {
  return unresolved.map((name) => {
    const component = components.find((c) => c.kind === 'ident' && c.name === name)
    return { code: 'unknown-atom', name, offset: component?.offset ?? 0, endOffset: component?.endOffset ?? 0 }
  })
}

/**
The declarations, blocks and diagnostics for `prelude`'s names, before the wrap flag is known.
 */
function planNames(prelude: string, options: PlanOptions): PlanResult {
  const components = readPreludeComponents(prelude)
  if (components.length === 0) {
    return emptyResult([{ code: 'no-atom', offset: 0, endOffset: prelude.length }])
  }

  const { names, diagnostics } = readNames(components)
  const { resolved, unresolved } = resolve(names, { extend: options.extend })
  diagnostics.push(...readUnknownAtomDiagnostics(unresolved, components))

  const declarations: Declaration[] = []
  const blocks: AnchoredBlock[] = []
  for (const name of names) {
    const atom = Object.hasOwn(resolved, name) ? resolved[name] : undefined
    if (!atom) continue
    declarations.push(...atom.declarations)
    blocks.push(...atom.blocks.map((block) => anchorBlock(block)))
  }

  return { declarations, wrapInAmpersand: false, blocks, diagnostics }
}

/**
 * `plan(prelude, context, options)`. `prelude` is the directive's params
 * exactly as authored (the PostCSS adapter passes
 * `atRule.raws.params?.raw ?? atRule.params`, since PostCSS strips comments
 * from `params`); `context` answers the three facts a bad parent or
 * `@keyframes` ancestry short-circuits on before any name is even read.
 */
export function plan(prelude: string, context: PlanContext, options: PlanOptions = {}): PlanResult {
  if (!context.isStyleRuleParent) {
    return emptyResult([{ code: 'bad-parent', offset: 0, endOffset: prelude.length }])
  }
  if (context.isInsideKeyframes) {
    return emptyResult([{ code: 'in-keyframes', offset: 0, endOffset: prelude.length }])
  }

  const result = planNames(prelude, options)
  return { ...result, wrapInAmpersand: context.isFollowingNestedNode }
}
