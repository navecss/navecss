/**
 * A deep, plain-data copy of a `navePlugin({ extend })` atom map, taken before
 * `validateExtendAtoms` ever sees it. `extend` is consumer-authored, and nothing stops a
 * declaration value, a pseudo's declarations, or a media/container block from being a getter or
 * a `toString`-overriding object rather than a plain string: read once by validation and again at
 * emission, either can legally answer differently the second time, so the text validation
 * approved is never the text that reaches the generated stylesheet. Every own enumerable
 * string-keyed property below this function's entry point is read exactly once — by property
 * access for `declarations`/`pseudos`/`media`/`container` themselves, and via `Object.entries`
 * for their own entries — and every declaration-value leaf is converted to a string exactly once
 * with it. `validateExtendAtoms` and every later lookup then read only the plain data this
 * returns, never the caller's own object again.
 */
import type { AtomDefinition } from './atoms.ts'
import type { ExtendMap } from './directive/resolve.ts'

/**
Whether `value` is a non-array object that is not a boxed primitive (`new String('x')` and its kind, read by their built-in tag): the only shape a nested `declarations`/`pseudos`/media-or-container block map may legally take. Anything else is left exactly as read (a single property access already spent), for the validator and the existing per-use shape checks downstream to diagnose in their own words.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return !/^\[object (?:BigInt|Boolean|Number|String|Symbol)\]$/.test(
    Object.prototype.toString.call(value),
  )
}

/**
A declaration map's own entries, each value converted to a string exactly once — whether it started out as one or not, so a getter or a `toString`-overriding object never gets a second, later chance to answer differently.
 */
function snapshotDeclarations(declarations: unknown): unknown {
  if (!isPlainObject(declarations)) return declarations
  // `Object.create(null)`, not a `{}` literal: a `{}` literal's inherited
  // `Object.prototype.__proto__` accessor turns `out['__proto__'] = …` below into
  // resetting the object's own prototype instead of adding an own property, so a
  // declaration genuinely named `__proto__` would silently vanish from the snapshot.
  const out: Record<string, string> = Object.create(null) as Record<string, string>
  for (const [prop, value] of Object.entries(declarations)) {
    out[prop] = typeof value === 'string' ? value : String(value)
  }
  return out
}

/**
A `pseudos` map's own entries: each pseudo key kept as-is (already a real string, not a value that can carry its own getter), each nested declaration map deep-copied.
 */
function snapshotPseudos(pseudos: unknown): unknown {
  if (!isPlainObject(pseudos)) return pseudos
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [selector, declarations] of Object.entries(pseudos)) {
    out[selector] = snapshotDeclarations(declarations)
  }
  return out
}

/**
One `media`/`container` block: its own `declarations` and `pseudos` properties, each read exactly once (by property access, only when present) and deep-copied.
 */
function snapshotAtBlock(block: unknown): unknown {
  if (!isPlainObject(block)) return block
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  if ('declarations' in block) out.declarations = snapshotDeclarations(block.declarations)
  if ('pseudos' in block) out.pseudos = snapshotPseudos(block.pseudos)
  return out
}

/**
A `media`/`container` map's own entries, each condition key kept as-is, each block deep-copied.
 */
function snapshotAtBlocks(blocks: unknown): unknown {
  if (!isPlainObject(blocks)) return blocks
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [condition, block] of Object.entries(blocks)) {
    out[condition] = snapshotAtBlock(block)
  }
  return out
}

/**
One atom's own `declarations`, `pseudos`, `media` and `container` properties, each read exactly once (by property access, only when present) and deep-copied. `null`/`undefined` (a registered-but-empty extend key) and anything else that is not a plain object pass through unchanged, for the same per-use shape checks that already diagnose a malformed atom to keep doing so.
 */
function snapshotAtomDefinition(atom: unknown): unknown {
  if (!isPlainObject(atom)) return atom
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  if ('declarations' in atom) out.declarations = snapshotDeclarations(atom.declarations)
  if ('pseudos' in atom) out.pseudos = snapshotPseudos(atom.pseudos)
  if ('media' in atom) out.media = snapshotAtBlocks(atom.media)
  if ('container' in atom) out.container = snapshotAtBlocks(atom.container)
  return out
}

/**
 * A frozen-in-time, deep, plain-data copy of `map`: every atom's own `declarations`, `pseudos`,
 * `media` and `container` properties, and every entry inside them, read exactly once and
 * converted to plain strings/objects — never the caller's own object, so a key added, hidden
 * (non-enumerable) or answered only through a Proxy trap or a getter after this snapshot is
 * taken can never reach a directive's output, and a value that would answer differently on a
 * second read never gets one.
 */
export function snapshotExtendMap(map: ExtendMap): ExtendMap {
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [name, atom] of Object.entries(map)) {
    out[name] = snapshotAtomDefinition(atom)
  }
  return out as Record<string, AtomDefinition | null | undefined>
}
