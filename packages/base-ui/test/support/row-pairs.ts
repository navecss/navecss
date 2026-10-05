/**
 * Which (class, item) pairs the render rows of AC-22 have asserted so far in this test file. A row
 * records the pairs it asserts once its assertions hold; the file's last test then compares what
 * was recorded with the table the file owns, so a row that is skipped, removed or never reached
 * leaves its pairs unrecorded and reds that test.
 */
import type { Pair } from './vocabulary-pairs.ts'

import { hasItem } from './rows.ts'

const recorded = new Set<string>()

const keyOf = ([cls, item]: Pair): string => `${cls} ${item}`

export const recordPairs = (pairs: readonly Pair[]): void => {
  for (const pair of pairs) {
    recorded.add(keyOf(pair))
  }
}

/**
Records, for each class the element carries, the pair with the item, when the element carries the
item (with the value, when one is given): the pair a rule keyed on the element's own class reads.
 */
export const recordCarried = (element: Element | undefined, item: string, value?: string): void => {
  if (element !== undefined && hasItem(element, item, value)) {
    recordPairs([...element.classList].map((cls) => [cls, item] as const))
  }
}

/**
The pairs of the table no row has recorded.
 */
export const unrecordedPairs = (table: Readonly<Record<string, readonly Pair[]>>): string[] =>
  Object.values(table)
    .flat()
    .map((pair) => keyOf(pair))
    .filter((key) => !recorded.has(key))
    .toSorted((a, b) => a.localeCompare(b))
