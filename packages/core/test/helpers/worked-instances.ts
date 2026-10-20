/**
 * The worked instances of the warning text, as the framed lines a host prints for them. The
 * framing is `x.css:<line>:<column>: ` ahead of the text, the position being the overrider's.
 * `${MIGRATION_VERSION}` is the release the order moved in.
 */
import type { AtomDefinition } from '../../src/atoms.ts'

import { MIGRATION_VERSION } from '../../src/directive/migration.ts'

export interface WorkedInstance {
  readonly css: string
  readonly extend?: Record<string, AtomDefinition>
  readonly lines: readonly string[]
  readonly name: string
}

const GUTTER: Record<string, AtomDefinition> = {
  gutter: {
    declarations: { margin: '8px' },
    media: { '(width < 37.5em)': { declarations: { margin: '0' } } },
  },
}

const HX: Record<string, AtomDefinition> = {
  hx: {
    declarations: { 'font-size': '16px' },
    media: { '(width >= 48em)': { declarations: { 'font-size': '30px' } } },
  },
}

/**
 * The instances that come from comparing a later declaration with an atom's block.
 */
export const ORDER_INSTANCES: readonly WorkedInstance[] = [
  {
    name: 'a later atom (template A)',
    css: '.c { @nave hideDesktopUp flex; }',
    lines: [
      `x.css:1:26: @nave: "flex" comes after "hideDesktopUp", so under @media (width >= 75em) display is flex, not none. Before @navecss/core ${MIGRATION_VERSION} "hideDesktopUp" won, because an atom's blocks were placed last in the rule. To let "hideDesktopUp" win, name it after "flex": \`@nave flex hideDesktopUp;\`. If "flex" is meant to win, mark the directive: \`@nave /* nave-allow-override: display */ hideDesktopUp flex;\``,
    ],
  },
  {
    name: "the rule's own declaration (template B)",
    css: '.c { @nave hx; font-size: 20px }',
    extend: HX,
    lines: [
      `x.css:1:16: @nave: font-size: 20px comes after "hx", so under @media (width >= 48em) font-size is 20px, not 30px. Before @navecss/core ${MIGRATION_VERSION} "hx" won, because an atom's blocks were placed last in the rule. To let "hx" win, move font-size: 20px above the directive. If it is meant to win, mark the directive that names "hx": \`@nave /* nave-allow-override: font-size */ hx;\``,
    ],
  },
  {
    name: 'F3, the ring clause',
    css: '.c { @nave focusRing; &:focus { outline: none } }',
    lines: [
      `x.css:1:23: @nave: the &:focus block comes after "focusRing", so on :focus-visible outline: none replaces outline-style, outline-width and outline-color. This hides the keyboard focus indicator that "focusRing" draws. Before @navecss/core ${MIGRATION_VERSION} "focusRing" won, because an atom's blocks were placed last in the rule. To let "focusRing" win, move the &:focus block above the directive. If it is meant to win, mark the directive that names "focusRing": \`@nave /* nave-allow-override: outline */ focusRing;\``,
    ],
  },
  {
    name: 'the logical variant',
    css: '.card { @nave wFullPhoneOnly; inline-size: 50%; }',
    lines: [
      `x.css:1:31: @nave: inline-size: 50% comes after "wFullPhoneOnly", so under @media (width < 37.5em) it may override width: 100%, depending on writing mode. Before @navecss/core ${MIGRATION_VERSION} "wFullPhoneOnly" won, because an atom's blocks were placed last in the rule. To let "wFullPhoneOnly" win, move inline-size: 50% above the directive. If it is meant to win, mark the directive that names "wFullPhoneOnly": \`@nave /* nave-allow-override: width */ wFullPhoneOnly;\``,
    ],
  },
  {
    name: 'P4, one warning for each reveal block',
    css: '.skip { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
    lines: [
      `x.css:1:32: @nave: the &:focus-visible block comes after "srOnlyFocusable", so on :focus-visible position is fixed, not static. Before @navecss/core ${MIGRATION_VERSION} "srOnlyFocusable" won, because an atom's blocks were placed last in the rule. To let "srOnlyFocusable" win, move the &:focus-visible block above the directive. If it is meant to win, mark the directive that names "srOnlyFocusable": \`@nave /* nave-allow-override: position */ srOnlyFocusable;\``,
      `x.css:1:32: @nave: the &:focus-visible block comes after "srOnlyFocusable", so on :focus-within while also on :focus-visible, position is fixed, not static. Before @navecss/core ${MIGRATION_VERSION} "srOnlyFocusable" won, because an atom's blocks were placed last in the rule. To let "srOnlyFocusable" win, move the &:focus-visible block above the directive. If it is meant to win, mark the directive that names "srOnlyFocusable": \`@nave /* nave-allow-override: position */ srOnlyFocusable;\``,
    ],
  },
  {
    name: 'a condition of its own',
    css: '.c { @nave hideTabletPortraitUp; @media (width < 75em) { display: grid } }',
    lines: [
      `x.css:1:34: @nave: the @media (width < 75em) block comes after "hideTabletPortraitUp", so under @media (width >= 37.5em) while also under @media (width < 75em), display is grid, not none. Before @navecss/core ${MIGRATION_VERSION} "hideTabletPortraitUp" won, because an atom's blocks were placed last in the rule. To let "hideTabletPortraitUp" win, move the @media (width < 75em) block above the directive. If it is meant to win, mark the directive that names "hideTabletPortraitUp": \`@nave /* nave-allow-override: display */ hideTabletPortraitUp;\``,
    ],
  },
  {
    name: 'a longhand over a shorthand block',
    css: '.f { @nave gutter; margin-top: 4px }',
    extend: GUTTER,
    lines: [
      `x.css:1:20: @nave: margin-top: 4px comes after "gutter", so under @media (width < 37.5em) it replaces the margin-top that margin: 0 sets. Before @navecss/core ${MIGRATION_VERSION} "gutter" won, because an atom's blocks were placed last in the rule. To let "gutter" win, move margin-top: 4px above the directive. If it is meant to win, mark the directive that names "gutter": \`@nave /* nave-allow-override: margin-top */ gutter;\``,
    ],
  },
  {
    name: 'a comment that is not a marker',
    css: '.c { @nave /* nave-allow-override display */ hideDesktopUp flex; }',
    lines: [
      `x.css:1:12: @nave: the comment /* nave-allow-override display */ in this directive is not a marker, so it allows nothing: a marker starts with nave-allow-override and a colon, with nothing between them, such as \`/* nave-allow-override: display */\`. Correct the comment, or remove it.`,
      `x.css:1:60: @nave: "flex" comes after "hideDesktopUp", so under @media (width >= 75em) display is flex, not none. Before @navecss/core ${MIGRATION_VERSION} "hideDesktopUp" won, because an atom's blocks were placed last in the rule. To let "hideDesktopUp" win, name it after "flex": \`@nave /* nave-allow-override display */ flex hideDesktopUp;\`. If "flex" is meant to win, mark the directive: \`@nave /* nave-allow-override: display */ hideDesktopUp flex;\``,
    ],
  },
]

