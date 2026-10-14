/**
 * What the class-channel grammar yields for Nave's `cx.dynamic()` beyond what it yields for
 * `cx()`: an argument after the first, a built name no atom name fits, and which literal names sit
 * beside a value chosen at run time. Kept apart from the grammar itself (`class-channel-walk.ts`),
 * which hands in how to read an argument.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope, SourceCode } from 'eslint'

import type { AtomCallee, ClassHit } from './class-hits.ts'

import { isFitByAtom, isRunTimeValue } from '../dynamic-name.ts'

type AnyNode = TSESTree.Node

/**
 * The hits of a `cx.dynamic()` call. At run time the name is the first value once every spread is
 * expanded, so what an argument gets depends on what is written before it. A spread that comes
 * first, or follows only spreads, is not read. The first non-spread argument is read as the name
 * when nothing precedes it, and otherwise gets one report of its own, its contents unread, since
 * whether it is the name depends on the spread before it. Every argument after a non-spread
 * argument, a spread included, can never be the name and gets one report, whatever it holds.
 */
export function dynamicCallHits(
  call: TSESTree.CallExpression,
  sourceCode: SourceCode,
  read: (argument: AnyNode, callee: AtomCallee) => ClassHit[],
): ClassHit[] {
  const firstIndex = call.arguments.findIndex((argument) => argument.type !== 'SpreadElement')
  if (firstIndex === -1) return []
  const reported = (kind: 'dynamic-extra' | 'dynamic-spread', argument: AnyNode): ClassHit => {
    const rendered = sourceCode.getText(argument as never)
    return { kind, node: argument, rendered, callee: call.callee }
  }
  const first = call.arguments[firstIndex]!
  const name =
    firstIndex === 0
      ? read(first, { node: call.callee, isDynamic: true })
      : [reported('dynamic-spread', first)]
  const extras = call.arguments
    .slice(firstIndex + 1)
    .map((argument) => reported('dynamic-extra', argument))
  return [...name, ...extras]
}

/**
 * A built name given to `cx.dynamic()`: nothing when some atom name fits the text written around
 * its slots, one report when none does.
 */
export function builtNameHits(
  sourceCode: SourceCode,
  node: AnyNode,
  callee: AtomCallee,
): ClassHit[] {
  if (isFitByAtom(node)) return []
  const rendered = sourceCode.getText(node as never)
  return [{ kind: 'dynamic-built', node, rendered, callee: callee.node }]
}

/**
 * The hits of sibling branches (a conditional's two, the two sides of `||` and `??`), with each
 * literal name marked when another branch holds a value chosen at run time. Elsewhere the groups
 * are simply joined.
 */
export function besideRunTime(
  callee: AtomCallee | undefined,
  branches: AnyNode[],
  scope: Scope.Scope,
  groups: ClassHit[][],
): ClassHit[] {
  if (!callee?.isDynamic) return groups.flat()
  return groups.flatMap((group, index) => {
    const isBeside = branches.some(
      (branch, other) => other !== index && isRunTimeValue(branch, scope),
    )
    if (!isBeside) return group
    return group.map((hit) => (hit.kind === 'atom' ? { ...hit, isBeside: true } : hit))
  })
}
