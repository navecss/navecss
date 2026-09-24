/**
 * Nave breakpoints — generated from tokens.json
 * Do not edit directly. Run `pnpm build` in packages/tokens to regenerate.
 *
 * breakpoints — raw px boundary values (number, no unit)
 *   These are the design decisions. Edit tokens.json to change them.
 *
 * em — boundary values in em units (base: 16px)
 *   For reference. The media strings below use these values.
 *
 * media — pre-built Level 4 media query condition strings
 *   Use as @media keys in atoms.ts and consumer atoms.
 *   Never write breakpoint values as magic numbers in your codebase.
 *
 * Syntax: Level 4 range queries — (width < Xem) / (width >= Xem)
 *   phoneOnly and tabletPortraitUp share the same boundary value (37.5em).
 *   < is exclusive upper bound, >= is inclusive lower bound.
 *   No overlap, no gap, no rounding issues at any device pixel ratio.
 *
 * Why em: resolves against the browser's default font size, a user setting
 *   (not page zoom, which scales px and em alike).
 */

export const breakpoints = {
  tabletPortrait: 600,
  tabletLandscape: 900,
  desktop: 1200,
  wide: 1800
}

export const em = {
  tabletPortrait: '37.5em',
  tabletLandscape: '56.25em',
  desktop: '75em',
  wide: '112.5em'
}

export const media = {
  phoneOnly: '(width < 37.5em)',
  tabletPortraitUp: '(width >= 37.5em)',
  tabletLandscapeUp: '(width >= 56.25em)',
  desktopUp: '(width >= 75em)',
  wideUp: '(width >= 112.5em)'
}
