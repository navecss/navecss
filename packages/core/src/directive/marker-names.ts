/**
 * Names for a set of longhands, as short as the set allows: a shorthand stands for its longhands
 * only where the set holds every one of them.
 */
import { PROPERTY_LONGHANDS } from './property-table.generated.ts'

const SHORTHANDS: readonly (readonly [string, readonly string[]])[] = Object.entries(
  PROPERTY_LONGHANDS,
)
  .filter(([name, longhands]) => longhands.length > 1 && name !== 'all')
  .toSorted((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))

/**
 * The shorthands the set holds whole, the largest first, none inside another one picked.
 */
function wholeShorthands(set: ReadonlySet<string>): Map<string, readonly string[]> {
  const picked = new Map<string, readonly string[]>()
  const covered = new Set<string>()
  for (const [name, longhands] of SHORTHANDS) {
    if (longhands.some((longhand) => !set.has(longhand))) continue
    if (longhands.every((longhand) => covered.has(longhand))) continue
    picked.set(name, longhands)
    for (const longhand of longhands) covered.add(longhand)
  }
  return picked
}

/**
 * `longhands` named by shorthands where they hold a shorthand whole and by themselves otherwise,
 * in the order of their first appearance.
 */
export function namesForLonghands(longhands: readonly string[]): string[] {
  const shorthands = wholeShorthands(new Set(longhands))
  const names: string[] = []
  const seen = new Set<string>()
  for (const longhand of longhands) {
    const owner = [...shorthands].find(([, members]) => members.includes(longhand))
    const name = owner ? owner[0] : longhand
    if (!seen.has(name)) names.push(name)
    seen.add(name)
  }
  return names
}
