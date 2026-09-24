/**
 * The input contract: which `$type`s this reader reads, which shapes it accepts for each, and
 * the refusal it issues for the pre-stable draft shape of the same format.
 *
 * **One shape, not two.** Before the 2025.10 migration this package read the draft-era CSS
 * strings (`"16px"`, `"400"`, `"200ms"`) and, for a shadow layer's sub-fields only, also the
 * typed object form. Both paths are gone: a draft-shaped value is now REFUSED BY NAME, per
 * `$type`, with the edit that converts it. Nothing is published yet, so the only draft-shaped
 * file this package is responsible for is its own, and a second accepted shape would be a
 * permanent code path carrying an ambiguity (a dimension string against a string that merely
 * resembles one) for a compatibility obligation that does not exist.
 *
 * **The refusal collects, it never fails fast.** A reader that throws on the first offending
 * node turns a seventy-four-token gap into seventy-four build cycles, which is the cost the
 * one person who migrates a whole source pays in full. Every offending node is found in one
 * pass and reported together.
 *
 * **Every refused `$type` carries its OWN conversion instruction.** A single templated
 * sentence with the type name interpolated is a dead end with a link attached: the reader does
 * what it says and meets a second wall. The instruction is stated as an act on the file's own
 * bytes, never as "re-export from your authoring tool", because a toolchain that has not
 * finished its own 2025.10 alignment cannot perform that act at all.
 *
 * **A malformed node is collected too, in `dtcg-malformed.ts`, and reported separately from a
 * draft-shaped one.** A node that is neither the accepted 2025.10 shape nor the draft shape for
 * its own `$type` used to reach the renderer and throw on the first such node it met; it is now
 * collected in the same pass and reported alongside, in its own section, never called
 * draft-shaped and never handed a fabricated single fix.
 */

/**
Names the specification wherever a message invokes its authority.
 */
const SPEC_NAME = 'Design Tokens Format Module 2025.10'

/**
The dated pointer every shape refusal ends on. There is no accepted-form list to point at.
 */
export const SPEC_POINTER = `Specification: ${SPEC_NAME}, published 28 October 2025.`

/**
 * The prefix every diagnostic from this reader carries. Dated rather than bare, because a
 * string literal survives compilation into `dist/lib` and a bare "DTCG" names a moving target:
 * the format had a pre-stable draft for years and this reader implements exactly one revision
 * of it.
 */
export const READER = 'DTCG 2025.10 reader:'

/**
 * The eight `$type`s this package reads at 0.1.0: the seven `tokens.json` uses, plus `color`.
 * The pipeline's contract is one token to one custom property to one CSS value string, and
 * that is what decides this set rather than an estimate of effort.
 */
const ACCEPTED_TYPES = new Set([
  'color',
  'cubicBezier',
  'dimension',
  'duration',
  'fontFamily',
  'fontWeight',
  'number',
  'shadow',
])

/**
 * Refused because none of the three can be rendered to ONE CSS value at all: a `transition`
 * names no CSS property, a `gradient` no direction, and a `typography`'s five members do not
 * fit the `font` shorthand. Supporting any of them means one token emitting several custom
 * properties, which moves the emitted NAME SET. That is a different subject, and this refusal
 * has no return trigger.
 */
const STRUCTURAL_REFUSALS = new Map([
  ['gradient', 'a gradient carries no direction, so it cannot render to one CSS value'],
  ['transition', 'a transition names no CSS property, so it cannot render to one CSS value'],
  [
    'typography',
    "a typography's members do not fit the CSS font shorthand, so it cannot render to one CSS value",
  ],
])

/**
 * Refused on SCOPE, not structure: each renders to one value and is cheap, and neither has a
 * consumer at 0.1.0. Stated with its return trigger so the message a reader meets carries the
 * difference, not only this file's prose.
 */
const SCOPE_REFUSALS = new Set(['border', 'strokeStyle'])

const SCOPE_RETURN_TRIGGER =
  'Returns on the first consumer request, or at 0.2.0, whichever comes first.'

/**
 * The format's own weight keywords, lawful as STRINGS under 2025.10. They are what makes
 * `"bold"` acceptable while `"400"` is refused, so the rule is a real distinction rather than
 * "strings are draft-shaped".
 */
