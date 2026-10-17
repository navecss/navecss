/**
 * The options `withNave()` takes: the ones `navePlugin()` from `@navecss/core/vite` takes for the
 * atoms it ships, without `atomic` (this package has one behaviour), plus `extend` and
 * `onUnknown` of the `@nave` directive. A value a type would refuse in TypeScript is refused here
 * too, so a JavaScript config gets the same answer.
 */
import type { AtomName } from '@navecss/core/atoms'
import type { AtomDefinition } from '@navecss/core/postcss'

import { assertOptions } from '@navecss/core/collect'

export interface NaveOptions {
  /**
   * Atoms always shipped, whether or not the build reads a use of them.
   */
  keep?: readonly AtomName[]
  /**
   * By package name: the atoms a dependency's own `cx()` calls can produce.
   */
  keepFor?: Readonly<Record<string, readonly AtomName[]>>
  /**
   * Modules that re-export `cx` from `@navecss/core/cx` unchanged.
   */
  cxModules?: readonly string[]
  /**
   * Consumer-defined atoms for `@nave`, or the path of a module whose default export is them.
   */
  extend?: Readonly<Record<string, AtomDefinition>> | string
  /**
   * What a problem in a `@nave` directive does: `'error'` (default) fails `next build`, `'warn'`
   * prints it, `'ignore'` skips it.
   */
  onUnknown?: 'error' | 'ignore' | 'warn'
}

const ON_UNKNOWN = new Set(['error', 'ignore', 'warn'])

/**
 * The names of the consumer's own atoms, when `extend` is an object; `undefined` while a module
 * path has not been read.
 */
function ownAtomsOf(extend: unknown): ReadonlySet<string> | undefined {
  if (typeof extend === 'string') return undefined
  if (typeof extend === 'object' && extend !== null) return new Set(Object.keys(extend))
  return new Set()
}

/**
 * Throws, naming `withNave()`, the first problem in `options`.
 */
export function assertNaveOptions(options: NaveOptions): void {
  const { onUnknown, extend } = options
  try {
    assertOptions(options, ownAtomsOf(extend))
  } catch (error) {
    throw new Error((error as Error).message.replace(/^navePlugin\(\): /, 'withNave(): '), {
      cause: error,
    })
  }
  if (onUnknown !== undefined && !ON_UNKNOWN.has(onUnknown)) {
    throw new Error("withNave(): onUnknown must be 'error', 'warn' or 'ignore'.")
  }
}
