/* Nave Design System — generated, do not edit */

export declare const breakpoints: {
  readonly tabletPortrait: 600
  readonly tabletLandscape: 900
  readonly desktop: 1200
  readonly wide: 1800
}
export declare type BreakpointName = keyof typeof breakpoints

export declare const em: {
  readonly tabletPortrait: '37.5em'
  readonly tabletLandscape: '56.25em'
  readonly desktop: '75em'
  readonly wide: '112.5em'
}

export declare const media: {
  readonly phoneOnly: '(width < 37.5em)'
  readonly tabletPortraitUp: '(width >= 37.5em)'
  readonly tabletLandscapeUp: '(width >= 56.25em)'
  readonly desktopUp: '(width >= 75em)'
  readonly wideUp: '(width >= 112.5em)'
}
export declare type MediaName = keyof typeof media
