/**
 * The sentences the README carries as written beyond the first release's: each held as a literal
 * (markdown source, backticks included, no trailing newline) with its UTF-8 length and the first
 * sixteen hex digits of its sha256, and the signature state each belongs to. The reduced-motion
 * sentence has eight forms, built from one template by a rule and checked against the same
 * figures; the texts a README must never carry are held beside them.
 */
import type { Draft } from './draft-states.ts'
import type { BackdropScope } from './table-p.ts'

export interface Literal {
  /**
  The sentence's UTF-8 length in bytes.
   */
  readonly bytes: number
  /**
  The first sixteen hex digits of the sentence's sha256.
   */
  readonly prefix: string
  readonly text: string
}

export interface NamedLiteral extends Literal {
  readonly name: string
}

/**
A signature state: the drafts that are not signed, and the scope the scrim is signed at.
 */
export interface SignatureState {
  readonly scope?: BackdropScope
  readonly unsigned: readonly Draft[]
}

/**
The shipping state: every draft signed, the scrim at scope (i).
 */
export const SHIPPING: SignatureState = { scope: 'i', unsigned: [] }

export const SENTENCE_1_ACTIVE_OPTION: Literal = {
  bytes: 409,
  prefix: 'efe7d17a8ddb26df',
  text: "In Combobox and Autocomplete, keyboard focus stays in the text field while the arrow keys move through the list, so Nave marks the option that Enter will choose with the same ring it draws around a focused control. Hovering an option makes it the one Enter chooses, so the ring follows the pointer too. The ring is drawn on the option's `::before`; a rule of yours that sets `::before` on options replaces it.",
}
export const SENTENCE_2_CONTEXT_MENU_RINGS: Literal = {
  bytes: 279,
  prefix: '5912062397aefe1d',
  text: "In Chromium, opening a Context Menu with a right-click shows focus rings: the browser's own ring around the menu, then a focus ring on whichever item the pointer is over. Chromium decides when a focus ring shows; Nave does not hide it, and other browsers may show it differently.",
}
export const SENTENCE_3_PREVIEW_CARD: Literal = {
  bytes: 264,
  prefix: '5570d7ef0315ef67',
  text: 'A Preview Card opens when its link is hovered or focused, but its contents are not reachable with Tab: the next Tab moves past the card and closes it. Keep anything a reader must act on, such as a link or a button, out of the card, or offer it on the page as well.',
}
export const SENTENCE_5_MENUBAR_BARE_POPUP: Literal = {
  bytes: 207,
  prefix: 'b71a244a1ae80d7b',
  text: "In a Menubar, moving to the next menu with the arrow keys puts focus on that menu's panel before any item, so the browser's ring around the panel shows where you are until the next arrow key reaches an item.",
}
export const SENTENCE_6_COMBOBOX_FIELD: Literal = {
  bytes: 249,
  prefix: '4793b4c589c161f6',
  text: "Nave draws the Combobox and Autocomplete field's border on `InputGroup`, not on the input. If you place the input outside an `InputGroup`, wrap it in an element with a visible border of your own, or the field has no visible edge until it is focused.",
}
export const SENTENCE_7_DIALOG_BACKDROP: Literal = {
  bytes: 267,
  prefix: '824b95c9ddb02885',
  text: 'Render `Dialog.Backdrop` only for a dialog whose `modal` is `true`. Nave paints it as a dark layer over the page; with `modal={false}` or `modal="trap-focus"` the page underneath can still be used, and its text and focus rings are then hard to see through that layer.',
}

/**
The reduced-motion sentence's template: a list goes where `{LIST}` is.
 */
export const SENTENCE_4_TEMPLATE: Literal = {
  bytes: 186,
  prefix: '46386b72761b5b76',
  text: "When the reader's system asks for reduced motion, this package turns off {LIST}, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
}
/**
The reduced-motion sentence's eight forms, by the signature of the popups' fade, the tooltip's fade
and the backdrop's fade, in that order (S signed, u unsigned).
 */
