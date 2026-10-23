/**
 * What counts as a plain object in an `extend` atom map, in one place: the validators' walk, the
 * snapshot that copies the map, and the resolver that renders a declarations map all ask it, so
 * they cannot disagree about whether a value is read as a map of declarations or refused.
 *
 * A plain object is a non-array object that is not a boxed primitive. A boxed primitive
 * (`new String('x')`) is an object that stands for a primitive; read as a map it would render one
 * declaration per character. It is recognised by its brand, never by `Symbol.toStringTag`, which
 * any object can set. Where the host has `node:util`, its `types` read the internal slot of each box
 * and answer without throwing; where it has not (a browser harness runs this code too), the
 * built-in `valueOf` of each box throws for anything that is not one. Either way a value whose
 * prototype is one of the five box prototypes (a Proxy over a box is not itself a box) is refused
 * too. `node:util` is looked up at run time and never imported, so a bundler for the browser has
 * nothing to externalise.
 */
import type * as Util from 'node:util'

type BoxName = 'BigInt' | 'Boolean' | 'Number' | 'String' | 'Symbol'

const BOXES: readonly (readonly [BoxName, { valueOf(): unknown }])[] = [
  ['String', String.prototype],
  ['Number', Number.prototype],
  ['Boolean', Boolean.prototype],
  ['BigInt', BigInt.prototype],
  ['Symbol', Symbol.prototype],
]

/**
 * `node:util`'s `types` where the host provides them.
 */
const utilTypes: typeof Util.types | undefined = (
  globalThis as { process?: Partial<NodeJS.Process> }
).process?.getBuiltinModule?.('node:util')?.types

/**
 * The box `value` is by its brand, asked without throwing: the check runs on every value of every
 * atom, and a throw that is caught costs a stack trace each time.
 */
function brandByTypes(types: typeof Util.types, value: object): BoxName | undefined {
  if (types.isStringObject(value)) return 'String'
  if (types.isNumberObject(value)) return 'Number'
  if (types.isBooleanObject(value)) return 'Boolean'
  if (types.isBigIntObject(value)) return 'BigInt'
  return types.isSymbolObject(value) ? 'Symbol' : undefined
}

/**
 * The box `value` is: the first whose built-in `valueOf` accepts it, which throws for any value
 * that is not that box.
 */
function brandByValueOf(value: object): BoxName | undefined {
  for (const [name, prototype] of BOXES) {
    try {
      prototype.valueOf.call(value)
      return name
    } catch {
      // not this box
    }
  }
  return undefined
}

/**
 * The box `value` is by its brand, `undefined` when it has none.
 */
function brandOf(value: object): BoxName | undefined {
  return utilTypes === undefined ? brandByValueOf(value) : brandByTypes(utilTypes, value)
}

/**
 * The box `value` is: the one whose brand it carries, else the one whose prototype it has;
 * `undefined` for anything that is not a boxed primitive.
 */
export function boxedPrimitiveKind(value: unknown): BoxName | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const brand = brandOf(value)
  if (brand !== undefined) return brand
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
