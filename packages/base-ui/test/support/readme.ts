/**
 * Reading the package's README the way its instruments need it: the prose apart from the fences,
 * the fences with their language, and the sentences the README must carry byte for byte.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR } from './stylesheet.ts'

export const README_PATH = path.join(PACKAGE_DIR, 'README.md')

export const readReadme = (): string => readFileSync(README_PATH, 'utf8')

export interface Fence {
  readonly body: string
  readonly language: string
}

const FENCE = /^```([\w-]*)\n([\s\S]*?)\n```$/gm

/**
Every fenced block of a markdown text, in order.
 */
export const fencesOf = (markdown: string): Fence[] =>
  markdown
    .matchAll(FENCE)
    .map((match) => ({ body: match[2] ?? '', language: match[1] ?? '' }))
    .toArray()

/**
The text with every fenced block removed.
 */
export const proseOf = (markdown: string): string => markdown.replaceAll(FENCE, '')

export interface FixedSentence {
  /**
  The sentence's UTF-8 length in bytes.
   */
  readonly bytes: number
  readonly name: string
  /**
  The first sixteen hex digits of the sentence's sha256.
   */
  readonly prefix: string
  readonly text: string
}

/**
The sentences the README carries as written, markdown source and no trailing newline.
 */
export const FIXED_SENTENCES: readonly FixedSentence[] = [
  {
    bytes: 552,
    name: 'disclosure panel',
    prefix: '7a49152ecef249a0',
    text: "The Accordion and Collapsible panels set `overflow: hidden` so their height can animate, which also clips anything drawn outside the panel's box, focus rings included. Each panel insets its content by enough for Nave's focus ring: at both sides, above its first element and below its last. That inset reaches elements only, so a panel that starts or ends with bare text gets none there, and your own margins on those elements replace it. Keep at least the width plus the offset of your focus ring clear around any focusable element at the panel's edge.",
  },
  {
    bytes: 287,
    name: 'bare popup focus',
    prefix: 'f054630c8843e000',
    text: "When nothing inside a popup can take focus, Base UI focuses the popup itself and the browser draws its focus ring around the panel. The bridge leaves that ring alone. Removing it with `outline: 0`, as Base UI's own demos do, leaves a keyboard user with no visible sign of where focus is.",
  },
  {
    bytes: 92,
    name: 'non-affiliation',
    prefix: 'a313971c2b1f3356',
    text: 'This package is not affiliated with, endorsed by or sponsored by MUI or the Base UI project.',
  },
  {
    bytes: 214,
    name: 'Menu.LinkItem',
    prefix: '98a262547c17440c',
    text: 'In Base UI 1.8.0, `Menu.LinkItem` has no disabled state: a `disabled` prop reaches the `<a>` as a plain attribute, the link still activates, and it does not take the disabled colour Nave gives the other menu items.',
  },
  {
    bytes: 309,
    name: 'reduced motion',
    prefix: '830a8820a455e602',
    text: "When the reader's system asks for reduced motion, this package turns off the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.",
  },
]

/**
A sentence once in the README and since withdrawn: it described a wrapper element this package does not
have, and it must not come back.
 */
export const WITHDRAWN = {
  bytes: 427,
  prefix: 'c9916c5d1e6d6aab',
  text: "`baseUiAccordionPanel` and `baseUiCollapsiblePanel` set `overflow: hidden` so the panel's height can animate, which also clips anything drawn outside the panel's box, focus rings included. Put `baseUiDisclosureContent` on a wrapper inside the panel: its padding keeps the ring `focusRing` draws inside the clipped area. If you use a wrapper of your own, give it at least the width plus the offset of your focus ring as padding.",
} as const

/**
The one fixed sentence that is not a sentence about this package.
 */
export const PROMISE_SENTENCE = 'Nave promises its values, not their semantics.'

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
