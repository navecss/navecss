/**
 * What a refused use of the `cx` binding hands out of its module, when the module belongs to a
 * dependency: the names a hand-out the build can follow leaves under, or that it is one the build
 * cannot follow. The uses of an application are all errors, so they are not told apart.
 */
import type { AstNode } from './vite-ast.ts'
import type { Reading } from './vite-cx-refuse.ts'
import type { CxUse } from './vite-cx-use.ts'

import { flowOf } from './vite-cx-flow.ts'
import { reexportNameOf } from './vite-cx-refuse.ts'

/**
 * The name a re-export of the binding gives it out under, as the field a use carries.
 */
export function reexportedAs(
  reading: Reading,
  expression: AstNode,
): { readonly exportedAs: readonly string[] } | undefined {
  const name = reexportNameOf(reading, expression)
  return name === undefined ? undefined : { exportedAs: [name] }
}

/**
 * A refused use that hands `cx` out where the build cannot follow it to an export.
 */
export function unboundIn(reading: Reading, use: CxUse): CxUse {
  return reading.isDependency === true ? { ...use, isUnboundHandOut: true } : use
}

/**
 * What a refused use that is not a re-export hands out of the module, as the fields the use
 * carries: the names a hand-out the build can follow leaves under (renamed, since `cx` itself is
 * exported by a re-export), or that it is one the build cannot follow. Nothing for a use that
 * hands nothing out.
 */
export function handOutOf(reading: Reading, expression: AstNode): Partial<CxUse> {
  if (reading.isDependency !== true) return {}
  const flow = flowOf(reading.analysis, expression)
  if (flow.isUnbound) return { isUnboundHandOut: true }
  if (flow.names.size === 0) return {}
  return { exportedAs: [...flow.names], isRenamed: true }
}
