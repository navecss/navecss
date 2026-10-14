/**
 * The reduced-motion sentence of the combined package: its list rule, composed from the overlay release's template,
 * and the table of its sixteen forms.
 */
import type { State789 } from './w12-states.ts'

import { SENTENCE_4_LIST_RULE, SENTENCE_4_TEMPLATE } from './w9-sentences.ts'
import { isSigned789 } from './w12-states.ts'

/**
The reduced-motion sentence's list, extended by the toasts' fade and the Navigation Menu icon's turn.
 */
export const RM_LIST_RULE = {
  ...SENTENCE_4_LIST_RULE,
  navigationIcon: 'the turn of the icon in Navigation Menu triggers',
  toasts: "the toasts' fade",
} as const

export interface ReducedMotionSigned {
  readonly backdrop: boolean
  readonly popups: boolean
  readonly toasts: boolean
  readonly tooltip: boolean
}

const joinList = (items: readonly string[]): string =>
  items.length === 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`

/**
The reduced-motion sentence for a state, built from the template and the list rule rather than
looked up: the fades that ship, in order, then the Navigation Menu icon, then the four motions that
always do.
 */
export const composeReducedMotion = (signed: ReducedMotionSigned): string => {
  const items = [
    ...(signed.popups ? [RM_LIST_RULE.popups] : []),
    ...(signed.tooltip ? [RM_LIST_RULE.tooltip] : []),
    ...(signed.backdrop ? [RM_LIST_RULE.backdrop] : []),
    ...(signed.toasts ? [RM_LIST_RULE.toasts] : []),
    RM_LIST_RULE.navigationIcon,
    ...RM_LIST_RULE.always,
  ]
  return SENTENCE_4_TEMPLATE.text.replace('{LIST}', () => joinList(items))
}

/**
The sixteen forms, by the signature of the popups' fade, the tooltip's fade, the backdrop's fade
and the toasts' fade in that order (S signed, u unsigned): their lengths and hash prefixes as the
table of the finding that fixed the rule gives them.
 */
export const RM_TABLE: readonly { bytes: number; code: string; prefix: string }[] = [
  { code: 'SSSS', bytes: 463, prefix: 'fa84dec5b631e5e6' },
  { code: 'SSSu', bytes: 445, prefix: '6b7d06fd1edcdfe4' },
  { code: 'SSuS', bytes: 442, prefix: '55d5edec14193299' },
  { code: 'SSuu', bytes: 424, prefix: '9d5601262edef18b' },
  { code: 'SuSS', bytes: 443, prefix: '5c470988cb185db3' },
  { code: 'SuSu', bytes: 425, prefix: '015e53ba262cf42e' },
  { code: 'SuuS', bytes: 422, prefix: 'fe9bc81c36488dcf' },
  { code: 'Suuu', bytes: 404, prefix: '84adfaa495f4c1c9' },
  { code: 'uSSS', bytes: 445, prefix: 'cb6b1332628e086e' },
  { code: 'uSSu', bytes: 427, prefix: '59bd5ddacabff92a' },
  { code: 'uSuS', bytes: 424, prefix: '0db8ec65006ff2a0' },
  { code: 'uSuu', bytes: 406, prefix: 'a71720c8fcd3158e' },
  { code: 'uuSS', bytes: 425, prefix: '3fc475f9d78a1e21' },
  { code: 'uuSu', bytes: 407, prefix: 'a7480c8f57df4547' },
  { code: 'uuuS', bytes: 404, prefix: '5afeb98375710ef9' },
  { code: 'uuuu', bytes: 386, prefix: '65b988a768612c08' },
]

export const signedOfCode = (code: string): ReducedMotionSigned => ({
  popups: code.startsWith('S'),
  tooltip: code[1] === 'S',
  backdrop: code[2] === 'S',
  toasts: code[3] === 'S',
})

/**
The two forms a README can carry: the overlay release's three drafts are signed, so only the toasts' fade varies.
 */
export const LIVE_CODES = ['SSSS', 'SSSu'] as const

export const reducedMotionCodeFor = (state: State789): (typeof LIVE_CODES)[number] =>
  isSigned789(state, 'toast-fade') ? 'SSSS' : 'SSSu'
