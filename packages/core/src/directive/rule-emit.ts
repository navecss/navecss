/**
 * Expands one directive: the emissions of its atoms in order (declarations bare or wrapped, then
 * blocks), the parts it adds to the order check's view of the output, and the facts about any run
 * of its declarations that has to be wrapped.
 */
import type { AtomFacts, DirectiveFacts } from './order-model.ts'
import type { Declaration, PlannedAtom, PlanResult } from './plan.ts'
import type { DirectiveNode, Emission } from './rule-model.ts'
import type { NestedFact, PlanState } from './rule-state.ts'

import { whereOf } from './order-where.ts'

/**
 * What a warning needs to know about a directive.
 */
export function directiveFacts(node: DirectiveNode, result: PlanResult): DirectiveFacts {
  return {
    ref: node.ref,
    prelude: node.prelude,
    atoms: result.atoms.map((atom, atomIndex) => ({
      atomIndex,
      name: atom.name,
      offset: atom.offset,
      endOffset: atom.endOffset,
    })),
  }
}

/**
 * Notes the blocks a directive leaves out of a rule whose every selector is a pseudo-element.
 */
function recordDropped(
  state: PlanState,
  directive: DirectiveFacts,
  atoms: readonly PlannedAtom[],
): void {
  const named = atoms.flatMap((planned, index) =>
    planned.blocks.length === 0
      ? []
      : [
          {
            atom: directive.atoms[index]!,
            declarations: planned.declarations,
            wheres: planned.blocks.map((block) => blockWhere(block)),
          },
        ],
  )
  if (named.length > 0) state.dropped.push({ directive, atoms: named })
}

/**
 * Adds the parts one directive puts in the output to the order check's view of it, in output order.
 */
export function recordSegments(
  state: PlanState,
  directive: DirectiveFacts,
  atoms: readonly PlannedAtom[],
): void {
  if (state.isPseudoElementRule) recordDropped(state, directive, atoms)
  for (const [atomIndex, planned] of atoms.entries()) {
    const atom = directive.atoms[atomIndex]!
    if (planned.declarations.length > 0) {
      state.segments.push({
        kind: 'atom-declarations',
        directive,
        atom,
        declarations: planned.declarations,
      })
    }
    if (state.isPseudoElementRule) continue
    for (const block of planned.blocks) {
      state.segments.push({ kind: 'atom-block', directive, atom, block })
    }
  }
}

/**
 * Where an atom's block holds, as a warning says it.
 */
function blockWhere(block: PlannedAtom['blocks'][number]): string {
  if (block.kind === 'pseudo') return whereOf(block.selector, [])
  return whereOf('&', [{ name: block.kind, prelude: block.condition }])
}

/**
 * The directive's progress through its atoms.
 */
interface Walk {
  readonly atoms: readonly PlannedAtom[]
  readonly directive: DirectiveFacts
  readonly emissions: Emission[]
  /**
  The atoms whose declarations are waiting to be written.
   */
  readonly pending: { atoms: AtomFacts[]; declarations: Declaration[] }
  /**
  Whether a nested node preceded the directive.
   */
  readonly isNestedBefore: boolean
  /**
  The last block of this directive written so far.
   */
  follows: { atom: AtomFacts; where: string } | undefined
}

/**
 * The atom of `atoms` that is the first to have a block.
 */
function firstAtomWithBlock(walk: Walk): AtomFacts | undefined {
  const index = walk.atoms.findIndex((atom) => atom.blocks.length > 0)
  return index === -1 ? undefined : walk.directive.atoms[index]
}

/**
 * Records the facts about the wrapped run waiting in `walk.pending`.
 */
function recordRun(state: PlanState, walk: Walk): void {
  const { directive, follows, pending } = walk
  const nested: NestedFact = state.lastNested ?? { text: '' }
  const hasBlockOfOwn = pending.atoms.some((atom) => walk.atoms[atom.atomIndex]!.blocks.length > 0)
  state.runs.push({
    kind: 'directive',
    above: state.above ?? '',
    atoms: [...pending.atoms],
    canMoveDirective: !state.ownDeclarationSinceAbove,
    canReorder:
      follows !== undefined &&
      !walk.isNestedBefore &&
      firstAtomWithBlock(walk)?.atomIndex === follows.atom.atomIndex &&
      !hasBlockOfOwn,
    directive,
    follows,
    isWrappedBefore: state.hasOwnNested,
    nested,
  })
}

/**
 * Writes the waiting declarations as one emission, wrapped when a nested node precedes them.
 */
function flushDeclarations(state: PlanState, walk: Walk): void {
  const { declarations } = walk.pending
  if (declarations.length === 0) return
  const isWrapped = state.isNested && !state.isPseudoElementRule
  walk.emissions.push({ kind: 'declarations', declarations: [...declarations], isWrapped })
  if (isWrapped) recordRun(state, walk)
  walk.pending.declarations = []
  walk.pending.atoms = []
}

/**
 * Notes the first nested node of the output, as a warning names it when it points above it.
 */
function noteAbove(state: PlanState, walk: Walk): void {
  if (state.above !== undefined) return
  const first = firstAtomWithBlock(walk)!
  state.above =
    state.directiveTotal === 1 ? 'the directive' : `the directive that names "${first.name}"`
}

/**
 * One atom's contribution: its declarations join the run in progress, and its blocks end that run.
 */
function emitAtom(state: PlanState, walk: Walk, index: number): void {
  const planned = walk.atoms[index]!
  const atom = walk.directive.atoms[index]!
  if (planned.declarations.length > 0) {
    walk.pending.declarations.push(...planned.declarations)
    walk.pending.atoms.push(atom)
  }
  if (planned.blocks.length === 0 || state.isPseudoElementRule) return
  flushDeclarations(state, walk)
  for (const block of planned.blocks) walk.emissions.push({ kind: 'block', block })
  noteAbove(state, walk)
  const last = planned.blocks.at(-1)!
  walk.follows = { atom, where: blockWhere(last) }
  state.lastNested = {
    text: `the block of "${atom.name}" ${blockWhere(last)}`,
    block: { atom, directive: walk.directive },
  }
  state.isNested = true
}

/**
 * The emissions of every atom a directive named, in order.
 */
export function emitAtoms(
  state: PlanState,
  directive: DirectiveFacts,
  atoms: readonly PlannedAtom[],
): Emission[] {
  const walk: Walk = {
    atoms,
    directive,
    emissions: [],
    pending: { atoms: [], declarations: [] },
    isNestedBefore: state.isNested,
    follows: undefined,
  }
  for (const index of atoms.keys()) emitAtom(state, walk, index)
  flushDeclarations(state, walk)
  return walk.emissions
}
