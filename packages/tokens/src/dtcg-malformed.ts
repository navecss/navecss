/**
 * A node the input contract found neither in the accepted 2025.10 shape nor in the pre-stable
 * draft shape for its own `$type`: an object missing a required field, a value of the wrong JS
 * type, and so on. `dtcg-shape.ts` owns the draft-shaped class and the `$type`-acceptance
 * rules; this module owns the other way a node can be unreadable.
 *
 * **Collected, not thrown on eagerly.** Before this module existed, a node in this class fell
 * through the input contract's shape pass untouched and reached `composite-value.ts`'s
 * renderer, which threw on the first one it met — one migration into one build cycle per node,
 * exactly the cost `dtcg-shape.ts` already avoids for the draft-shaped class. `reader.ts`
 * collects both classes in the same walk and reports them together.
 *
 * **No fabricated fix, but a real diagnosis.** `dtcg-shape.ts`'s `CONVERSIONS` assumes a
 * draft-shaped starting point and says what act turns it into 2025.10; a malformed node did
 * not necessarily come from one, and can be wrong in more than one way, so there is no single
 * corrective act to name. What this module states instead is two things that answer different
 * questions: the REASON this particular value was refused, where the renderer named one
 * (`unreadableValueReason`'s own message, EMBEDDED — its shared prefix and any `at "<path>"`
 * fragment stripped, since this entry's own path line already carries that), and the shape its
 * own `$type` accepts in general, as a plain fact — never an instruction, and never the OTHER
 * class's label either.
 */

import type { DraftShapedNode } from './dtcg-shape.ts'

import { unreadableValueReason } from './composite-value.ts'
import { formatDraftSection, isAlias, READER, sourceWhere, SPEC_POINTER } from './dtcg-shape.ts'

/**
 * The shape each accepted `$type` requires, stated as a fact about what IS accepted rather
 * than as an act on a value already in hand.
 */
const ACCEPTED_SHAPES: Record<string, string> = {
  color:
    'a "color" value is a CSS colour string, or an object carrying a "colorSpace" and a "components" array (an "alpha" number is optional).',
  cubicBezier:
    'a "cubicBezier" value is a 4-element numeric array [x1, y1, x2, y2], with x1 and x2 each within [0, 1].',
  dimension:
    'a "dimension" value is an object carrying a numeric "value" and a "unit"; this package accepts "px", "rem" and "em".',
  duration:
    'a "duration" value is an object carrying a numeric "value" and a "unit"; the format defines "ms" and "s".',
  fontFamily:
    'a "fontFamily" value is an array of family-name strings, or a single family name written as a bare string.',
  fontWeight:
    'a "fontWeight" value is a JSON number, or one of the format\'s own weight keywords ("bold", "light", "semi-bold" and the rest) written as a string.',
  number: 'a "number" value is a JSON number.',
  shadow:
    'a "shadow" value is one layer object, or an array of layer objects, each carrying "offsetX", "offsetY" and "blur" as {value, unit} objects, "spread" as a {value, unit} object required on every layer, and "color" as a {colorSpace, components, alpha?} object.',
}

/**
One node the input contract found malformed for its own `$type`.
 */
export interface MalformedNode {
  readonly path: string
  readonly reason: string | undefined
  readonly shape: string
  readonly type: string
  readonly value: unknown
}

/**
 * The prefix every `composite-value.ts` throw carries. Stripped when an entry embeds the
 * message: the section this entry sits under already supplies it as its own heading, so
 * repeating it per node would stutter.
 */
const REASON_PREFIX = `${READER} `

/**
 * The ` at "<path>"` fragment `composite-value.ts`'s untargeted fallback throw carries. The
 * probe that produces `raw` always calls with an empty path (a malformed node is checked as a
 * whole value, never at a sub-path), so this fragment is either redundant with the entry's own
 * path line above it or, worse, visibly empty (`at ""`). Stripped either way.
 */
const AT_FRAGMENT_RE = / at "[^"]*"/

/**
 * The untargeted fallback's own opening words, once the prefix above is gone. Naming this
 * lets the embedding recognise "there is no real diagnosis here" without re-deriving it from
 * `composite-value.ts`'s own throw sites.
 */
const NO_DIAGNOSIS_PREFIX = 'unreadable value'

