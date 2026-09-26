import strictValue from 'stylelint-declaration-strict-value'

/**
 * Nave's own stylelint rules, corrected for a consumer's project: `@nave` known to the
 * language, tokens-only values against `--nave-*`, and the outline focus guard.
 *
 * Everything here is a rendering of Nave's design-system constraints, never a copy of any
 * shared config: this package extends nothing and declares `stylelint` as a peer, never a
 * dependency, per Stylelint's own guidance for shareable configs.
 */

// The five CSS-wide keywords are valid on every property in CSS and therefore pass on every
// entry below. Kept as one regex fragment so every entry admits them the same way.
const CSS_WIDE_KEYWORDS_SOURCE = 'inherit|initial|unset|revert|revert-layer'

/**
 * A value "consumes a var()" when a var(--...) reference appears anywhere inside it: the plugin
 * has no per-argument view into a function call, so a function admitting one var() reference
 * anywhere admits the whole value, literal siblings included (`light-dark(#fff, var(--x))`
 * passes; documented as a stated limitation in this package's README). Matches a call to
 * `var()` itself whose first argument is a custom property name (the two-dash prefix), with
 * any whitespace after the opening parenthesis (`var( --x )`). The lookbehind keeps a function
 * whose name merely ends in `var` (`somevar(--x)`) from counting as one.
 */
const CONSUMES_VAR_SOURCE = String.raw`(?<![\w-])var\(\s*--`

// Source: CSS Color Module Level 4 (W3C) §6.2's current system-colour keyword list,
// transcribed from the specification and never read from the plugin. Whole-value,
// case-insensitive admission on the colour entry, fill, stroke and the
// accent-color/caret-color/scrollbar-color entry. The deprecated keywords of that
// specification's Appendix A are deliberately NOT here, and stay reported.
const SYSTEM_COLOR_KEYWORDS = [
  'AccentColor',
  'AccentColorText',
  'ActiveText',
  'ButtonBorder',
  'ButtonFace',
  'ButtonText',
  'Canvas',
  'CanvasText',
  'Field',
  'FieldText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'LinkText',
  'Mark',
  'MarkText',
  'SelectedItem',
  'SelectedItemText',
  'VisitedText',
]

const SYSTEM_COLOR_KEYWORDS_SOURCE = SYSTEM_COLOR_KEYWORDS.join('|')

/**
 * Builds an `ignoreValues` regex string admitting: the CSS-wide keywords and `extra`
 * (already-escaped regex alternatives), matched against the WHOLE value, case-insensitive; OR,
 * separately and never anchored, any value that consumes a var() ANYWHERE inside it. The two
 * halves cannot share one `^...$` anchor: a keyword must match the whole value exactly (so
 * "mytransparent" is not "transparent"), while a var() reference inside a function
 * (`light-dark(#fff, var(--x))`) must match as a SUBSTRING, because the plugin has no
 * per-argument view into the function and a value with one var() reference passes whole,
 * literal siblings included (a stated limitation, carried into this package's README).
 */
function admit(...extra) {
  const exactAlternatives = [CSS_WIDE_KEYWORDS_SOURCE, ...extra]
  return `/^(?:${exactAlternatives.join('|')})$|${CONSUMES_VAR_SOURCE}/i`
}

// The colour-valued keyword set shared by `color`, every `*-color` property (except
// accent-color/caret-color/scrollbar-color, which get their own entry below) and, with `auto`
// added, that separate entry. `none` is deliberately absent: it is invalid CSS on a colour
// property, and the properties it used to guard elsewhere (color-scheme, forced-color-adjust,
// print-color-adjust) are not checked by this package at all.
const COLOR_VALUE_PATTERN = admit(
  'transparent',
  'currentcolor',
  SYSTEM_COLOR_KEYWORDS_SOURCE,
  String.raw`url\(.*\)`,
  String.raw`image-set\(.*\)`,
)

