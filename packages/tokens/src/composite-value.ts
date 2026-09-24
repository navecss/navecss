/**
 * Rendering a DTCG 2025.10 `$value` to the one CSS value string the rest of the pipeline
 * reads. Every downstream reader of `FlatToken.value` sees a plain string or a number exactly
 * as it always has; only the on-disk source shape changed.
 *
 * **One shape.** The draft-era CSS strings this package used to accept (`"16px"`, a shadow
 * layer's `offsetX: "0"`, `"200ms"`) are refused upstream by `dtcg-shape.ts` and never reach
 * here. What this module renders is 2025.10 and nothing else, which is why none of the
 * functions below carry a string branch beside their object branch.
 *
 * **The `em` deviation is deliberate and is stated wherever a version claim is made.** 2025.10
 * closes `dimension`'s unit set at `px` and `rem`; this package ships three `letterSpacing`
 * tokens in `em`, which is the correct unit for tracking (it resolves against the element's
 * own font size, which is the behaviour the value is chosen for) and is lawful CSS. What is
 * being deviated from is the token FORMAT, not the platform, and the cost is real: a strict
 * third-party reader rejects those three.
 */

/**
Whether `value` is a non-array object node, as opposed to a primitive or an array.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The colour spaces CSS reaches through its `color()` function. Rendering these means naming
 * the space inside `color()`; the rest of the Color Module's spaces have functions of their
 * own and are rendered by `FUNCTION_SPACES` below.
 */
const COLOR_FUNCTION_SPACES = new Set([
  'a98-rgb',
  'display-p3',
  'prophoto-rgb',
  'rec2020',
  'srgb',
  'srgb-linear',
  'xyz',
  'xyz-d50',
  'xyz-d65',
])

/**
 * The Color Module's remaining spaces, each rendered through the CSS function of the same
 * name. `hsl` and `hwb` carry percentage components where the others carry plain numbers, so
 * the suffix per component position is part of the mapping rather than a special case in the
 * renderer.
 */
const FUNCTION_SPACES = new Map<string, readonly string[]>([
  ['hsl', ['', '%', '%']],
  ['hwb', ['', '%', '%']],
  ['lab', ['', '', '']],
  ['lch', ['', '', '']],
  ['oklab', ['', '', '']],
  ['oklch', ['', '', '']],
])

/**
 * `dimension` and `duration`'s unit sets. `dimension` carries `em` beyond 2025.10's own closed
 * set, as the module docblock states and as `tokens.json` states in its own bytes; `duration`
 * is the format's set exactly, there being nothing this package ships that needs more.
 */
const DIMENSION_UNITS = new Set(['em', 'px', 'rem'])
const DURATION_UNITS = new Set(['ms', 's'])

interface ColorObject extends Record<string, unknown> {
  readonly alpha?: number
  readonly colorSpace: string
  readonly components: readonly number[]
}

/**
 * Whether `raw` is a well-formed 2025.10 colour object. Split out of `renderColor` so that
 * function's own branch count stays within this repo's complexity budget.
 */
function isColorObject(raw: Record<string, unknown>): raw is ColorObject {
  const { colorSpace, components, alpha } = raw
  if (typeof colorSpace !== 'string') return false
  if (!Array.isArray(components) || components.length !== 3) return false
  if (components.some((c) => typeof c !== 'number' || !Number.isFinite(c))) return false
  return alpha === undefined || (typeof alpha === 'number' && Number.isFinite(alpha))
}

/**
 * A 2025.10 `{value, unit}` object, rendered `${value}${unit}`. A well-formed object naming a
 * unit outside the closed set is refused BY NAME rather than rendered: an object shape checked
 * for shape and not for unit would still let `1banana` or `1px; color: red` reach `tokens.css`.
 * `field` names which sub-field failed, since a shadow layer calls this once per sub-field and
 * a bare "dimension value" message would not say which one.
 */
