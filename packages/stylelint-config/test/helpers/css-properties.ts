/**
 * A CSS property list the tests do not derive from this package: `mdn-data`'s
 * `css/properties.json`, resolved through stylelint's own dependency on `css-tree` (the lexer
 * stylelint validates declarations with). It is read from there because no workspace manifest
 * names `mdn-data` directly, and a list taken from the package under test could never show that
 * the package's own list leaves a property out.
 *
 * Throws, rather than returning an empty list, when that chain stops resolving: an empty list
 * would turn every "each property is matched" assertion into a pass over nothing.
 */
import { createRequire } from 'node:module'

/**
 * Every property name `mdn-data` lists, read through the chain described above.
 */
export function cssPropertyNames(): string[] {
  const fromHere = createRequire(import.meta.url)
  const fromStylelint = createRequire(fromHere.resolve('stylelint'))
  const fromCssTree = createRequire(fromStylelint.resolve('css-tree'))
  const properties = fromCssTree('mdn-data/css/properties.json') as Record<string, unknown>
  const names = Object.keys(properties)
  if (names.length < 100) {
    throw new Error(`mdn-data's css/properties.json listed only ${names.length} properties`)
  }
  return names
}

/**
 * Whether one entry of the strict-value rule's property list applies to `property`, read the way
 * the plugin reads it: a `/source/flags` string is a regular expression, any other string must
 * equal the property name exactly.
 */
export function isMatchedByEntry(entry: string, property: string): boolean {
  const regex = /^\/(.+)\/([a-z]*)$/s.exec(entry)
  if (regex) return new RegExp(regex[1]!, regex[2]).test(property)
  return entry === property
}
