/**
 * What counts as a plain object in an `extend` atom map, in one place: the validators' walk, the
 * snapshot that copies the map, and the resolver that renders a declarations map all ask it, so
 * they cannot disagree about whether a value is read as a map of declarations or refused.
 *
 * A plain object is a non-array object that is not a boxed primitive. A boxed primitive
 * (`new String('x')`) is an object that stands for a primitive; read as a map it would render one
 * declaration per character. It is recognised by its brand, never by `Symbol.toStringTag`, which
 * any object can set: the built-in `valueOf` of each box throws for anything that is not one, and
 * a value whose prototype is one of the five box prototypes (a Proxy over a box is not itself a
 * box) is refused too.
 */

type BoxName = 'BigInt' | 'Boolean' | 'Number' | 'String' | 'Symbol'

const BOXES: readonly (readonly [BoxName, { valueOf(): unknown }])[] = [
  ['String', String.prototype],
  ['Number', Number.prototype],
  ['Boolean', Boolean.prototype],
  ['BigInt', BigInt.prototype],
  ['Symbol', Symbol.prototype],
]

/**
 * The box `value` is: the first whose built-in `valueOf` accepts it, else the one whose prototype
 * it has; `undefined` for anything that is not a boxed primitive.
 */
export function boxedPrimitiveKind(value: unknown): BoxName | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  for (const [name, prototype] of BOXES) {
    try {
      prototype.valueOf.call(value)
      return name
    } catch {
      // not this box
    }
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    return BOXES.find(([, box]) => box === prototype)?.[0]
  } catch {
    return undefined
  }
}

/**
 * The primitive a boxed primitive stands for, or `undefined` when it cannot be read (a Proxy over
 * a box has none).
 */
export function unboxedPrimitive(value: object): unknown {
  for (const [, prototype] of BOXES) {
    try {
      return prototype.valueOf.call(value)
    } catch {
      // not this box
    }
  }
  return undefined
}

/**
 * Whether `value` is a plain object: a non-array object that is not a boxed primitive.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    boxedPrimitiveKind(value) === undefined
  )
}
