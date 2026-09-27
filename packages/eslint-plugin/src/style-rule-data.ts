/**
 * Shares `@navecss/stylelint-config`'s property list and allowlist without depending on that
 * package: this reads the drift-checked, committed generated copy instead
 * (`scripts/check-eslint-plugin-style-properties-drift.mjs`).
 */
import recorded from './generated/style-properties.recorded.json' with { type: 'json' }

export interface CompiledStyleEntry {
  test(property: string): boolean
  admits(value: string): boolean
}

type CompiledEntry = CompiledStyleEntry

/**
 *
 */
function compilePattern(source: string): RegExp {
  const closingSlash = source.lastIndexOf('/')
  return new RegExp(source.slice(1, closingSlash), source.slice(closingSlash + 1))
}

const entries: CompiledEntry[] = recorded.properties.map((key) => {
  const ignoreValues = compilePattern((recorded.ignoreValues as Record<string, string>)[key]!)
  const propertyTest = key.startsWith('/') ? compilePattern(key) : undefined
  return {
    test: (property) => (propertyTest ? propertyTest.test(property) : property === key),
    admits: (value) => ignoreValues.test(value),
  }
})

/**
Properties whose numeric CSS value renders with no implied unit.
 */
const UNITLESS_PROPERTIES = new Set(['font-weight', 'line-height', 'opacity', 'z-index'])

/**
Converts a JSX style key (`paddingTop`, `WebkitTransform`, `msTransform`) to its CSS property
name. React's `ms` prefix is written lowercase, unlike every other vendor prefix, so it is
recognised the same way those are: mapped to a leading `-ms-`.
 */
export function cssPropertyName(key: string): string {
  const isVendorPrefixed = /^[A-Z]/.test(key) || /^ms[A-Z]/.test(key)
  const kebab = key.replaceAll(/([A-Z])/g, '-$1').toLowerCase()
  return isVendorPrefixed ? `-${kebab}` : kebab
}

/**
Finds the entry governing `property`, if any (the style rule only checks properties on that
list).
 */
export function findEntry(property: string): CompiledEntry | undefined {
  return entries.find((entry) => entry.test(property))
}

/**
Renders a JSX numeric style value as CSS would: an implied `px` unless unitless or zero.
 */
export function renderNumericValue(property: string, value: number): string {
  if (value === 0 || UNITLESS_PROPERTIES.has(property)) return String(value)
  return `${value}px`
}