export const SENTENCE_4_FORMS: Readonly<Record<string, Literal>> = {
  SSS: {
    bytes: 395,
    prefix: 'ac7cdbed478729cd',
    text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the backdrop's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  SSu: {
    bytes: 374,
    prefix: '0f70e938c8d6cd5f',
    text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  SuS: {
    bytes: 375,
    prefix: '9f8ac863f6cd3082',
    text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the backdrop's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  Suu: {
    bytes: 354,
    prefix: '8dd2099d4fd3e743',
    text: "When the reader's system asks for reduced motion, this package turns off the popups' fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  uSS: {
    bytes: 377,
    prefix: 'eeb0df1be625233c',
    text: "When the reader's system asks for reduced motion, this package turns off the tooltip's fade, the backdrop's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  uSu: {
    bytes: 356,
    prefix: '2a4bb59987dbc18e',
    text: "When the reader's system asks for reduced motion, this package turns off the tooltip's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  uuS: {
    bytes: 357,
    prefix: 'd25f6848f81a48ed',
    text: "When the reader's system asks for reduced motion, this package turns off the backdrop's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
  uuu: {
    bytes: 336,
    prefix: '9299c00177cd0c63',
    text: "When the reader's system asks for reduced motion, this package turns off the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
}

/**
How the list in sentence 4 is built: the fades that ship, in order, then the four motions that
always do, joined with commas and an "and" before the last.
 */
export const SENTENCE_4_LIST_RULE = {
  always: [
    "the tab indicator's slide",
    'the motion of Accordion and Collapsible panels opening and closing',
    'the turn of the icon in their triggers',
    "the switch's slide",
  ],
  backdrop: "the backdrop's fade",
  popups: "the popups' fade",
  tooltip: "the tooltip's fade",
} as const

/**
The parent's reduced-motion sentence, which the combined package's sentence 4 replaces.
 */
export const PARENT_REDUCED_MOTION: Literal = {
  bytes: 309,
  prefix: '830a8820a455e602',
  text: "When the reader's system asks for reduced motion, this package turns off the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
}
/**
The earlier reduced-motion text, withdrawn before the first release.
 */
export const EARLIER_REDUCED_MOTION: Literal = {
  bytes: 275,
  prefix: 'bdfef4e7a2de79a6',
  text: "When the reader's system asks for reduced motion, Nave turns off its own transitions (popups fading in and out, the tooltip's fade, the backdrop's fade and the tab indicator's slide), even if you have changed the motion tokens. Motion you add yourself is yours to switch off.",
}
/**
The Combobox field sentence that sentence 6 replaces: it advised on a Base UI older than the
package supports and named the popup as a place to put the input.
 */
export const EARLIER_COMBOBOX_FIELD: Literal = {
  bytes: 350,
  prefix: 'a624581cd96f16c0',
  text: "Nave draws the Combobox and Autocomplete field's border on `InputGroup`, not on the input. Base UI added `InputGroup` in 1.3.0: on an earlier version, or wherever you place the input outside an `InputGroup` (inside the popup, for example), wrap it in an element with a visible border of your own, or the field has no visible edge until it is focused.",
}
/**
An earlier template for sentence 4, and its eight forms, which sentence 4 replaces.
 */
export const EARLIER_TEMPLATE: Literal = {
  bytes: 223,
  prefix: 'a3048b19d00db959',
  text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off {LIST}, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
}
export const EARLIER_FORMS: Readonly<Record<string, Literal>> = {
  SSS: {
    bytes: 304,
    prefix: '558068ed7d82413d',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the popups' fade, the tooltip's fade, the backdrop's fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  SSu: {
    bytes: 283,
    prefix: '0bad7fa3b06867aa',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the popups' fade, the tooltip's fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  SuS: {
    bytes: 284,
    prefix: '4b079dd7817cc6bc',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the popups' fade, the backdrop's fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  Suu: {
    bytes: 263,
    prefix: 'f0a9e5a7e91e4e6e',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the popups' fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  uSS: {
    bytes: 286,
    prefix: '14be63b29bd3457d',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the tooltip's fade, the backdrop's fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  uSu: {
    bytes: 265,
    prefix: '496d140b2802482c',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the tooltip's fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  uuS: {
    bytes: 266,
    prefix: '4d7c17c1c7b507cc',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the backdrop's fade and the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
  uuu: {
    bytes: 242,
    prefix: '55c4d7623f414a07',
    text: "When the reader's system asks for reduced motion, Nave's motion tokens turn its transitions off, and this package also turns off the tab indicator's slide, even if you have changed those tokens. Motion you add yourself is yours to switch off.",
  },
}
