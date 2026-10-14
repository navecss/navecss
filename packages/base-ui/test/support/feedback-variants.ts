/**
 * The fixtures for the variant and size types of the feedback and navigation spec: the Toast's
 * `Action` and `Close` gain `variant` and `size` as the Button family has them, `Avatar.Root` gains
 * `size` of `'sm' | 'md' | 'lg'`, and `NavigationMenu.Trigger` gains neither. They build on the
 * reader of `feedback-types.ts` and are compiled by `compile` from `type-fixtures.ts`.
 */
import type { FeedbackSubpathTypes } from './feedback-types.ts'

import { feedbackImports, feedbackPropsOf } from './feedback-types.ts'
import { BASE, EQUAL, identifier, NAVE } from './type-fixtures.ts'

const infoOf = (infos: readonly FeedbackSubpathTypes[], subpath: string): FeedbackSubpathTypes => {
  const found = infos.find((candidate) => candidate.subpath === subpath)
  if (found === undefined) {
    throw new Error(`no types for ${subpath}`)
  }
  return found
}

const BUTTON_ADDED = "{ variant?: 'secondary' | 'primary' | 'ghost'; size?: 'md' | 'sm' }"
const AVATAR_ADDED = "{ size?: 'sm' | 'md' | 'lg' }"

/**
The props of a part are Base UI's plus exactly the props added (equal as types are in use, leaving
`ref` out, and with the same property names), and Base UI declares none of `keys`.
 */
const addedAssertions = (
  info: FeedbackSubpathTypes,
  part: string,
  added: string,
  keys: string,
): string[] => {
  const [n, b] = [feedbackPropsOf('N', info, part), feedbackPropsOf('B', info, part)]
  const id = `${identifier(info.subpath)}_${part}`
  return [
    `export type V_${id} = Assert<Same<Omit<${n}, 'ref'>, Omit<${b} & ${added}, 'ref'>>>`,
    `export type N_${id} = Assert<Equal<keyof Omit<${n}, 'ref'>, keyof Omit<${b} & ${added}, 'ref'>>>`,
    `export type K_${id} = Assert<Equal<Extract<keyof ${b}, ${keys}>, never>>`,
  ]
}

/**
The variant and size types of the spec's variant criterion, for the parts that gain them: the props
are Base UI's plus exactly the props added, Base UI declares neither `variant` nor `size` on them,
and no Base UI prop of any Avatar part is a `size` the added one could shadow.
 */
export const feedbackVariantFixture = (infos: readonly FeedbackSubpathTypes[]): string => {
  const [toast, avatar] = [infoOf(infos, 'toast'), infoOf(infos, 'avatar')]
  return [
    ...feedbackImports([toast, avatar]),
    EQUAL,
    ...addedAssertions(toast, 'Action', BUTTON_ADDED, "'variant' | 'size'"),
    ...addedAssertions(toast, 'Close', BUTTON_ADDED, "'variant' | 'size'"),
    ...addedAssertions(avatar, 'Root', AVATAR_ADDED, "'size'"),
    ...['Root', 'Image', 'Fallback'].map(
      (part) =>
        `export type S_${part} = Assert<Equal<'size' extends keyof ${feedbackPropsOf('B', avatar, part)} ? true : false, false>>`,
    ),
  ].join('\n')
}

const rejectedOnTheTrigger = (props: string): string[] => [
  `export const trigger: ${props} = {}`,
  '// @ts-expect-error a variant is for the Button family, and the trigger is not in it',
  `export const triggerVariant: ${props} = { variant: 'primary' }`,
  '// @ts-expect-error a ghost variant is for the Button family, and the trigger is not in it',
  `export const triggerGhost: ${props} = { variant: 'ghost' }`,
  '// @ts-expect-error a size is for the Button family, and the trigger is not in it',
  `export const triggerSize: ${props} = { size: 'sm' }`,
]

const avatarLines = (props: string, from: typeof BASE | typeof NAVE): string[] => [
  '// @ts-expect-error a variant is not a prop of the avatar',
  `export const avatarVariant: ${props} = { variant: 'primary' }`,
  '// @ts-expect-error xs is not an avatar size',
  `export const avatarXs: ${props} = { size: 'xs' }`,
  ...(from === BASE
    ? [
        '// @ts-expect-error Base UI has no size on the avatar',
        `export const avatarLg: ${props} = { size: 'lg' }`,
      ]
    : [
        `export const avatarLg: ${props} = { size: 'lg' }`,
        `export const avatarSm: ${props} = { size: 'sm' }`,
        `export const avatarMd: ${props} = { size: 'md' }`,
      ]),
]

const toastLines = (props: string, part: string): string[] => [
  '// @ts-expect-error lg is an avatar size and not a size of the Button family',
  `export const lg_${part}: ${props} = { size: 'lg' }`,
  '// @ts-expect-error danger is not a variant',
  `export const danger_${part}: ${props} = { variant: 'danger' }`,
  `export const ghost_${part}: ${props} = { variant: 'ghost', size: 'sm' }`,
  `export const primary_${part}: ${props} = { variant: 'primary' }`,
  `export const secondary_${part}: ${props} = { variant: 'secondary', size: 'md' }`,
]

/**
The rejections and acceptances of the spec's variant criterion, as source with an expected error on
every line that must not typecheck (an unused expectation is itself a compile error, so each line is
its own control): a `variant` and a `size` on `NavigationMenu.Trigger`; a `variant` and an `xs`
size on `Avatar.Root`; `lg` on the two Toast parts; and, as the control, `lg` on `Avatar.Root`,
which typechecks. Against Base UI itself the first two groups are errors too, and so is `lg`.
 */
export const feedbackRejectionFixture = (
  infos: readonly FeedbackSubpathTypes[],
  from: typeof BASE | typeof NAVE,
): string => {
  const props = (subpath: string, part: string): string =>
    feedbackPropsOf('N', infoOf(infos, subpath), part)
  const specifier = (subpath: string): string =>
    `import * as N_${identifier(subpath)} from '${from}/${subpath}'`
  return [
    specifier('toast'),
    specifier('avatar'),
    specifier('navigation-menu'),
    ...rejectedOnTheTrigger(props('navigation-menu', 'Trigger')),
    ...avatarLines(props('avatar', 'Root'), from),
    ...(from === NAVE
      ? ['Action', 'Close'].flatMap((part) => toastLines(props('toast', part), part))
      : []),
  ].join('\n')
}

/**
Both Toast parts accept a ref to the button element.
 */
export const feedbackRefFixture = (infos: readonly FeedbackSubpathTypes[]): string => {
  const toast = infoOf(infos, 'toast')
  return [
    "import { createRef } from 'react'",
    `import * as N_toast from '${NAVE}/toast'`,
    ...['Action', 'Close'].map(
      (part) =>
        `export const ref_${part}: ${feedbackPropsOf('N', toast, part)} = { ref: createRef<HTMLButtonElement>() }`,
    ),
  ].join('\n')
}
