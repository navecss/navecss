/**
 * Which CSS property names relate: setting one can set, reset or override the other. Two
 * properties relate when they are the same property, one is a shorthand containing the other
 * (through any number of shorthands), they share a longhand (`all` shares one with every property
 * but `direction` and `unicode-bidi`), or they are a logical and a physical member of one logical
 * property group. A custom property relates only to itself, and so does a vendor-prefixed one.
 *
 * The data is `property-table.generated.ts`; this module is only the lookups over it.
 */
import { LOGICAL_GROUPS, PROPERTY_LONGHANDS } from './property-table.generated.ts'

type Side = 'both' | 'logical' | 'physical'

const VENDOR_PREFIXED = /^-(?:webkit|moz|ms|o)-[a-z0-9-]+$/

const LONGHAND_LISTS = new Map<string, readonly string[]>(Object.entries(PROPERTY_LONGHANDS))

const LONGHAND_SETS = new Map<string, ReadonlySet<string>>(
  Object.entries(PROPERTY_LONGHANDS).map(([name, longhands]) => [name, new Set(longhands)]),
)

const GROUP_OF_LONGHAND = new Map<string, { readonly group: string; readonly logical: boolean }>(
  Object.entries(LOGICAL_GROUPS).flatMap(([group, { logical, physical }]) => [
    ...logical.map((name): [string, { group: string; logical: boolean }] => [
      name,
      { logical: true, group },
    ]),
    ...physical.map((name): [string, { group: string; logical: boolean }] => [
      name,
      { logical: false, group },
    ]),
  ]),
)

/**
 * A custom property name: `--` and at least one more character. Custom property names are
 * case-sensitive, so nothing here folds case.
 */
function isCustomProperty(name: string): boolean {
  return name.startsWith('--') && name.length > 2
}

/**
 * The name with its ASCII letters lowercased and nothing else changed. `toLowerCase()` would
 * also fold the Kelvin sign (U+212A) to `k` and so make a non-ASCII name match a property.
 */
function foldAscii(name: string): string {
  return name.replaceAll(/[A-Z]+/g, (letters) => letters.toLowerCase())
}

/**
Whether a name is a non-custom property that the table holds, as written or in any ASCII case.
 */
function knownLonghands(name: string): ReadonlySet<string> | undefined {
  return LONGHAND_SETS.get(foldAscii(name))
}

/**
 * Whether the name is a CSS property: one the table holds (in any ASCII case), a custom property
 * (`--x`), or a vendor-prefixed name (`-webkit-`, `-moz-`, `-ms-` or `-o-`, then the name).
 */
export function isCssProperty(name: string): boolean {
  return (
    isCustomProperty(name) ||
    VENDOR_PREFIXED.test(foldAscii(name)) ||
    knownLonghands(name) !== undefined
  )
}

/**
 * The longhands a property sets, through any number of shorthands: the property itself when it is
 * a longhand. A custom property returns its name as written, a vendor-prefixed one its name
 * lowercased, and a name that is no property returns nothing. Names the table holds come back
 * lowercase, sorted.
 */
export function longhandsOf(name: string): readonly string[] {
  if (isCustomProperty(name)) return [name]
  const folded = foldAscii(name)
  if (VENDOR_PREFIXED.test(folded)) return [folded]
  return LONGHAND_LISTS.get(folded) ?? []
}

/**
 * The logical property group a longhand belongs to, and whether it is the flow-relative (logical)
 * or the physical member. A shorthand, a custom property and any name outside every group return
 * nothing: a shorthand reaches its group through the longhands it sets.
 */
export function logicalGroupOf(
  name: string,
): { readonly group: string; readonly logical: boolean } | undefined {
  return GROUP_OF_LONGHAND.get(foldAscii(name))
}

/**
Whether the two sets have a member in common.
 */
function haveCommonMember(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  return [...smaller].some((member) => larger.has(member))
}

/**
 * For each logical property group a property touches through its longhands, which side it is on:
 * `logical` or `physical` when every member it sets in the group is on that side, `both` when it
 * sets members of each (`all`).
 */
function sidesOf(longhands: ReadonlySet<string>): Map<string, Side> {
  const sides = new Map<string, Side>()
  for (const longhand of longhands) {
    const member = GROUP_OF_LONGHAND.get(longhand)
    if (member === undefined) continue
    const side: Side = member.logical ? 'logical' : 'physical'
    const known = sides.get(member.group)
    sides.set(member.group, known === undefined || known === side ? side : 'both')
  }
  return sides
}

/**
 * Whether two different properties are a logical and a physical member of one logical property
 * group, directly or through the shorthands that set them: `left` and `inset-inline` are, because
 * `inset-inline` sets `inset-inline-start` and `inset-inline-end`, which the writing mode pairs
 * with `left` or `right`. A property that sets both sides of a group, `all`, forms no pair.
 */
export function isLogicalPhysicalPair(a: string, b: string): boolean {
  const first = knownLonghands(a)
  const second = knownLonghands(b)
  if (first === undefined || second === undefined || foldAscii(a) === foldAscii(b)) return false
  const secondSides = sidesOf(second)
  return [...sidesOf(first)].some(([group, side]) => {
    const other = secondSides.get(group)
    return other !== undefined && side !== 'both' && other !== 'both' && side !== other
  })
}

/**
 * Whether setting `a` and setting `b` can affect the same property. A custom property relates
 * only to the same custom property (case-sensitive), a vendor-prefixed one only to itself; every
 * other name compares without regard to ASCII case, and a name that is no property relates only
 * to itself.
 */
// eslint-disable-next-line unicorn/consistent-boolean-name -- the relation reads as a sentence: propertiesRelate(a, b)
export function propertiesRelate(a: string, b: string): boolean {
  if (isCustomProperty(a) || isCustomProperty(b)) return a === b
  const first = foldAscii(a)
  const second = foldAscii(b)
  if (first === second) return true
  if (VENDOR_PREFIXED.test(first) || VENDOR_PREFIXED.test(second)) return false
  const firstLonghands = LONGHAND_SETS.get(first)
  const secondLonghands = LONGHAND_SETS.get(second)
  if (firstLonghands === undefined || secondLonghands === undefined) return false
  return haveCommonMember(firstLonghands, secondLonghands) || isLogicalPhysicalPair(first, second)
}