const FONT_WEIGHT_KEYWORDS = new Set([
  'black',
  'bold',
  'book',
  'demi-bold',
  'extra-black',
  'extra-bold',
  'extra-light',
  'hairline',
  'heavy',
  'light',
  'medium',
  'normal',
  'regular',
  'semi-bold',
  'thin',
  'ultra-black',
  'ultra-bold',
  'ultra-light',
])

/**
A whole-value `{group.token}` alias, lawful under both revisions and never draft-shaped.
 */
const ALIAS_RE = /^\{[^{}]+\}$/

/**
Whether `value` is a non-array object node, as opposed to a primitive or an array.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether `value` is a whole-value `{group.token}` alias: a reference, not a literal value, so
 * neither the draft-shape check nor `dtcg-malformed.ts`'s well-formedness check ever applies to
 * it — its OWN target is checked, as its own token, once resolved.
 */
export const isAlias = (value: unknown): boolean =>
  typeof value === 'string' && ALIAS_RE.test(value)

/**
 * The per-`$type` conversion, stated as an act on the file's own bytes. Each names the shape
 * difference that type actually has: no two are the same sentence with a type name swapped in,
 * which is the failure `R39` exists to forbid.
 */
const CONVERSIONS: Record<string, string> = {
  dimension:
    'wrap the value in an object carrying a numeric "value" and a "unit", as in {"value": 16, "unit": "px"}. The unit is required even at zero, and the format defines "px" and "rem".',
  duration:
    'wrap the value in an object carrying a numeric "value" and a "unit", as in {"value": 200, "unit": "ms"}. The format defines "ms" and "s" for this type.',
  fontFamily:
    'write the stack as an array with one family name per element, as in ["system-ui", "Segoe UI", "sans-serif"], and leave a single family as a bare string. Detecting a draft-shaped fontFamily by its comma is a HEURISTIC and not a shape rule: a bare string is a lawful single family name under 2025.10, so a comma is the only signal that a value naming five families means five, and a family name that genuinely contains a comma is caught here in error.',
  fontWeight:
    'drop the quotes and write the weight as a JSON number from 1 to 1000, as in 400. The format\'s own weight keywords ("bold", "light", "semi-bold" and the rest) stay quoted strings and are accepted as they are.',
  number: 'drop the quotes and write the value as a JSON number, as in 14 rather than "14".',
  shadow:
    'give each layer typed sub-fields: "offsetX", "offsetY", "blur" and "spread" each become an object carrying a numeric "value" and a "unit", "color" becomes an object carrying a "colorSpace" and a "components" array, and "spread" is required on every layer rather than omitted when it is zero.',
}

/**
One node the reader found written in the pre-stable draft shape.
 */
export interface DraftShapedNode {
  readonly conversion: string
  readonly path: string
  readonly type: string
  readonly value: unknown
}

/**
 * Whether one shadow layer is draft-shaped: a string sub-field where 2025.10 writes a typed
 * object, or a missing `spread`, which 2025.10 requires on every layer.
 */
function isDraftShadowLayer(layer: unknown): boolean {
  if (!isPlainObject(layer)) return false
  if (!('spread' in layer)) return true
  return ['blur', 'color', 'offsetX', 'offsetY', 'spread'].some(
    (field) => typeof layer[field] === 'string',
  )
}

/**
 * Whether `value` is written in the pre-stable draft shape for `type`. Decidable per `$type`
 * and stated as a rule rather than left to a reading: an object where the draft wrote a string
 * is the 2025.10 form, an alias is lawful under both, and everything below names what the
 * draft specifically did.
 */
/**
 * The four types the draft wrote as a bare string where 2025.10 writes something else: an
 * object for `dimension` and `duration`, a JSON number for `number` and `fontWeight`. Grouped
 * because the TEST is one test; what differs per type is the conversion, and that lives with
 * the conversions.
 */
const DRAFT_WROTE_A_STRING = new Set(['dimension', 'duration', 'fontWeight', 'number'])

/**
 *
 */