/**
 * The instances about the shape a rule's output takes under a selector list.
 */
export const SHAPE_INSTANCES: readonly WorkedInstance[] = [
  {
    name: 'a pseudo-element rule (R2b-a)',
    css: '.badge::after { content: ""; @nave hideDesktopUp; }',
    lines: [
      `x.css:1:30: @nave: every selector in this rule ends in a pseudo-element, and an atom's pseudo-class, @media and @container blocks are written on \`&\`, which cannot match one, so this directive leaves out the block of "hideDesktopUp" under @media (width >= 75em). Remove "hideDesktopUp" from the directive. If a block was meant for the pseudo-element, write a rule for the pseudo-element under that condition yourself.`,
    ],
  },
  {
    name: 'a wrapped run in a list with a pseudo-element (R2b-b1)',
    css: '.icon, .link::before { @nave hideDesktopUp; width: 1em; height: 1em; }',
    lines: [
      `x.css:1:45: @nave: the declarations after the block of "hideDesktopUp" under @media (width >= 75em) are written inside \`& { }\`, which cannot match a pseudo-element, so they do not apply to .link::before. Before @navecss/core ${MIGRATION_VERSION} they did, because they were left outside \`& { }\`. To apply them there too, move them above the directive. Or move .link::before to a separate rule, with or without them.`,
    ],
  },
  {
    name: 'a later atom in such a list (R2b-b2)',
    css: '.a, .b::before { @nave hideDesktopUp textLeft; width: 10px }',
    lines: [
      `x.css:1:38: @nave: the declarations of "textLeft" follow the block of "hideDesktopUp" under @media (width >= 75em), so they are written inside \`& { }\`, which cannot match a pseudo-element: they do not apply to .b::before. Before @navecss/core ${MIGRATION_VERSION} they did, because they were left outside \`& { }\`. To apply them there too, name "textLeft" before "hideDesktopUp": \`@nave textLeft hideDesktopUp;\`. Or move .b::before to a separate rule, with or without them.`,
    ],
  },
  {
    name: 'a directive after a nested rule in such a list (R2b-b3)',
    css: '.a, .b::before { &:hover { color: blue } @nave flex; }',
    lines: [
      `x.css:1:48: @nave: this directive comes after the &:hover block, so the declarations of "flex" are written inside \`& { }\`, which cannot match a pseudo-element: they do not apply to .b::before. To apply them there too, move the directive above the &:hover block. Or move .b::before to a separate rule, with or without them.`,
    ],
  },
  {
    name: 'an unequal list, newly wrapped (R9-wrap)',
    css: '.s1, #x .s2 { @nave hideDesktopUp; color: red }',
    lines: [
      `x.css:1:36: @nave: the declarations after the block of "hideDesktopUp" under @media (width >= 75em) are written inside \`& { }\`, which under the selector list .s1, #x .s2 matches with the specificity of #x .s2, so where .s1 matches they can win over a rule elsewhere that is more specific than .s1. Before @navecss/core ${MIGRATION_VERSION} they were left outside \`& { }\`, so they matched with each selector's own specificity. To give each selector its own specificity, write the rule once for each of \`.s1\` and \`#x .s2\`. To give the whole rule the specificity of #x .s2, write the list as \`:is(.s1, #x .s2)\`.`,
    ],
  },
  {
    name: 'an unequal list, already wrapped (R9-wrap)',
    css: '.s1, #x .s2 { &:hover { color: blue } @nave flex; }',
    lines: [
      `x.css:1:45: @nave: the declarations of "flex" are written inside \`& { }\`, which under the selector list .s1, #x .s2 matches with the specificity of #x .s2, so where .s1 matches they can win over a rule elsewhere that is more specific than .s1. To give each selector its own specificity, write the rule once for each of \`.s1\` and \`#x .s2\`. To give the whole rule the specificity of #x .s2, write the list as \`:is(.s1, #x .s2)\`.`,
    ],
  },
]
