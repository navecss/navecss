/**
 * What the release before native order printed for every input of the first-minor fixtures, from
 * the PostCSS host and, where it differs structurally, from the text expander. Generated once;
 * lives with the migration module and is removed with it. Do not edit by hand.
 *
 * Commit: 256384a7a750f5c9da983823e2b9671c1f292fde
 * Command: git archive 256384a7 packages/core | tar -x -C ../scratch-old (node_modules linked in), then: node packages/core/scripts/generate-migration-old-placement.ts ../scratch-old/packages/core
 */
export interface OldPlacementRow {
  readonly id: string
  readonly postcss: string
  readonly text?: string
}

export const OLD_PLACEMENT_COMMIT = '256384a7a750f5c9da983823e2b9671c1f292fde'

export const OLD_PLACEMENT_COMMAND =
  'git archive 256384a7 packages/core | tar -x -C ../scratch-old (node_modules linked in), then: node packages/core/scripts/generate-migration-old-placement.ts ../scratch-old/packages/core'

export const OLD_PLACEMENT: readonly OldPlacementRow[] = [
  {
    id: 'pair hidePhoneOnly flex',
    postcss: '.x { display: flex; @media (width < 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hidePhoneOnly inlineFlex',
    postcss: '.x { display: inline-flex; @media (width < 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hidePhoneOnly grid',
    postcss: '.x { display: grid; @media (width < 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hidePhoneOnly block',
    postcss: '.x { display: block; @media (width < 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hidePhoneOnly inlineBlock',
    postcss: '.x { display: inline-block; @media (width < 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletPortraitUp flex',
    postcss: '.x { display: flex; @media (width >= 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletPortraitUp inlineFlex',
    postcss: '.x { display: inline-flex; @media (width >= 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletPortraitUp grid',
    postcss: '.x { display: grid; @media (width >= 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletPortraitUp block',
    postcss: '.x { display: block; @media (width >= 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletPortraitUp inlineBlock',
    postcss: '.x { display: inline-block; @media (width >= 37.5em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletLandscapeUp flex',
    postcss: '.x { display: flex; @media (width >= 56.25em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletLandscapeUp inlineFlex',
    postcss: '.x { display: inline-flex; @media (width >= 56.25em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletLandscapeUp grid',
    postcss: '.x { display: grid; @media (width >= 56.25em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletLandscapeUp block',
    postcss: '.x { display: block; @media (width >= 56.25em) { & { display: none } } }',
  },
  {
    id: 'pair hideTabletLandscapeUp inlineBlock',
    postcss: '.x { display: inline-block; @media (width >= 56.25em) { & { display: none } } }',
  },
  {
    id: 'pair hideDesktopUp flex',
    postcss: '.x { display: flex; @media (width >= 75em) { & { display: none } } }',
  },
  {
    id: 'pair hideDesktopUp inlineFlex',
    postcss: '.x { display: inline-flex; @media (width >= 75em) { & { display: none } } }',
  },
  {
    id: 'pair hideDesktopUp grid',
    postcss: '.x { display: grid; @media (width >= 75em) { & { display: none } } }',
  },
  {
    id: 'pair hideDesktopUp block',
    postcss: '.x { display: block; @media (width >= 75em) { & { display: none } } }',
  },
  {
    id: 'pair hideDesktopUp inlineBlock',
    postcss: '.x { display: inline-block; @media (width >= 75em) { & { display: none } } }',
  },
  {
    id: 'pair wFullPhoneOnly srOnly',
    postcss:
      '.x { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0; @media (width < 37.5em) { & { width: 100% } } }',
  },
  {
    id: 'pair wFullPhoneOnly srOnlyFocusable',
    postcss:
      '.x { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0; @media (width < 37.5em) { & { width: 100% } } &:focus-visible { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal } &:focus-within { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal } }',
  },
  {
    id: '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
    postcss:
      '.x { outline: none; &:focus-visible { outline-color: red } &:focus-visible { outline-style: solid; outline-width: var(--nave-border-width-focus, 2px); outline-color: var(--nave-color-border-focus, currentColor); outline-offset: 2px } }',
  },
  {
    id: '.x { @nave focusRing; &:focus { outline: none } }',
    postcss:
      '.x { outline: none; &:focus { outline: none } &:focus-visible { outline-style: solid; outline-width: var(--nave-border-width-focus, 2px); outline-color: var(--nave-color-border-focus, currentColor); outline-offset: 2px } }',
  },
  {
    id: '.x { @nave focusRing; &:focus-visible { outline: none } }',
    postcss:
      '.x { outline: none; &:focus-visible { outline: none } &:focus-visible { outline-style: solid; outline-width: var(--nave-border-width-focus, 2px); outline-color: var(--nave-color-border-focus, currentColor); outline-offset: 2px } }',
  },
  {
    id: '.x { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
    postcss:
      '.x { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0; &:focus-visible { position: fixed } &:focus-visible { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal } &:focus-within { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal } }',
  },
  {
    id: '.s1, #x .s2 { @nave hideDesktopUp; color: red } .s1.k { color: blue }',
    postcss:
      '.s1, #x .s2 { color: red; @media (width >= 75em) { & { display: none } } } .s1.k { color: blue }',
    text: '.s1, #x .s2 {  color: red  @media (width >= 75em) { & { display: none } }} .s1.k { color: blue }',
  },
  {
    id: '.s1, #x .s2 { @nave hideDesktopUp textLeft } .s1.k { text-align: right }',
    postcss:
      '.s1, #x .s2 { text-align: left; @media (width >= 75em) { & { display: none}}} .s1.k { text-align: right }',
  },
  {
    id: '.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }',
    postcss:
      '.p::before { content: "x"; display: block; width: 10px; @media (width >= 75em) { & { display: none } } }',
    text: '.p::before { content: "x";  display: block; width: 10px  @media (width >= 75em) { & { display: none } }}',
  },
  {
    id: '.p::before { content: "x"; &:hover {} @nave flex; width: 10px }',
    postcss: '.p::before { content: "x"; &:hover {} & { display: flex } width: 10px }',
  },
  {
    id: '.a, .b::before { content: "x"; @nave hideDesktopUp; width: 10px }',
    postcss:
      '.a, .b::before { content: "x"; width: 10px; @media (width >= 75em) { & { display: none } } }',
    text: '.a, .b::before { content: "x";  width: 10px  @media (width >= 75em) { & { display: none } }}',
  },
  {
    id: 'extend atoms mA mB',
    postcss:
      '.x {\n    @media (width >= 75em) {\n        & {\n            color: red } }\n    @media (width >= 60em) {\n        & {\n            color: blue } } }',
  },
  {
    id: 'logical variant',
    postcss: '.card { inline-size: 50%; @media (width < 37.5em) { & { width: 100% } } }',
  },
]
