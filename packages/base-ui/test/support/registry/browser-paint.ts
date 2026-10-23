/**
 * Computed-style snapshots and their comparison: every property `getComputedStyle` lists for an
 * element, or for one of its pseudo-elements, and the properties on which two snapshots differ.
 */
import { useSheets } from '../../browser/support/page.ts'

export type Snapshot = ReadonlyMap<string, string>

export interface Measured {
  /**
  The parts or states a measurement could not take, and why.
   */
  readonly notMeasured: string[]
  /**
  Every state of every part, by `<part> [<pseudo-element>] <state>`.
   */
  readonly snapshots: Map<string, Snapshot>
  /**
  The focusable parts whose element cannot take DOM focus.
   */
  readonly unfocusable: string[]
}

export const snapshotOf = (element: Element, pseudo?: string): Snapshot => {
  const style = getComputedStyle(element, pseudo)
  return new Map([...style].map((name) => [name, style.getPropertyValue(name)] as const))
}

/**
The properties on which two snapshots differ, each with the two values.
 */
export const differences = (left: Snapshot, right: Snapshot): string[] =>
  [...new Set([...left.keys(), ...right.keys()])]
    .filter((name) => left.get(name) !== right.get(name))
    .map((name) => `${name}: ${left.get(name) ?? 'absent'} / ${right.get(name) ?? 'absent'}`)

/**
Every key either measurement has, with the properties on which the two differ.
 */
export const compare = (left: Measured, right: Measured): Map<string, string[]> => {
  const found = new Map<string, string[]>()
  const keys = new Set([...left.snapshots.keys(), ...right.snapshots.keys()])
  for (const key of keys) {
    const a = left.snapshots.get(key)
    const b = right.snapshots.get(key)
    found.set(
      key,
      a === undefined || b === undefined ? ['measured on one side only'] : differences(a, b),
    )
  }
  return found
}

/**
The sheets in the document while a measurement runs, in the order given, and taken out again.
 */
export const withSheets = async <Result>(
  sheets: readonly string[],
  run: () => Promise<Result>,
): Promise<Result> => {
  const remove = useSheets(...sheets)
  try {
    return await run()
  } finally {
    remove()
  }
}
