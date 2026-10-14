/**
 * The names of Nave's built-in atoms, and the class each one gets.
 *
 * cx() needs this and nothing else, so it lives apart from the declaration data in atoms.ts:
 * a module that imports atoms.ts carries every atom's CSS declarations into a consumer's
 * bundle, and cx() would pay that for a name map.
 *
 * atoms.ts is checked against this list (`satisfies Record<AtomName, AtomDefinition>`), so
 * an atom added there and missing here, or the other way round, fails the typecheck. The
 * order matters too: it is the order atomic.css is written in, and test/cx.test.ts holds the
 * two together.
 */
export const atomNames = [
  'flex',
  'inlineFlex',
  'grid',
  'block',
  'inlineBlock',
  'hidden',
  'flexCol',
  'flexWrap',
  'itemsCenter',
  'itemsStart',
  'itemsEnd',
  'justifyCenter',
  'justifyBetween',
  'justifyEnd',
  'flexGrow',
  'flexShrink0',
  'gap',
  'relative',
  'absolute',
  'insetFull',
  'wFull',
  'hFull',
  'minW0',
  'truncate',
  'srOnly',
  'srOnlyFocusable',
  'noWrap',
  'breakWord',
  'textLeft',
  'textCenter',
  'textRight',
  'interactive',
  'focusRing',
  'disabledState',
  'rounded',
  'roundedCard',
  'roundedFull',
  'border',
  'overflowHidden',
  'overflowAuto',
  'transition',
  'container',
  'hidePhoneOnly',
  'hideTabletPortraitUp',
  'hideTabletLandscapeUp',
  'hideDesktopUp',
  'stackPhoneOnly',
  'wFullPhoneOnly',
] as const

export type AtomName = (typeof atomNames)[number]

/**
 * Converts a camelCase atom name to its nave-kebab-case CSS class name.
 * focusRing → nave-focus-ring
 */
export const toClassName = (name: AtomName): string =>
  `nave-${name.replaceAll(/([A-Z])/g, '-$1').toLowerCase()}`

/**
 * Map of atom name → global CSS class name.
 * Used by cx() and the directive core's diagnostic hints.
 * Only covers Nave built-in atoms — consumer atoms are @nave-directive only.
 */
export const atomClassMap = Object.fromEntries(
  atomNames.map((name) => [name, toClassName(name)]),
) as Record<AtomName, string>
