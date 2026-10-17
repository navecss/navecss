/**
 * Comparing a copy's rendered document with the package's: the same tags and the same attributes
 * (`data-nave-*` included), and, in place of equal classes, one atom for each class token of the copy,
 * the atoms the package element carries, in order.
 */
import type { ElementRecord } from '../dom.ts'

const PACKAGE_PREFIX = 'nave-base-ui-'

const marker = (record: ElementRecord): string => record.attributes.get('data-part') ?? 'unmarked'

const tokensOf = (value: string | undefined): string[] => (value ?? '').split(' ')

const hasValue = (value: string | undefined): boolean => value !== undefined && value !== ''

/**
 * What is wrong with one element's class tokens in a copy, given the atom each class token stands for.
 */
const classProblems = (
  where: string,
  packageClass: string | undefined,
  copyClass: string | undefined,
  atomOfToken: ReadonlyMap<string, string>,
): string[] => {
  const copyTokens = hasValue(copyClass) ? tokensOf(copyClass) : []
  const expected = tokensOf(packageClass).filter((token) => token.startsWith(PACKAGE_PREFIX))
  const problems = copyTokens.flatMap((token) => {
    if (token === '') return [`${where}: an empty class token`]
    if (token === 'undefined') return [`${where}: the class token "undefined"`]
    return atomOfToken.has(token) ? [] : [`${where}: class token "${token}" stands for no atom`]
  })
  if (problems.length > 0) return problems
  const atoms = copyTokens.map((token) => atomOfToken.get(token))
  return atoms.length === expected.length && atoms.every((atom, index) => atom === expected[index])
    ? []
    : [`${where}: classes are atoms [${atoms.join(' ')}], the package has [${expected.join(' ')}]`]
}

const attributeProblems = (
  where: string,
  packageRecord: ElementRecord,
  copyRecord: ElementRecord,
): string[] => {
  const names = new Set([...packageRecord.attributes.keys(), ...copyRecord.attributes.keys()])
  return [...names]
    .filter((name) => name !== 'class')
    .filter((name) => packageRecord.attributes.get(name) !== copyRecord.attributes.get(name))
    .map(
      (name) =>
        `${where}: ${name} is ${copyRecord.attributes.get(name) ?? 'absent'}, the package has ${packageRecord.attributes.get(name) ?? 'absent'}`,
    )
}

/**
 * Where the copy's document differs from the package's, each difference naming the element and its
 * part. An empty list means the two are equal in the sense above.
 */
export const copyParityViolations = (
  packageRecords: readonly ElementRecord[],
  copyRecords: readonly ElementRecord[],
  atomOfToken: ReadonlyMap<string, string>,
): string[] => {
  if (packageRecords.length !== copyRecords.length) {
    return [`${copyRecords.length} elements, the package has ${packageRecords.length}`]
  }
  return packageRecords.flatMap((expected, index) => {
    const actual = copyRecords[index]
    if (actual === undefined) return []
    const where = `element ${index} <${actual.tag}> ${marker(actual)}`
    if (actual.tag !== expected.tag) return [`${where}: the package has <${expected.tag}>`]
    return [
      ...attributeProblems(where, expected, actual),
      ...classProblems(
        where,
        expected.attributes.get('class'),
        actual.attributes.get('class'),
        atomOfToken,
      ),
    ]
  })
}