// The colour entry itself: `color`, and every property ending `-color` EXCEPT
// accent-color/caret-color/scrollbar-color (their own entry below, admitting `auto` too) and
// border-color and its four physical longhands (their own entry below). A regex (not an
// enumerated list) so a future `-color` property is covered by construction.
//
// `border-color` is a shorthand the plugin expands (`expandShorthand`) into its four side
// longhands, and it checks every expanded longhand against each entry that matches it. With
// those longhands in this entry and a plain `border-color` entry beside it, `border-color: red`
// is reported twice: once directly, once through the expansion. So the shorthand and its
// longhands share one entry of their own, excluded here, and each colour property is matched
// by exactly one entry.
const COLOR_PROPERTY_PATTERN =
  '/^(?:color|(?!accent-color$|caret-color$|scrollbar-color$|border-(top-|right-|bottom-|left-)?color$)[a-z-]+-color)$/'

// `border-color` and its four physical longhands, one entry sharing the colour allowlist. A
// plain `'border-color'` string would match that exact property name only, leaving the four
// longhands, and the side shorthands (`border-top` and the rest) that expand into them,
// unchecked.
const BORDER_COLOR_PATTERN = '/^border(-(top|right|bottom|left))?-color$/'

const ACCENT_CARET_SCROLLBAR_PATTERN = '/^(?:accent-color|caret-color|scrollbar-color)$/'
const ACCENT_CARET_SCROLLBAR_VALUE_PATTERN = admit(
  'transparent',
  'currentcolor',
  SYSTEM_COLOR_KEYWORDS_SOURCE,
  'auto',
)

// fill/stroke are NOT colour-valued (`none` is a legitimate SVG value for both), so they keep
// `none` and stay outside COLOR_PROPERTY_PATTERN rather than folding into it.
const FILL_STROKE_VALUE_PATTERN = admit(
  'transparent',
  'currentcolor',
  'none',
  SYSTEM_COLOR_KEYWORDS_SOURCE,
)

const FONT_SIZE_VALUE_PATTERN = admit('1em')
const FONT_WEIGHT_VALUE_PATTERN = admit('normal')
const FONT_FAMILY_VALUE_PATTERN = admit()
const LINE_HEIGHT_VALUE_PATTERN = admit('normal')
const LETTER_SPACING_VALUE_PATTERN = admit('normal')
const BORDER_RADIUS_VALUE_PATTERN = admit('0')

// transition-duration and transition-timing-function share ONE property-list entry and ONE
// allowlist (the plugin keys `ignoreValues` by the pattern string itself), because the plugin
// reports once per matching entry and stops at the first failing longhand inside one.
const TRANSITION_PATTERN = '/^transition-(duration|timing-function)$/'
const TRANSITION_VALUE_PATTERN = admit('0ms', '0.01ms')

const ANIMATION_PATTERN = '/^animation-(duration|timing-function)$/'
const ANIMATION_VALUE_PATTERN = admit('0ms', '0.01ms')

const GAP_VALUE_PATTERN = admit('0', 'normal')

const PADDING_PATTERN = '/^padding(-(top|right|bottom|left))?$/'
const PADDING_VALUE_PATTERN = admit('0')

const MARGIN_PATTERN = '/^margin(-(top|right|bottom|left))?$/'
const MARGIN_VALUE_PATTERN = admit('0', '-1px', 'auto')

const Z_INDEX_VALUE_PATTERN = admit('auto', '0')
const OPACITY_VALUE_PATTERN = admit('0', '1')

// box-shadow is not colour-valued: it keeps `none`, and gains `0`/`inset` so a shadow built
// only from tokens (`0 0 0 var(--x) var(--y)`) passes.
const BOX_SHADOW_VALUE_PATTERN = admit('none', '0', 'inset')

/**
 * The strict-value rule's options: one property-list entry per family, so no property is
 * matched by more than one entry, and each value is checked against ((a') semantics): a var(),
 * a function consuming one, or an admitted keyword, whole-value.
 */
