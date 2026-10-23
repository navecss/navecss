/**
 * Whether the move a warning would print clears its pair. A warning names a move (a block written
 * above the directive or above the block that holds it, an atom written into the later directive,
 * an atom named after another) only where the arrangement the move makes, checked again, no longer
 * has that pair and has no pair the rule did not already have. Otherwise it prints no move, and
 * its fix is the directive with the marker, which always clears the pair.
 *
 * The check is made for a warning that is printed, never for a pair a marker covers, and reads only
 * the pairs the move can change: those that involve a part that moved. A rule that holds more than
 * `MOVE_LIMIT` pairs prints no move at all, so the cost of a rule stays in proportion to its pairs.
 */
import type { Segment } from './order-check.ts'
import type { Finding } from './order-model.ts'
import type { Scope } from './order-outward.ts'
import type { ModelNode, NodeRef } from './rule-model.ts'

/**
 * The most pairs a rule can hold and still have its moves checked. The rules of `@navecss/base-ui`
 * hold none, and the largest rule the tests of this package print a move for holds six; a rule
 * beyond this prints the marker alone, which always clears the pair.
 */
const MOVE_LIMIT = 50

/**
 * A segment of the output, chosen.
 */
type Choice = (segment: Segment) => boolean

/**
 * Where the segments that move are written: right before the first segment chosen, or right after
 * the last one.
 */
type Place = { readonly before: Choice } | { readonly after: Choice }

/**
 * The arrangement a move makes, and a key that says which move it is, so that two findings that
 * would print the same move share one check.
 */
interface Move {
  readonly arranged: readonly Segment[]
  readonly key: string
  readonly scope: Scope
}

/**
 * The segments after a move, and the ones that moved.
 */
interface Relocation {
  readonly arranged: Segment[]
  readonly moved: ReadonlySet<Segment>
}

/**
 * The key of a pair: the unit and the candidate, however the rule is arranged.
 */
function pairKey({ candidate, unit }: Finding): string {
  const { overrider } = candidate
  const who =
    overrider.kind === 'atom'
      ? ['atom', overrider.directive.ref, overrider.atom.atomIndex, overrider.isBlock]
      : ['own', overrider.topRef]
  return JSON.stringify([
    unit.directive.ref,
    unit.atom.atomIndex,
    unit.selector,
    unit.conditions,
    unit.declarations,
    who,
    candidate.declaration,
    candidate.holderSelector,
    candidate.conditions,
  ])
}

const ownNode =
  (ref: NodeRef): Choice =>
  (segment) =>
    segment.kind === 'own' && segment.node.ref === ref

const ofDirective =
  (ref: NodeRef): Choice =>
  (segment) =>
    segment.kind !== 'own' && segment.directive.ref === ref

const ofAtom =
  (ref: NodeRef, atomIndex: number): Choice =>
  (segment) =>
    segment.kind !== 'own' && segment.directive.ref === ref && segment.atom.atomIndex === atomIndex

const namedAtom =
  (ref: NodeRef, name: string): Choice =>
  (segment) =>
    segment.kind !== 'own' && segment.directive.ref === ref && segment.atom.name === name

/**
 * The segments with the chosen ones taken out and written again at `place`, or nothing when none is
 * chosen or the place is not there.
 */
function relocated(
  segments: readonly Segment[],
  isMoved: Choice,
  place: Place,
): Relocation | undefined {
  const moved = segments.filter((segment) => isMoved(segment))
  const rest = segments.filter((segment) => !isMoved(segment))
  const index =
    'before' in place
      ? rest.findIndex((segment) => place.before(segment))
      : rest.findLastIndex((segment) => place.after(segment))
  if (index === -1 || moved.length === 0) return undefined
  const at = 'before' in place ? index : index + 1
  return {
    arranged: [...rest.slice(0, at), ...moved, ...rest.slice(at)],
    moved: new Set(moved),
  }
}

/**
 * The move that `relocation` makes.
 */
function moveOf(relocation: Relocation | undefined, key: string): Move | undefined {
  return (
    relocation && {
      arranged: relocation.arranged,
      key,
      scope: { kind: 'moved', segments: relocation.moved },
    }
  )
}

/**
 * The atom of a finding's directive that the atom must be written after to win, if the overrider
 * is a later atom of that directive: after the last atom of the directive that overrides a block
 * of any occurrence of the atom (a name written twice is one atom, and all its occurrences move).
 */
export function lastOverriderIndex(finding: Finding, all: readonly Finding[]): number | undefined {
  const { unit, candidate } = finding
  if (
    candidate.overrider.kind !== 'atom' ||
    candidate.overrider.directive.ref !== unit.directive.ref
  ) {
    return undefined
  }
  const indexes = all
    .filter(
      (other) =>
        other.unit.directive.ref === unit.directive.ref && other.unit.atom.name === unit.atom.name,
    )
    .flatMap((other) =>
      other.candidate.overrider.kind === 'atom' &&
      other.candidate.overrider.directive.ref === unit.directive.ref
        ? [other.candidate.overrider.atom.atomIndex]
        : [],
    )
  return Math.max(...indexes)
}

/**
 * The children of a conditional group with `moving` written right before `before`.
 */
