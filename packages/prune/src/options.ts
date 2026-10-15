/**
 * The options `withNave()` takes: the ones `navePlugin()` from `@navecss/core/vite` takes for the
 * atoms it ships, without `atomic` (this package has one behaviour), plus `extend` and
 * `onUnknown` of the `@nave` directive.
 */
import type { AtomName } from '@navecss/core/atoms'
import type { AtomDefinition } from '@navecss/core/postcss'

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
