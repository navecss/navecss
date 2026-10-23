/**
 * Finding text two collections share: a run of `WINDOW` characters, whitespace folded, that appears
 * in a file of each. A rolling hash over every window of the (small) first collection goes in a map,
 * the second collection is streamed once past it, and every hit is confirmed against the text
 * itself, so the cost is linear in the two sizes and a hash collision cannot report a false match.
 */
/* eslint-disable unicorn/prefer-code-point -- a window is WINDOW UTF-16 units, as `slice` counts them, so a code unit is what is hashed */
export const WINDOW = 120

export interface NamedText {
  readonly name: string
  readonly text: string
}

export interface SharedRun {
  readonly first: string
  readonly second: string
}

// Two moduli just under 2^26, so every product stays below 2^53 and the pair packs into one number.
const MODULUS_A = 67_108_859
const MODULUS_B = 67_108_837
const BASE_A = 131
const BASE_B = 137
const PACK = 67_108_864

export const foldWhitespace = (text: string): string => text.replaceAll(/\s+/g, ' ')

const powerOf = (base: number, modulus: number): number => {
  let power = 1
  for (let step = 1; step < WINDOW; step += 1) power = (power * base) % modulus
  return power
}

const POWER_A = powerOf(BASE_A, MODULUS_A)
const POWER_B = powerOf(BASE_B, MODULUS_B)

/**
 * The packed hash of every window of the text, in order, passed to `visit` with the window's start.
 */
const forEachWindow = (text: string, visit: (key: number, start: number) => void): void => {
  if (text.length < WINDOW) return
  let hashA = 0
  let hashB = 0
  for (let at = 0; at < WINDOW; at += 1) {
    const code = text.charCodeAt(at)
    hashA = (hashA * BASE_A + code) % MODULUS_A
    hashB = (hashB * BASE_B + code) % MODULUS_B
  }
  visit(hashA * PACK + hashB, 0)
  for (let start = 1; start + WINDOW <= text.length; start += 1) {
    const out = text.charCodeAt(start - 1)
    const added = text.charCodeAt(start + WINDOW - 1)
    hashA =
      (((hashA - ((out * POWER_A) % MODULUS_A) + MODULUS_A) % MODULUS_A) * BASE_A + added) %
      MODULUS_A
    hashB =
      (((hashB - ((out * POWER_B) % MODULUS_B) + MODULUS_B) % MODULUS_B) * BASE_B + added) %
      MODULUS_B
    visit(hashA * PACK + hashB, start)
  }
}

interface Position {
  readonly file: number
  readonly start: number
}

const indexWindows = (first: readonly NamedText[]): Map<number, Position> => {
  const windows = new Map<number, Position>()
  for (const [index, file] of first.entries()) {
    forEachWindow(file.text, (key, start) => {
      if (!windows.has(key)) windows.set(key, { file: index, start })
    })
  }
  return windows
}

/**
 * Every pair of a file of `first` and a file of `second` that share a run of `WINDOW` characters or
 * more, as given: fold the texts first when whitespace should not count.
 */
export const sharedRuns = (
  first: readonly NamedText[],
  second: Iterable<NamedText>,
): SharedRun[] => {
  const windows = indexWindows(first)
  const found = new Map<string, SharedRun>()
  for (const other of second) {
    forEachWindow(other.text, (key, start) => {
      const position = windows.get(key)
      const file = position === undefined ? undefined : first[position.file]
      if (position === undefined || file === undefined) return
      const pair = `${file.name}\n${other.name}`
      if (found.has(pair)) return
      const window = other.text.slice(start, start + WINDOW)
      if (file.text.slice(position.start, position.start + WINDOW) === window) {
        found.set(pair, { first: file.name, second: other.name })
      }
    })
  }
  return found.values().toArray()
}