const STRICT_VALUE_OPTIONS = {
  expandShorthand: true,
  disableFix: true,
  ignoreFunctions: false,
  ignoreValues: {
    [COLOR_PROPERTY_PATTERN]: COLOR_VALUE_PATTERN,
    [BORDER_COLOR_PATTERN]: COLOR_VALUE_PATTERN,
    [ACCENT_CARET_SCROLLBAR_PATTERN]: ACCENT_CARET_SCROLLBAR_VALUE_PATTERN,
    fill: FILL_STROKE_VALUE_PATTERN,
    stroke: FILL_STROKE_VALUE_PATTERN,
    'font-size': FONT_SIZE_VALUE_PATTERN,
    'font-weight': FONT_WEIGHT_VALUE_PATTERN,
    'font-family': FONT_FAMILY_VALUE_PATTERN,
    'line-height': LINE_HEIGHT_VALUE_PATTERN,
    'letter-spacing': LETTER_SPACING_VALUE_PATTERN,
    'border-radius': BORDER_RADIUS_VALUE_PATTERN,
    [TRANSITION_PATTERN]: TRANSITION_VALUE_PATTERN,
    [ANIMATION_PATTERN]: ANIMATION_VALUE_PATTERN,
    gap: GAP_VALUE_PATTERN,
    [PADDING_PATTERN]: PADDING_VALUE_PATTERN,
    [MARGIN_PATTERN]: MARGIN_VALUE_PATTERN,
    'z-index': Z_INDEX_VALUE_PATTERN,
    opacity: OPACITY_VALUE_PATTERN,
    'box-shadow': BOX_SHADOW_VALUE_PATTERN,
  },
  message:
    'Expected a variable, a function consuming one, or an admitted keyword for "${property}": ' +
    '"${value}". This rule does not check whether the variable is declared, only that one is used.',
}

const STRICT_VALUE_PROPERTIES = [
  COLOR_PROPERTY_PATTERN,
  BORDER_COLOR_PATTERN,
  ACCENT_CARET_SCROLLBAR_PATTERN,
  'fill',
  'stroke',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'letter-spacing',
  'border-radius',
  TRANSITION_PATTERN,
  ANIMATION_PATTERN,
  'gap',
  PADDING_PATTERN,
  MARGIN_PATTERN,
  'z-index',
  'opacity',
  'box-shadow',
]

/**
 * The `outline: none` / `outline: 0` guard, shipped in the default export after the
 * maintainer's accessibility review of exactly this bytes-and-conditions shape (see this
 * package's README for the opt-out). The pattern is exported separately so a root-level
 * consuming module can read it rather than copy it, and can throw if this export ever
 * disappears.
 */
export const OUTLINE_GUARD_PATTERN = ['/^(none|0)$/i']

/**
 * Transcribed verbatim from the cleared consumer-facing wording, never reworded: 444 bytes,
 * ASCII, sha256 prefix `6fa2f3c5590d13b4`. This message speaks to the consumer's own project
 * and describes the rule by what it flags, not by the outcome it protects.
 */
export const OUTLINE_GUARD_CONSUMER_MESSAGE =
  "'outline: none' and 'outline: 0' remove the browser's default focus indicator, the visible " +
  'sign of which element has focus, wherever this rule applies. Remove the declaration, or ' +
  "change the outline's colour, width or offset instead. If you are replacing it with an " +
  'indicator of your own, disable this rule for that declaration with a comment saying what ' +
  'replaces it. An indicator drawn only with box-shadow is not painted in forced-colors mode.'

/**
 * The default export: `@nave` known to the language, tokens-only values, and the outline
 * guard. Extends no shared config: no `selector-class-pattern`, `custom-property-pattern`,
 * `order/properties-alphabetical-order`, `declaration-no-important` or the two performance
 * plugins, and no opt-in house-style export.
 */
const config = {
  languageOptions: {
    syntax: {
      atRules: {
        nave: { prelude: '<custom-ident>+' },
      },
    },
  },
  plugins: [strictValue],
  rules: {
    'scale-unlimited/declaration-strict-value': [STRICT_VALUE_PROPERTIES, STRICT_VALUE_OPTIONS],
    'declaration-property-value-disallowed-list': [
      { outline: OUTLINE_GUARD_PATTERN },
      { message: OUTLINE_GUARD_CONSUMER_MESSAGE },
    ],
  },
}

export default config
