/**
 * Which (class, item) pairs the render rows of AC-22 have asserted so far in this test file. A row
 * records the pairs it asserts once its assertions hold; the file's last test then compares what
 * was recorded with the table the file owns. A pair that only that row records is left
 * unrecorded when the row is skipped, removed or never reached, and reds that test; a pair that
 * several rows record stays recorded as long as one of them runs, so the file's other checks (the
 * disabled-part list, the rows' own assertions) hold what the tie does not.
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
The classes are the ones the element was rendered with, so a class moved to another part is not
recorded for this one.
 */
export const recordCarried = (element: Element | undefined, item: string, value?: string): void => {
  if (element !== undefined && hasItem(element, item, value)) {
    recordPairs([...element.classList].map((cls) => [cls, item] as const))
  }
}

const isNested = (a: Element, b: Element | undefined): boolean =>
  b !== undefined && (a.contains(b) || b.contains(a))

/**
Records, for each class the owner carries, the pair with the item, when the holder holds the item
and one of the two is inside the other: the pair a rule on the owner reads off an item of its
ancestor (an indicator under the control that is checked, a popup under the positioner that sets a
variable) or of its descendant (a group whose input is invalid).
 */
export const recordRelated = (
  owner: Element | undefined,
  holder: Element | undefined,
  item: string,
  value?: string,
): void => {
  if (owner !== undefined && isNested(owner, holder) && hasItem(holder, item, value)) {
    recordPairs([...owner.classList].map((cls) => [cls, item] as const))
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
