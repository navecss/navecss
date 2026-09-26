/**
 * R1: `resolve(names, options)` turns `@nave` atom names into plain,
 * host-agnostic data — no PostCSS node, no class instance, nothing that
 * fails `structuredClone`. `scripts/build-css.ts` renders `atomic.css` from
 * this same function, so there is exactly one source of atom expansion data
 * (AC-directive-core-02).
 */
import { type AtomDefinition, atoms } from '../atoms.ts'

export interface Declaration {
  readonly prop: string
  readonly value: string
}

export interface PseudoBlock {
  readonly kind: 'pseudo'
  readonly selector: string
  readonly declarations: readonly Declaration[]
}

export interface ConditionalBlock {
  readonly kind: 'media' | 'container'
  readonly condition: string
  readonly declarations: readonly Declaration[]
  readonly pseudos: readonly PseudoBlock[]
}

export type ResolvedBlock = PseudoBlock | ConditionalBlock

export interface ResolvedAtom {
  readonly declarations: readonly Declaration[]
  readonly blocks: readonly ResolvedBlock[]
}

export type ExtendMap = Readonly<Record<string, AtomDefinition | null | undefined>>

export interface ResolveOptions {
  readonly extend?: ExtendMap | undefined
}

export interface ResolveResult {
  readonly resolved: Readonly<Record<string, ResolvedAtom>>
  readonly unresolved: readonly string[]
}

/**
A declaration map, in its own key-insertion order, as a `Declaration[]`.
 */
function toDeclarations(decls: Record<string, string>): Declaration[] {
  return Object.entries(decls).map(([prop, value]) => ({ prop, value }))
}

/**
A plain object (not `null`, not an array): the only shape `declarations` may legally take.
 */
function isDeclarationsObject(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The atom's own definition-order declarations. Throws when `declarations`
 * is present but not a plain object (R2): a registration defect, routed
 * around `onUnknown` and never folded into a diagnostic (R6, AC-05).
 */
function resolveDeclarations(name: string, atom: AtomDefinition): Declaration[] {
  if (!isDeclarationsObject(atom.declarations)) {
    throw new Error(`@nave: atom "${name}" is registered without a declarations object`)
  }
  return toDeclarations(atom.declarations)
}

/**
One `PseudoBlock` per pseudo key, unanchored (anchoring is `plan()`'s job).
 */
function resolvePseudoBlocks(pseudos: AtomDefinition['pseudos']): PseudoBlock[] {
  if (!pseudos) return []
  return Object.entries(pseudos).map(([selector, decls]) => ({
    kind: 'pseudo',
    selector,
    declarations: toDeclarations(decls),
  }))
}

/**
One block per `@media`/`@container` condition, skipping any with nothing to emit.
 */
function resolveConditionalBlocks(
  kind: 'media' | 'container',
  blocks: AtomDefinition['media'],
): ConditionalBlock[] {
  if (!blocks) return []
  const result: ConditionalBlock[] = []
  for (const [condition, block] of Object.entries(blocks)) {
    const declarations = block.declarations ? toDeclarations(block.declarations) : []
    const pseudos = resolvePseudoBlocks(block.pseudos)
    if (declarations.length === 0 && pseudos.length === 0) continue // R2: an empty block is never emitted
    result.push({ kind, condition, declarations, pseudos })
  }
  return result
}

/**
One atom's declarations plus its blocks, pseudos first, then `@media`, then `@container` (R1).
 */
function resolveAtom(name: string, atom: AtomDefinition): ResolvedAtom {
  return {
    declarations: resolveDeclarations(name, atom),
    blocks: [
      ...resolvePseudoBlocks(atom.pseudos),
      ...resolveConditionalBlocks('media', atom.media),
      ...resolveConditionalBlocks('container', atom.container),
    ],
  }
}

/**
 * A key carrying no definition is not a valid atom name: `Object.keys`
 * alone would admit it, so this checks `Object.hasOwn` plus truthiness
 * (a JSON-authored atom map can only spell a missing definition `null`,
 * since JSON has no `undefined`).
 */
function lookupAtom(name: string, extend: ExtendMap): AtomDefinition | undefined {
  if (Object.hasOwn(extend, name)) return extend[name] ?? undefined
  if (Object.hasOwn(atoms, name)) return (atoms as Record<string, AtomDefinition>)[name]
  return undefined
}

/**
R1: names in, plain per-name expansion data out, plus the names that resolved to nothing.
 */
export function resolve(names: readonly string[], options: ResolveOptions = {}): ResolveResult {
  const extend = options.extend ?? {}
  const resolved: Record<string, ResolvedAtom> = {}
  const unresolved: string[] = []

  for (const name of names) {
    const atom = lookupAtom(name, extend)
    if (!atom) {
      unresolved.push(name)
      continue
    }
    resolved[name] = resolveAtom(name, atom)
  }

  return { resolved, unresolved }
}
