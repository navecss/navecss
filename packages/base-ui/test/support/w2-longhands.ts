/**
 * The physical longhands a declared property sets, so that two rules can be compared on what they
 * actually write: a shorthand is expanded to its longhands, and a logical longhand is mapped to
 * both physical sides of its axis (it lands on either one, depending on the writing mode).
 */

const SIDES: Readonly<Record<string, readonly string[]>> = {
  top: ['top'],
  right: ['right'],
  bottom: ['bottom'],
  left: ['left'],
  block: ['top', 'bottom'],
  'block-start': ['top', 'bottom'],
  'block-end': ['top', 'bottom'],
  inline: ['left', 'right'],
  'inline-start': ['left', 'right'],
  'inline-end': ['left', 'right'],
}

const ALL_SIDES = ['top', 'right', 'bottom', 'left']
const CORNERS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
]

/**
 * Logical sizes and their physical counterparts.
 */
const SIZES: Readonly<Record<string, string>> = {
  'inline-size': 'width',
  'block-size': 'height',
  'min-inline-size': 'min-width',
  'min-block-size': 'min-height',
  'max-inline-size': 'max-width',
  'max-block-size': 'max-height',
}

/**
 * Shorthands that are not about the sides of a box, each with the longhands it sets.
 */
const SHORTHANDS: Readonly<Record<string, readonly string[]>> = {
  background: [
    'background-attachment',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
  ],
  flex: ['flex-basis', 'flex-grow', 'flex-shrink'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  gap: ['column-gap', 'row-gap'],
  outline: ['outline-color', 'outline-style', 'outline-width'],
  overflow: ['overflow-x', 'overflow-y'],
  'overflow-block': ['overflow-x', 'overflow-y'],
  'overflow-inline': ['overflow-x', 'overflow-y'],
  'place-content': ['align-content', 'justify-content'],
  'place-items': ['align-items', 'justify-items'],
  'place-self': ['align-self', 'justify-self'],
  transition: [
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
  ],
}

const BOX_FAMILY = /^(margin|padding|scroll-margin|scroll-padding)(?:-([a-z-]+))?$/
const INSET = /^inset(?:-([a-z-]+))?$/
const LOGICAL_CORNER = /^border-(?:start|end)-(?:start|end)-radius$/

const sidesOf = (name: string | undefined): readonly string[] | undefined =>
  name === undefined ? ALL_SIDES : SIDES[name]

const boxFamily = (property: string): string[] | undefined => {
  const match = BOX_FAMILY.exec(property)
  const sides = sidesOf(match?.[2])
  return match === null || sides === undefined
    ? undefined
    : sides.map((side) => `${match[1]}-${side}`)
}

const inset = (property: string): string[] | undefined => {
  const match = INSET.exec(property)
  const sides = sidesOf(match?.[1])
  return match === null || sides === undefined ? undefined : [...sides]
}

const border = (property: string): string[] | undefined => {
  if (property === 'border-radius' || LOGICAL_CORNER.test(property)) return CORNERS
  if (!property.startsWith('border')) return undefined
  const rest = property.slice('border'.length)
  const facet = /-(width|style|color)$/.exec(rest)
  const facets = facet === null ? ['width', 'style', 'color'] : [facet[1] ?? '']
  const named = facet === null ? rest : rest.slice(0, -facet[0].length)
  const sides = named === '' ? ALL_SIDES : SIDES[named.slice(1)]
  return sides?.flatMap((side) => facets.map((item) => `border-${side}-${item}`))
}

/**
 * Every longhand a property sets, shorthands expanded and logical sides mapped to both physical
 * ones. A property that is none of these is its own longhand.
 */
export const longhandsOf = (property: string): string[] => {
  const name = property.toLowerCase()
  const size = SIZES[name]
  if (size !== undefined) return [size]
  const shorthand = SHORTHANDS[name]
  if (shorthand !== undefined) return shorthand.flatMap((item) => longhandsOf(item))
  const found = boxFamily(name) ?? inset(name) ?? border(name)
  return [...new Set(found ?? [name])]
}
