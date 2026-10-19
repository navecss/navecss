/**
 * Whether two conjunctions of conditional group rules (the `@media`, `@container` and
 * `@supports` rules around one declaration) can both hold at once. The answer is `false`
 * only when the two are PROVABLY disjoint, and the one proof this reader knows is a `width`
 * or `height` range with an empty intersection, written in `@media` range or legacy
 * `min-`/`max-` syntax, in one unit across everything it compares on that axis. Everything
 * else may overlap: a container or supports rule, a media type, `not`, `or`, a comma list,
 * any other feature, a unit that differs on the axis, and text this reader cannot parse.
 */

export interface ConditionRule {
  readonly name: string
  readonly prelude: string
}

type Axis = 'height' | 'width'
type Operator = '<' | '<=' | '=' | '>' | '>='

interface Bound {
  readonly axis: Axis
  readonly side: 'lower' | 'upper'
  readonly value: number
  readonly unit: string
  readonly isStrict: boolean
}

const LENGTH = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?[a-z]+`
const OPERATOR = '(<=|>=|<|>|=)'
const AXIS = '(width|height)'
const RANGE_FEATURE = new RegExp(
  String.raw`^(?:(${LENGTH})\s*${OPERATOR}\s*)?${AXIS}(?:\s*${OPERATOR}\s*(${LENGTH}))?$`,
)
const LEGACY_FEATURE = new RegExp(String.raw`^(min-|max-)?${AXIS}\s*:\s*(${LENGTH})$`)
const FEATURE_GROUP = /\(([^()]*)\)/g
const FEATURE_CHAIN = /^G(?:\s+and\s+G)*$/
const FLIPPED: Record<Operator, Operator> = { '<': '>', '<=': '>=', '=': '=', '>': '<', '>=': '<=' }
const LEGACY_OPERATORS: Record<string, Operator> = { 'max-': '<=', 'min-': '>=' }
const LENGTH_PARTS = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z]+)$/

/**
 * The bounds the relation `axis operator length` puts on `axis`: one side for an inequality,
 * both sides, inclusive, for `=`. Undefined when `length` is not a number with a unit.
 */
function boundsOf(axis: Axis, operator: Operator, length: string): Bound[] | undefined {
  const parts = LENGTH_PARTS.exec(length)
  if (!parts) return undefined
  const value = Number(parts[1])
  const unit = parts[2]!
  const isStrict = operator === '<' || operator === '>'
  const lower: Bound = { axis, side: 'lower', value, unit, isStrict }
  const upper: Bound = { axis, side: 'upper', value, unit, isStrict }
  if (operator === '=') return [lower, upper]
  return operator === '>' || operator === '>=' ? [lower] : [upper]
}

/**
 * The bounds of one legacy `(min-width: x)`, `(max-height: x)` or `(width: x)` feature; the
 * prefixed forms are inclusive.
 */
function legacyBounds(content: string): Bound[] | undefined {
  const match = LEGACY_FEATURE.exec(content)
  if (!match) return undefined
  return boundsOf(match[2] as Axis, LEGACY_OPERATORS[match[1] ?? ''] ?? '=', match[3]!)
}

/**
 * Whether `operator` bounds the feature from above (`<`, `<=`).
 */
function isUp(operator: string): boolean {
  return operator === '<' || operator === '<='
}

/**
 * Whether `operator` bounds the feature from below (`>`, `>=`).
 */
function isDown(operator: string): boolean {
  return operator === '>' || operator === '>='
}

/**
 * Whether the operators of a range feature (`width >= x`, `x < width <= y`) form a legal
 * relation: at least one, and when there are two they point the same way.
 */
function isLegalRelation(left: string | undefined, right: string | undefined): boolean {
  if (!left && !right) return false
  if (!left || !right) return true
  return (isUp(left) && isUp(right)) || (isDown(left) && isDown(right))
}

/**
 * The bounds of one range-syntax feature: `width >= x`, `x <= width`, or the double range
 * `x < width <= y`. Undefined for a boolean-context `(width)` or a mixed-direction double.
 */
function rangeBounds(content: string): Bound[] | undefined {
  const match = RANGE_FEATURE.exec(content)
  if (!match) return undefined
  const [, leftLength, leftOperator, axis, rightOperator, rightLength] = match
  if (!isLegalRelation(leftOperator, rightOperator)) return undefined
  const left = leftOperator
    ? boundsOf(axis as Axis, FLIPPED[leftOperator as Operator], leftLength!)
    : []
  const right = rightOperator ? boundsOf(axis as Axis, rightOperator as Operator, rightLength!) : []
  return left && right ? [...left, ...right] : undefined
}

/**
 * The bounds of one parenthesised feature's text, in either syntax.
 */
function featureBounds(content: string): Bound[] | undefined {
  const text = content.trim()
  return text.includes(':') ? legacyBounds(text) : rangeBounds(text)
}

/**
 * The width and height bounds of a `@media` prelude made only of `(width ...)`/`(height ...)`
 * features joined by `and`; undefined for anything else (a media type, `not`, `or`, a comma
 * list, another feature, nested parentheses), so the whole rule then constrains nothing.
 */
function mediaBounds(prelude: string): Bound[] | undefined {
  const text = prelude
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .toLowerCase()
    .trim()
  const contents = text
    .matchAll(FEATURE_GROUP)
    .map((match) => match[1]!)
    .toArray()
  if (!FEATURE_CHAIN.test(text.replaceAll(FEATURE_GROUP, 'G'))) return undefined
  const bounds: Bound[] = []
  for (const content of contents) {
    const found = featureBounds(content)
    if (!found) return undefined
    bounds.push(...found)
  }
  return bounds
}

/**
 * The bounds read from a conjunction, kept for as long as the conjunction (the array a block or a
 * declaration holds) lives: one conjunction is compared with many others, and reading its text
 * once is the difference between a check that scales with the pairs and one that pays a parse
 * for each of them.
 */
const BOUNDS_OF = new WeakMap<readonly ConditionRule[], readonly Bound[]>()

/**
 * Every bound the `@media` rules of the given conjunctions put on any axis.
 */
function collectBounds(rules: readonly ConditionRule[]): readonly Bound[] {
  const known = BOUNDS_OF.get(rules)
  if (known !== undefined) return known
  const bounds = rules.flatMap((rule) =>
    rule.name === 'media' ? (mediaBounds(rule.prelude) ?? []) : [],
  )
  BOUNDS_OF.set(rules, bounds)
  return bounds
}

/**
 * Whether `candidate` is a tighter bound than `current` on its own side: a larger lower or a
 * smaller upper, or the same value made strict.
 */
function isTighter(candidate: Bound, current: Bound | undefined): boolean {
  if (!current) return true
  if (candidate.value === current.value) return candidate.isStrict && !current.isStrict
  return candidate.side === 'lower'
    ? candidate.value > current.value
    : candidate.value < current.value
}

/**
 * The tightest lower and upper bound among `bounds`.
 */
function tightest(bounds: readonly Bound[]): {
  lower: Bound | undefined
  upper: Bound | undefined
} {
  let lower: Bound | undefined
  let upper: Bound | undefined
  for (const bound of bounds) {
    if (bound.side === 'lower' && isTighter(bound, lower)) lower = bound
    if (bound.side === 'upper' && isTighter(bound, upper)) upper = bound
  }
  return { lower, upper }
}

/**
 * Whether the bounds on one axis admit no value: the lower bound is above the upper, or the
 * two meet at a point that either one excludes. False when the axis mixes units.
 */
function isEmptyAxis(bounds: readonly Bound[]): boolean {
  if (new Set(bounds.map((bound) => bound.unit)).size > 1) return false
  const { lower, upper } = tightest(bounds)
  if (!lower || !upper) return false
  if (lower.value !== upper.value) return lower.value > upper.value
  return lower.isStrict || upper.isStrict
}

/**
 * False only when the two conjunctions of group rules provably cannot hold together; true
 * whenever they may overlap or this reader cannot tell. An empty array is "no condition" and
 * overlaps everything.
 */
// eslint-disable-next-line unicorn/consistent-boolean-name -- the name states the proposition the caller asks
export function conditionsMayOverlap(
  a: readonly ConditionRule[],
  b: readonly ConditionRule[],
): boolean {
  const bounds = [...collectBounds(a), ...collectBounds(b)]
  const axes: readonly Axis[] = ['width', 'height']
  return axes.every((axis) => !isEmptyAxis(bounds.filter((bound) => bound.axis === axis)))
}
