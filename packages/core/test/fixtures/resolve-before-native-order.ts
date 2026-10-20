/**
 * What `resolve()` returns for every built-in atom at the commit before atoms were expanded in
 * place, written once from that commit's `src/directive/resolve.ts` and `src/atoms.ts`, which this
 * change leaves byte-identical. Each atom is one line of JSON. The test that reads it fails if an
 * atom's body moves.
 */
const SERIALIZED: Record<string, string> = {
  flex: '{"declarations":[{"prop":"display","value":"flex"}],"blocks":[]}',
  inlineFlex: '{"declarations":[{"prop":"display","value":"inline-flex"}],"blocks":[]}',
  grid: '{"declarations":[{"prop":"display","value":"grid"}],"blocks":[]}',
  block: '{"declarations":[{"prop":"display","value":"block"}],"blocks":[]}',
  inlineBlock: '{"declarations":[{"prop":"display","value":"inline-block"}],"blocks":[]}',
  hidden: '{"declarations":[{"prop":"display","value":"none"}],"blocks":[]}',
  flexCol: '{"declarations":[{"prop":"flex-direction","value":"column"}],"blocks":[]}',
  flexWrap: '{"declarations":[{"prop":"flex-wrap","value":"wrap"}],"blocks":[]}',
  itemsCenter: '{"declarations":[{"prop":"align-items","value":"center"}],"blocks":[]}',
  itemsStart: '{"declarations":[{"prop":"align-items","value":"flex-start"}],"blocks":[]}',
  itemsEnd: '{"declarations":[{"prop":"align-items","value":"flex-end"}],"blocks":[]}',
  justifyCenter: '{"declarations":[{"prop":"justify-content","value":"center"}],"blocks":[]}',
  justifyBetween:
    '{"declarations":[{"prop":"justify-content","value":"space-between"}],"blocks":[]}',
  justifyEnd: '{"declarations":[{"prop":"justify-content","value":"flex-end"}],"blocks":[]}',
  flexGrow: '{"declarations":[{"prop":"flex-grow","value":"1"}],"blocks":[]}',
  flexShrink0: '{"declarations":[{"prop":"flex-shrink","value":"0"}],"blocks":[]}',
  gap: '{"declarations":[{"prop":"gap","value":"var(--nave-spacing-content-md)"}],"blocks":[]}',
  relative: '{"declarations":[{"prop":"position","value":"relative"}],"blocks":[]}',
  absolute: '{"declarations":[{"prop":"position","value":"absolute"}],"blocks":[]}',
  insetFull: '{"declarations":[{"prop":"inset","value":"0"}],"blocks":[]}',
  wFull: '{"declarations":[{"prop":"width","value":"100%"}],"blocks":[]}',
  hFull: '{"declarations":[{"prop":"height","value":"100%"}],"blocks":[]}',
  minW0: '{"declarations":[{"prop":"min-width","value":"0"}],"blocks":[]}',
  truncate:
    '{"declarations":[{"prop":"overflow","value":"hidden"},{"prop":"text-overflow","value":"ellipsis"},{"prop":"white-space","value":"nowrap"}],"blocks":[]}',
  srOnly:
    '{"declarations":[{"prop":"position","value":"absolute"},{"prop":"width","value":"1px"},{"prop":"height","value":"1px"},{"prop":"padding","value":"0"},{"prop":"margin","value":"-1px"},{"prop":"overflow","value":"hidden"},{"prop":"clip-path","value":"inset(50%)"},{"prop":"white-space","value":"nowrap"},{"prop":"border-width","value":"0"}],"blocks":[]}',
  srOnlyFocusable:
    '{"declarations":[{"prop":"position","value":"absolute"},{"prop":"width","value":"1px"},{"prop":"height","value":"1px"},{"prop":"padding","value":"0"},{"prop":"margin","value":"-1px"},{"prop":"overflow","value":"hidden"},{"prop":"clip-path","value":"inset(50%)"},{"prop":"white-space","value":"nowrap"},{"prop":"border-width","value":"0"}],"blocks":[{"kind":"pseudo","selector":":focus-visible","declarations":[{"prop":"position","value":"static"},{"prop":"width","value":"auto"},{"prop":"height","value":"auto"},{"prop":"margin","value":"0"},{"prop":"overflow","value":"visible"},{"prop":"clip-path","value":"none"},{"prop":"white-space","value":"normal"}]},{"kind":"pseudo","selector":":focus-within","declarations":[{"prop":"position","value":"static"},{"prop":"width","value":"auto"},{"prop":"height","value":"auto"},{"prop":"margin","value":"0"},{"prop":"overflow","value":"visible"},{"prop":"clip-path","value":"none"},{"prop":"white-space","value":"normal"}]}]}',
  noWrap: '{"declarations":[{"prop":"white-space","value":"nowrap"}],"blocks":[]}',
  breakWord: '{"declarations":[{"prop":"overflow-wrap","value":"break-word"}],"blocks":[]}',
  textLeft: '{"declarations":[{"prop":"text-align","value":"left"}],"blocks":[]}',
  textCenter: '{"declarations":[{"prop":"text-align","value":"center"}],"blocks":[]}',
  textRight: '{"declarations":[{"prop":"text-align","value":"right"}],"blocks":[]}',
  interactive:
    '{"declarations":[{"prop":"cursor","value":"pointer"},{"prop":"-webkit-user-select","value":"none"},{"prop":"user-select","value":"none"},{"prop":"-webkit-tap-highlight-color","value":"transparent"}],"blocks":[]}',
  focusRing:
    '{"declarations":[{"prop":"outline","value":"none"}],"blocks":[{"kind":"pseudo","selector":":focus-visible","declarations":[{"prop":"outline-style","value":"solid"},{"prop":"outline-width","value":"var(--nave-border-width-focus, 2px)"},{"prop":"outline-color","value":"var(--nave-color-border-focus, currentColor)"},{"prop":"outline-offset","value":"2px"}]}]}',
  disabledState: String.raw`{"declarations":[],"blocks":[{"kind":"pseudo","selector":":disabled, [aria-disabled=\"true\"]","declarations":[{"prop":"color","value":"var(--nave-color-content-disabled)"},{"prop":"border-color","value":"var(--nave-color-border-disabled)"},{"prop":"pointer-events","value":"none"}]}]}`,
  rounded:
    '{"declarations":[{"prop":"border-radius","value":"var(--nave-radius-control)"}],"blocks":[]}',
  roundedCard:
    '{"declarations":[{"prop":"border-radius","value":"var(--nave-radius-card)"}],"blocks":[]}',
  roundedFull:
    '{"declarations":[{"prop":"border-radius","value":"var(--nave-radius-full)"}],"blocks":[]}',
  border:
    '{"declarations":[{"prop":"border","value":"var(--nave-border-width-sm) solid var(--nave-color-border-default)"}],"blocks":[]}',
  overflowHidden: '{"declarations":[{"prop":"overflow","value":"hidden"}],"blocks":[]}',
  overflowAuto: '{"declarations":[{"prop":"overflow","value":"auto"}],"blocks":[]}',
  transition:
    '{"declarations":[{"prop":"transition-property","value":"color, background-color, border-color, opacity, box-shadow"},{"prop":"transition-duration","value":"var(--nave-motion-duration-base)"},{"prop":"transition-timing-function","value":"var(--nave-motion-easing-standard)"}],"blocks":[]}',
  container: '{"declarations":[{"prop":"container-type","value":"inline-size"}],"blocks":[]}',
  hidePhoneOnly:
    '{"declarations":[],"blocks":[{"kind":"media","condition":"(width < 37.5em)","declarations":[{"prop":"display","value":"none"}],"pseudos":[]}]}',
  hideTabletPortraitUp:
    '{"declarations":[],"blocks":[{"kind":"media","condition":"(width >= 37.5em)","declarations":[{"prop":"display","value":"none"}],"pseudos":[]}]}',
  hideTabletLandscapeUp:
    '{"declarations":[],"blocks":[{"kind":"media","condition":"(width >= 56.25em)","declarations":[{"prop":"display","value":"none"}],"pseudos":[]}]}',
  hideDesktopUp:
    '{"declarations":[],"blocks":[{"kind":"media","condition":"(width >= 75em)","declarations":[{"prop":"display","value":"none"}],"pseudos":[]}]}',
  stackPhoneOnly:
    '{"declarations":[],"blocks":[{"kind":"media","condition":"(width < 37.5em)","declarations":[{"prop":"flex-direction","value":"column"}],"pseudos":[]}]}',
  wFullPhoneOnly:
    '{"declarations":[],"blocks":[{"kind":"media","condition":"(width < 37.5em)","declarations":[{"prop":"width","value":"100%"}],"pseudos":[]}]}',
}

export const RESOLVED_AT_PREVIOUS_RELEASE: Record<string, unknown> = Object.fromEntries(
  Object.entries(SERIALIZED).map(([name, json]) => [name, JSON.parse(json) as unknown]),
)