/**
 * `raw` (an `unreadableValueReason` message) as an entry embeds it: the shared reader prefix
 * and any `at "<path>"` fragment stripped, since the section heading and the entry's own path
 * line already carry that information. `undefined` when what remains is the untargeted
 * fallback, which names nothing the entry's own `$value` dump has not already shown — a line
 * that says nothing is worse than no line, because a reader has to read it to learn that.
 *
 * These transforms are about HOW an already-thrown message is embedded in a list, never about
 * what `composite-value.ts` says when it throws alone: that shape is right for a standalone
 * throw and stays exactly as it is.
 */
function embeddedReason(raw: string): string | undefined {
  const withoutPrefix = raw.startsWith(REASON_PREFIX) ? raw.slice(REASON_PREFIX.length) : raw
  const text = withoutPrefix.replace(AT_FRAGMENT_RE, '')
  return text.startsWith(NO_DIAGNOSIS_PREFIX) ? undefined : text
}

/**
 * The malformed node `type`/`value` describes, or `undefined` when the value is either one
 * this reader accepts or a whole-value `{a.b.c}` alias (a reference, not a literal value to
 * shape-check — resolved and, at that point, checked against ITS OWN token's shape instead).
 * Callers run this only once `dtcg-shape.ts`'s own draft-shape check has already said no: a
 * value nameable as the pre-stable draft shape is reported as that, never as merely malformed.
 * `reason` carries `unreadableValueReason`'s own diagnosis, embedded (see `embeddedReason`), so
 * the entry keeps the specific sub-field and value at fault where the renderer named one —
 * `undefined` where it did not, so "Its own $type accepts" stands alone rather than beside a
 * line that repeats the `$value` dump in different words.
 */
export function classifyMalformed(
  path: string,
  type: string,
  value: unknown,
): MalformedNode | undefined {
  if (isAlias(value)) return undefined
  const raw = unreadableValueReason(type, value)
  if (raw === undefined) return undefined
  return {
    path,
    reason: embeddedReason(raw),
    shape: ACCEPTED_SHAPES[type] ?? ACCEPTED_SHAPES.dimension!,
    type,
    value,
  }
}

/**
 * The malformed-nodes SECTION of the whole refusal. No trailing specification pointer —
 * `reader.ts` combines this with `dtcg-shape.ts`'s own draft-shaped section, if any, and
 * appends `SPEC_POINTER` once for the combined message. Each entry carries the shape its
 * `$type` accepts in general, plus — where the renderer named one — the specific reason THIS
 * value was refused: the first answers "what would be right", the second "what is wrong here",
 * and neither substitutes for the other.
 */
function formatMalformedSection(
  nodes: readonly MalformedNode[],
  sourceName: string | undefined,
): string {
  const where = sourceWhere(sourceName)
  const count = nodes.length === 1 ? '1 node' : `${nodes.length} nodes`
  const lines = nodes.map((node) => {
    const reasonLine = node.reason === undefined ? '' : `\n      ${node.reason}`
    return (
      `  - "${node.path}" ($type "${node.type}"), $value ${JSON.stringify(node.value)}` +
      `${reasonLine}\n` +
      `      Its own $type accepts: ${node.shape}`
    )
  })
  return [
    `${READER} ${count} in ${where} ${nodes.length === 1 ? 'is' : 'are'} written in neither the accepted 2025.10 shape nor that earlier, pre-stable revision of the format, for their own $type. Each node below is followed by the shape its own $type accepts; there is no single corrective act to name here, because a malformed value can be wrong in more than one way.`,
    '',
    ...lines,
  ].join('\n')
}

/**
 * The combined refusal `reader.ts` throws for every draft-shaped and malformed node found in
 * one pass — one section per class, so the two stay distinguishable, `SPEC_POINTER` shared and
 * appended once rather than once per class.
 */
export function formatUnreadableNodesRefusal(
  drafts: readonly DraftShapedNode[],
  malformed: readonly MalformedNode[],
  sourceName: string | undefined,
): string {
  const sections = [
    ...(drafts.length > 0 ? [formatDraftSection(drafts, sourceName)] : []),
    ...(malformed.length > 0 ? [formatMalformedSection(malformed, sourceName)] : []),
  ]
  return [...sections, SPEC_POINTER].join('\n\n')
}
