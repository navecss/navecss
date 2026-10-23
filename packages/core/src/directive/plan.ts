/**
 * What one directive expands to, once, for every host. `plan()` takes the directive's prelude as
 * authored and the two facts any host can answer (is the parent a style rule, is it inside
 * `@keyframes`), and returns each named atom's declarations and its blocks (already anchored, so
 * no adapter re-implements an anchoring rule), in the order the prelude names them, plus the
 * diagnostics. Where each atom's body sits in the rule is `planRule()`'s job (`rule-plan.ts`).
 */
import type { Diagnostic } from './diagnostics-types.ts'

import { anchorSelectorList } from '../selector-utils.ts'
import {
  type IdentComponent,
  type PreludeComponent,
  readPreludeComponents,
} from './prelude-components.ts'
import {
  type Declaration,
  type ExtendMap,
  resolve,
  type ResolvedBlock,
  type ResolveResult,
} from './resolve.ts'

export type { Declaration } from './resolve.ts'

export interface PlanContext {
  readonly isStyleRuleParent: boolean
  readonly isInsideKeyframes: boolean
}

export interface PlanOptions {
  readonly extend?: ExtendMap | undefined
}

/**
 * One arm of `AnchoredBlock`'s union; kept exported for a consumer
 * narrowing on `kind`, not yet named by any in-tree caller.
 * @public
 */
export interface AnchoredPseudoBlock {
  readonly kind: 'pseudo'
  readonly selector: string
  readonly declarations: readonly Declaration[]
}

/**
 * See `AnchoredPseudoBlock`.
 * @public
 */
export interface AnchoredConditionalBlock {
  readonly kind: 'media' | 'container'
  readonly condition: string
  readonly declarations: readonly Declaration[]
  readonly pseudos: readonly AnchoredPseudoBlock[]
}

export type AnchoredBlock = AnchoredPseudoBlock | AnchoredConditionalBlock

/**
 * One atom the prelude named: where its name sits in the prelude, its own declarations and its
 * blocks, in `resolve()`'s order (pseudo blocks, then `@media`, then `@container`).
 */
export interface PlannedAtom {
  readonly name: string
  readonly offset: number
  readonly endOffset: number
  readonly declarations: readonly Declaration[]
  readonly blocks: readonly AnchoredBlock[]
}

export interface PlanResult {
  readonly atoms: readonly PlannedAtom[]
  readonly diagnostics: readonly Diagnostic[]
}

/**
`resolve()`'s raw block, with every selector anchored (`&`) for direct emission.
 */
function anchorBlock(block: ResolvedBlock): AnchoredBlock {
  if (block.kind === 'pseudo') {
    return {
      kind: 'pseudo',
      selector: anchorSelectorList(block.selector),
      declarations: block.declarations,
    }
  }
  return {
    kind: block.kind,
    condition: block.condition,
    declarations: block.declarations,
    pseudos: block.pseudos.map((p) => ({ ...p, selector: anchorSelectorList(p.selector) })),
  }
}

/**
A `plan()` short-circuit: no atoms, just the one diagnostic that stopped it.
 */
function emptyResult(diagnostics: readonly Diagnostic[]): PlanResult {
  return { atoms: [], diagnostics }
}

/**
The ident components (candidate atom names), plus one `bad-token` diagnostic per non-ident component.
 */
function readNames(components: readonly PreludeComponent[]): {
  diagnostics: Diagnostic[]
  idents: IdentComponent[]
} {
  const idents: IdentComponent[] = []
  const diagnostics: Diagnostic[] = []
  for (const component of components) {
    if (component.kind === 'ident') {
      idents.push(component)
      continue
    }
    diagnostics.push({
      code: 'bad-token',
      text: component.text,
      offset: component.offset,
      endOffset: component.endOffset,
    })
  }
  return { idents, diagnostics }
}

/**
 * One `unknown-atom` diagnostic per ident component whose name did not
 * resolve, walked in the prelude's own order so a name repeated more than
 * once (`flex flx grid flx`) gets one diagnostic per occurrence, each at
 * its own position — matching by component, not by a `.find()` on the
 * name, which would give every occurrence the first one's position.
 */
function readUnknownAtomDiagnostics(
  components: readonly PreludeComponent[],
  resolved: ResolveResult['resolved'],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const component of components) {
    if (component.kind !== 'ident' || Object.hasOwn(resolved, component.name)) continue
    diagnostics.push({
      code: 'unknown-atom',
      name: component.name,
      offset: component.offset,
      endOffset: component.endOffset,
    })
  }
  return diagnostics
}

/**
Each resolved ident as a planned atom, in the prelude's own order (a name written twice is planned twice).
 */
function toPlannedAtoms(
  idents: readonly IdentComponent[],
  resolved: ResolveResult['resolved'],
): PlannedAtom[] {
  const planned: PlannedAtom[] = []
  for (const ident of idents) {
    const atom = Object.hasOwn(resolved, ident.name) ? resolved[ident.name] : undefined
    if (!atom) continue
    planned.push({
      name: ident.name,
      offset: ident.offset,
      endOffset: ident.endOffset,
      declarations: atom.declarations,
      blocks: atom.blocks.map((block) => anchorBlock(block)),
    })
  }
  return planned
}

/**
The atoms and diagnostics for `prelude`'s names.
 */
function planNames(prelude: string, options: PlanOptions): PlanResult {
  const components = readPreludeComponents(prelude)
  if (components.length === 0) {
    return emptyResult([{ code: 'no-atom', offset: 0, endOffset: prelude.length }])
  }

  const { idents, diagnostics } = readNames(components)
  const { resolved } = resolve(
    idents.map((ident) => ident.name),
    { extend: options.extend },
  )
  diagnostics.push(...readUnknownAtomDiagnostics(components, resolved))
  // `bad-token` diagnostics were read in one pass and `unknown-atom` ones in
  // a second, so the array above is not yet in source order — sorted here
  // so the first entry is genuinely the first problem in the prelude, not
  // whichever pass happened to add it first (AC-16 covers every directive's
  // problems, not in visitation order).
  diagnostics.sort((a, b) => a.offset - b.offset)

  return { atoms: toPlannedAtoms(idents, resolved), diagnostics }
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

  return planNames(prelude, options)
}
