import { inspectAtomicLayer } from '@navecss/core/collect'

/**
 * The built-in atoms a stylesheet's `@layer atomic` block still holds a rule for, sorted.
 */
export function atomsIn(css: string): string[] {
  return [...inspectAtomicLayer(css).atoms].toSorted((a, b) => a.localeCompare(b))
}