function childrenMoved(
  children: readonly ModelNode[],
  moving: NodeRef,
  before: NodeRef,
): ModelNode[] | undefined {
  const node = children.find((child) => child.ref === moving)
  const rest = children.filter((child) => child.ref !== moving)
  const at = rest.findIndex((child) => child.ref === before)
  if (node === undefined || at === -1) return undefined
  return [...rest.slice(0, at), node, ...rest.slice(at)]
}

/**
 * The group `root` with the children of the conditional group `group`, which is `root` or lies
 * below it through conditional groups alone, reordered, or nothing when it does not. The search
 * keeps a stack of its own, so nesting depth cannot overflow the call stack.
 */
function groupWithChildMoved(
  root: ModelNode,
  at: { readonly before: NodeRef; readonly group: NodeRef; readonly moving: NodeRef },
): ModelNode | undefined {
  if (root.kind !== 'group') return undefined
  const stack = [{ node: root, next: 0 }]
  while (stack.length > 0 && stack.at(-1)!.node.ref !== at.group) {
    const frame = stack.at(-1)!
    const child = frame.node.nodes[frame.next++]
    if (child === undefined) stack.pop()
    else if (child.kind === 'group') stack.push({ node: child, next: 0 })
  }
  const target = stack.at(-1)
  const moved = target && childrenMoved(target.node.nodes, at.moving, at.before)
  if (target === undefined || moved === undefined) return undefined
  let rebuilt: ModelNode = { ...target.node, nodes: moved }
  for (let i = stack.length - 2; i >= 0; i--) {
    const replaced = stack[i + 1]!.node
    rebuilt = {
      ...stack[i]!.node,
      nodes: stack[i]!.node.nodes.map((child) => (child === replaced ? rebuilt : child)),
    }
  }
  return rebuilt
}

/**
 * The move of an outward pair: the later content written above the block that holds the directive,
 * or, inside a conditional group, above the child of the group that holds it.
 */
function outwardMove(finding: Finding, segments: readonly Segment[]): Move | undefined {
  const { outward, candidate } = finding
  const { overrider } = candidate
  if (outward === undefined) return undefined
  const { level, top } = outward
  const mover =
    overrider.kind === 'own' ? `own:${overrider.topRef}` : `directive:${overrider.directive.ref}`
  const key = JSON.stringify(['outward', top, level, mover])
  if (level === undefined) {
    const moving =
      overrider.kind === 'own' ? ownNode(overrider.topRef) : ofDirective(overrider.directive.ref)
    return moveOf(relocated(segments, moving, { before: ownNode(top) }), key)
  }
  const holder = segments.find(ownNode(top))
  if (holder?.kind !== 'own' || overrider.kind !== 'own') return undefined
  const rebuilt = groupWithChildMoved(holder.node, {
    before: level.container,
    group: level.group,
    moving: overrider.topRef,
  })
  if (rebuilt === undefined) return undefined
  const regrouped = { ...holder, node: rebuilt }
  const arranged = segments.map((segment) => (segment === holder ? regrouped : segment))
  return { arranged, key, scope: { child: overrider.topRef, kind: 'child', top: regrouped } }
}

/**
 * The move of a pair inside one rule: the block written above the directive, or the atom written
 * into the later directive, or after the last atom of its own directive that overrides it.
 */
function ruleMove(
  finding: Finding,
  segments: readonly Segment[],
  all: readonly Finding[],
): Move | undefined {
  const { candidate, unit } = finding
  const { overrider } = candidate
  if (overrider.kind === 'own') {
    const relocation = relocated(segments, ownNode(overrider.topRef), {
      before: ofDirective(unit.directive.ref),
    })
    return moveOf(relocation, `own:${overrider.topRef}:${unit.directive.ref}`)
  }
  const index = lastOverriderIndex(finding, all) ?? overrider.atom.atomIndex
  const relocation = relocated(segments, namedAtom(unit.directive.ref, unit.atom.name), {
    after: ofAtom(overrider.directive.ref, index),
  })
  const key = `atom:${unit.directive.ref}:${unit.atom.name}:${overrider.directive.ref}:${index}`
  return moveOf(relocation, key)
}

/**
 * The findings with `canMove` set: whether the move each one's warning would print is made
 * without that pair and without any the rule did not have. The answer is worked out when it is
 * asked for, which is for a warning that is printed. `recheck` finds the pairs of an arrangement
 * that its scope reads.
 */
export function markMoves(
  findings: readonly Finding[],
  segments: readonly Segment[],
  recheck: (arranged: readonly Segment[], scope: Scope) => readonly Finding[],
): Finding[] {
  if (findings.length > MOVE_LIMIT)
    return findings.map((finding) => ({ ...finding, canMove: () => false }))
  let before: ReadonlySet<string> | undefined
  const after = new Map<string, ReadonlySet<string>>()
  const isClear = (finding: Finding): boolean => {
    const move = finding.outward
      ? outwardMove(finding, segments)
      : ruleMove(finding, segments, findings)
    if (move === undefined) return false
    before ??= new Set(findings.map((found) => pairKey(found)))
    if (!after.has(move.key)) {
      const found = recheck(move.arranged, move.scope)
      after.set(move.key, new Set(found.map((pair) => pairKey(pair))))
    }
    const pairs = after.get(move.key)!
    return !pairs.has(pairKey(finding)) && [...pairs].every((key) => before!.has(key))
  }
  return findings.map((finding) => {
    let known: boolean | undefined
    return { ...finding, canMove: () => (known ??= isClear(finding)) }
  })
}