function isDraftShaped(type: string, value: unknown): boolean {
  if (isAlias(value)) return false
  if (type === 'shadow') {
    return Array.isArray(value)
      ? value.some((entry) => isDraftShadowLayer(entry))
      : isDraftShadowLayer(value)
  }
  if (typeof value !== 'string') return false
  // A comma is the only signal a `fontFamily` string names more than one family, and a bare
  // string naming ONE family is lawful under 2025.10, so this one is a heuristic and the
  // refusal message says so.
  if (type === 'fontFamily') return value.includes(',')
  // The format's own weight keywords are lawful strings, so `"bold"` passes and `"400"` does not.
  if (type === 'fontWeight') return !FONT_WEIGHT_KEYWORDS.has(value)
  return DRAFT_WROTE_A_STRING.has(type)
}

/**
 * The draft-shaped node `type`/`value` describes, or `undefined` when the value is one this
 * reader accepts. `path` rides along so the caller can collect findings without a second walk.
 */
export function classifyDraftShape(
  path: string,
  type: string,
  value: unknown,
): DraftShapedNode | undefined {
  if (!isDraftShaped(type, value)) return undefined
  return { conversion: CONVERSIONS[type] ?? CONVERSIONS.dimension!, path, type, value }
}

/**
 * The refusal for a `$type` this reader does not read. Two grounds, and the message carries
 * the difference: a STRUCTURAL refusal names why the type has no single CSS value and offers
 * no way back, a SCOPE refusal says the type is cheap and unasked-for and names its trigger.
 * A type the format does not define at all is neither, and says so.
 */
export function refuseTypeReason(type: string, path: string): string | undefined {
  const structural = STRUCTURAL_REFUSALS.get(type)
  if (structural !== undefined) {
    return `${READER} "$type": "${type}" at "${path}" is not read by this package, on a structural ground: ${structural}, and this pipeline emits one custom property per token. ${SPEC_POINTER}`
  }
  if (SCOPE_REFUSALS.has(type)) {
    return `${READER} "$type": "${type}" at "${path}" is not read at 0.1.0, on a scope ground rather than a structural one: it renders cleanly and is cheap to add, and no consumer has asked for it. ${SCOPE_RETURN_TRIGGER} ${SPEC_POINTER}`
  }
  if (!ACCEPTED_TYPES.has(type)) {
    return `${READER} "$type": "${type}" at "${path}" is not a type the ${SPEC_NAME} defines. ${SPEC_POINTER}`
  }
  return undefined
}

/**
What a refusal calls the source when the caller could not name a file for it.
 */
const ANONYMOUS_SOURCE = 'the token source read by this build'

/**
 * What a refusal calls `sourceName`: quoted when the caller named a file (a `--source`
 * consumer may hold several, so a node path alone would not say which), the anonymous form
 * otherwise. Shared with `dtcg-malformed.ts`'s own section, so the two refer to the same file
 * the same way when a run reports both.
 */
export function sourceWhere(sourceName: string | undefined): string {
  return sourceName === undefined ? ANONYMOUS_SOURCE : `"${sourceName}"`
}

/**
 * The draft-shaped-nodes SECTION of the whole refusal: says what the file IS rather than that
 * it is broken, carries each node's own `$value` and its own conversion. No trailing
 * specification pointer — `reader.ts` combines this with `dtcg-malformed.ts`'s own section, if
 * any, and appends `SPEC_POINTER` once for the combined message.
 */
export function formatDraftSection(
  drafts: readonly DraftShapedNode[],
  sourceName: string | undefined,
): string {
  const where = sourceWhere(sourceName)
  const count = drafts.length === 1 ? '1 node' : `${drafts.length} nodes`
  const lines = drafts.map(
    (node) =>
      `  - "${node.path}" ($type "${node.type}"), $value ${JSON.stringify(node.value)}\n` +
      `      To convert it: ${node.conversion}`,
  )
  return [
    `${READER} ${count} in ${where} ${drafts.length === 1 ? 'is' : 'are'} written in the pre-stable draft shape of the Design Tokens Format Module. That is an earlier revision of this same format, not a broken file, and this reader reads 2025.10 only. Each node below carries the edit that brings it up to date.`,
    '',
    ...lines,
  ].join('\n')
}