function renderMeasure(
  raw: unknown,
  field: string,
  units: ReadonlySet<string>,
  kind: string,
): string {
  if (isPlainObject(raw)) {
    const { value, unit } = raw
    if (typeof value === 'number' && typeof unit === 'string' && Number.isFinite(value)) {
      if (!units.has(unit)) {
        throw new TypeError(
          `DTCG 2025.10 reader: ${kind} "${field}" unit "${unit}" is not one this reader renders; ` +
            `supported: ${[...units].join(', ')}`,
        )
      }
      return `${value}${unit}`
    }
  }
  throw new TypeError(
    `DTCG 2025.10 reader: ${kind} "${field}" must be a {value, unit} object, got ${JSON.stringify(raw)}`,
  )
}

/**
A whole `dimension` `$value`.
 */
function renderDimension(raw: unknown, field = 'value'): string {
  return renderMeasure(raw, field, DIMENSION_UNITS, 'dimension')
}

/**
A whole `duration` `$value`.
 */
function renderDuration(raw: unknown): string {
  return renderMeasure(raw, 'value', DURATION_UNITS, 'duration')
}

/**
 * A 2025.10 `{colorSpace, components, alpha?}` object, rendered through whichever CSS colour
 * function reaches that space. A space the Color Module does not define is refused by name,
 * never mis-rendered as a neighbouring one.
 */
function renderColor(raw: unknown, field = 'color'): string {
  if (isPlainObject(raw) && isColorObject(raw)) {
    const { colorSpace, components, alpha } = raw
    const alphaSuffix = alpha === undefined ? '' : ` / ${alpha}`
    const suffixes = FUNCTION_SPACES.get(colorSpace)
    if (suffixes !== undefined) {
      const channels = components.map((c, index) => `${c}${suffixes[index] ?? ''}`).join(' ')
      return `${colorSpace}(${channels}${alphaSuffix})`
    }
    if (COLOR_FUNCTION_SPACES.has(colorSpace)) {
      return `color(${colorSpace} ${components.join(' ')}${alphaSuffix})`
    }
    throw new TypeError(
      `DTCG 2025.10 reader: "${field}" colorSpace "${colorSpace}" is not one this reader renders; ` +
        `supported: ${[...FUNCTION_SPACES.keys(), ...COLOR_FUNCTION_SPACES].toSorted((a, b) => a.localeCompare(b)).join(', ')}`,
    )
  }
  throw new TypeError(
    `DTCG 2025.10 reader: "${field}" must be a {colorSpace, components, alpha?} object, got ${JSON.stringify(raw)}`,
  )
}

/**
 * A family name needs no quotes when it is a CSS identifier sequence; anything with a space or
 * another non-identifier character does. SINGLE quotes, because that is what the checked-in
 * CSS contract carries and a quoting change would move three lines nobody asked to move.
 */
const BARE_FAMILY_RE = /^-?[A-Za-z_][\w-]*$/

/**
 * `fontFamily`'s `$value` is an array of family names, or a bare string naming ONE family.
 * Rendered to the CSS `font-family` list.
 */
function renderFontFamily(raw: unknown): string {
  const families = Array.isArray(raw) ? raw : [raw]
  return families
    .map((family) => {
      if (typeof family !== 'string') {
        throw new TypeError(
          `DTCG 2025.10 reader: fontFamily entries must be strings, got ${JSON.stringify(family)}`,
        )
      }
      return BARE_FAMILY_RE.test(family) ? family : `'${family}'`
    })
    .join(', ')
}

/**
 * `offsetX offsetY blur spread color`, the CSS `box-shadow` layer syntax. `spread` is required
 * on every 2025.10 layer, and a zero one is EMITTED rather than dropped: dropping it would be
 * CSS-equivalent but is a convention of this package's own with no basis in the format, and
 * the honest render is what the source says.
 */
