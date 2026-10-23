/**
 * The three range shapes a peer dependency takes, put into words the way the cleared templates
 * word them. This is the test's own mapping, written without the generator: a caret range, a
 * `>=` and `<` pair, and two carets joined by `||`. Any other shape throws.
 */

const withoutPatchZero = (version: string): string => version.replace(/\.0$/, '')

const caretFloor = (range: string): string | undefined => {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)
  if (match === null) return undefined
  const [, major, minor, patch] = match
  const floor = patch === '0' ? `${major}.${minor}` : `${major}.${minor}.${patch}`
  return `${floor} or later in the ${major}.x line`
}

const pairFloor = (range: string): string | undefined => {
  const match = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(range)
  if (match === null) return undefined
  return `${match[1]} or later before ${withoutPatchZero(match[2] ?? '')}`
}

const majorsFloor = (range: string): string | undefined => {
  const match = /^\^(\d+) \|\| \^(\d+)$/.exec(range)
  if (match === null) return undefined
  return `${match[1]} or ${match[2]}`
}

/**
 * A peer range in words. Throws, naming the range, when it has none of the three shapes.
 */
export const floorWords = (range: string): string => {
  const words = caretFloor(range) ?? pairFloor(range) ?? majorsFloor(range)
  if (words === undefined) throw new Error(`no words for the range ${range}`)
  return words
}

export interface FloorWords {
  readonly baseUi: string
  readonly react: string
  readonly tokens: string
}

/**
 * The three floors a template or the README words, read from a `peerDependencies` object.
 */
export const floorsOf = (peerDependencies: Readonly<Record<string, string>>): FloorWords => {
  const rangeOf = (name: string): string => {
    const range = peerDependencies[name]
    if (range === undefined) throw new Error(`peerDependencies has no ${name}`)
    return range
  }
  return {
    baseUi: floorWords(rangeOf('@base-ui/react')),
    react: floorWords(rangeOf('react')),
    tokens: floorWords(rangeOf('@navecss/tokens')),
  }
}
