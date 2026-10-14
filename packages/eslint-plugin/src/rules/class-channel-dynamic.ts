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
 * The hits of a `cx.dynamic()` call: its first argument, read by `read`, and one report for each
 * later argument, whatever it holds. A call whose first argument is a spread is not read, since
 * which argument is first is unknown, and a spread after the first is not read either.
 */
export function dynamicCallHits(
  call: TSESTree.CallExpression,
  sourceCode: SourceCode,
  read: (argument: AnyNode, callee: AtomCallee) => ClassHit[],
): ClassHit[] {
  const [first, ...rest] = call.arguments
  if (!first || first.type === 'SpreadElement') return []
  const extras = rest
    .filter((argument) => argument.type !== 'SpreadElement')
    .map((argument): ClassHit => {
      const rendered = sourceCode.getText(argument as never)
      return { kind: 'dynamic-extra', node: argument, rendered, callee: call.callee }
    })
  return [...read(first, { node: call.callee, isDynamic: true }), ...extras]
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