function renderShadowLayer(layer: unknown): string {
  if (!isPlainObject(layer)) {
    throw new TypeError(
      `DTCG 2025.10 reader: shadow layer must be a plain object, got ${JSON.stringify(layer)}`,
    )
  }
  return [
    renderDimension(layer.offsetX, 'offsetX'),
    renderDimension(layer.offsetY, 'offsetY'),
    renderDimension(layer.blur, 'blur'),
    renderDimension(layer.spread, 'spread'),
    renderColor(layer.color, 'color'),
  ].join(' ')
}

/**
 * `shadow`'s `$value` is one layer object, or an array of layers (multiple shadows,
 * comma-separated in CSS). An empty array renders `none`: the format has no keyword form for
 * "no shadow", and zero layers is the shape-conformant way to say the same thing. The
 * alternative (one all-zero layer with a transparent colour) renders a different CSS value
 * that interpolates under `transition` where `none` does not.
 */
export function renderShadow(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'none'
    return value.map((layer) => renderShadowLayer(layer)).join(', ')
  }
  return renderShadowLayer(value)
}

/**
 * `cubicBezier`'s `$value` is a 4-element `[x1, y1, x2, y2]` numeric array; renders to the CSS
 * `cubic-bezier()` function form. The x-coordinate bound is CSS's, not the format's:
 * `cubic-bezier()` rejects an x outside `[0, 1]`.
 */
function renderCubicBezier(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError(
      `DTCG 2025.10 reader: cubicBezier value must be a 4-element array, got ${JSON.stringify(value)}`,
    )
  }
  if (!value.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) {
    throw new TypeError(
      `DTCG 2025.10 reader: cubicBezier value must be a 4-element numeric array, got ${JSON.stringify(value)}`,
    )
  }
  const [x1, , x2] = value as [number, number, number, number]
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new TypeError(
      `DTCG 2025.10 reader: cubicBezier x-coordinates (x1, x2) must be within [0, 1] — CSS cubic-bezier() ` +
        `rejects an out-of-range x, got ${JSON.stringify(value)}`,
    )
  }
  return `cubic-bezier(${value.join(', ')})`
}

/**
 * `undefined` when `raw` is a `$value` this reader can render for `type`; otherwise the exact
 * message the renderer below would have thrown, naming what is wrong with THIS value ("unit
 * "banana" is not one this reader renders", not merely "this type has a unit set"). A probe,
 * not a second implementation of the shape rules: `dtcg-malformed.ts`'s per-node diagnosis is
 * this renderer's own words, never a shape check of its own to drift out of step.
 */
export function unreadableValueReason(type: string, raw: unknown): string | undefined {
  try {
    renderTokenValue(type, raw, '')
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Renders one accepted 2025.10 `$value` to its CSS string, or returns it unchanged where the
 * value already IS what CSS carries: a `number`, one of the format's own `fontWeight`
 * keywords, or a colour string.
 *
 * **`color` is the one type whose accepted set is wider than the format's own**, and it is
 * stated here rather than left to be discovered. The input contract refuses a draft-shaped
 * value per `$type` and names `dimension`, `duration`, `number`, `fontWeight`, `shadow` and
 * `fontFamily`; it does not reach `color`, so a CSS colour string under `$type: "color"` is
 * read as the CSS value it is, beside the 2025.10 colour object. That is what lets this
 * package's own relative-colour-syntax slots be expressed at all.
 *
 * `at` is the node path, carried only so an unreadable value names the node the author wrote.
 */
export function renderTokenValue(type: string, raw: unknown, at: string): string | number {
  switch (type) {
    case 'color': {
      return typeof raw === 'string' ? raw : renderColor(raw)
    }
    case 'cubicBezier': {
      return renderCubicBezier(raw)
    }
    case 'dimension': {
      return renderDimension(raw)
    }
    case 'duration': {
      return renderDuration(raw)
    }
    case 'fontFamily': {
      return renderFontFamily(raw)
    }
    case 'shadow': {
      return renderShadow(raw)
    }
    default: {
      if (typeof raw === 'string' || typeof raw === 'number') return raw
      throw new TypeError(
        `DTCG 2025.10 reader: unreadable value at "${at}": ${JSON.stringify(raw)}`,
      )
    }
  }
}
