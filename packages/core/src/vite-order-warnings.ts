/**
 * Prints the order warnings of one stylesheet through Vite's logger, never failing the build and
 * whatever `onUnknown` says. A build prints each warning once per command although every
 * environment transforms the stylesheet; a dev server prints a stylesheet's warnings when their
 * set differs from the last set printed for it, an empty set counting as printed.
 */
import type { OrderWarningInput } from './vite-report.ts'

import { placeOrderWarnings } from './vite-report.ts'

export interface WarningMemory {
  /**
   * A build's: the warnings already printed, by file, position and text.
   */
  readonly printed: Set<string>
  /**
   * A dev server's: the set last printed for each stylesheet, by module id.
   */
  readonly lastSets: Map<string, string>
}

/**
 * A memory that has printed nothing.
 */
export function freshWarningMemory(): WarningMemory {
  return { printed: new Set(), lastSets: new Map() }
}

/**
 * Forgets what a dev server printed for the stylesheet `id`: it holds no directive now, so its set
 * is empty and a warning it comes to hold again prints again.
 */
export function noteNoDirective(memory: WarningMemory, id: string): void {
  memory.lastSets.delete(id)
}

/**
 * Prints the warnings of `input` that `memory` says have not been printed.
 */
export function reportOrderWarnings(
  input: OrderWarningInput & { readonly id: string },
  memory: WarningMemory,
  command: string,
): void {
  const placed = placeOrderWarnings(input)
  if (command === 'serve') {
    const set = placed.map((warning) => warning.key).join('\n')
    if (memory.lastSets.get(input.id) === set) return
    memory.lastSets.set(input.id, set)
    for (const warning of placed) warning.print()
    return
  }
  for (const warning of placed) {
    if (memory.printed.has(warning.key)) continue
    memory.printed.add(warning.key)
    warning.print()
  }
}
