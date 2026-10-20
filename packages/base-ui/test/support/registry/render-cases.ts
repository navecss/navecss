/**
 * The scenes the package's DOM parity rows render, per styled subpath: each closed and, where it has
 * one, open, with the variant props those rows pass. The copy is compared in the same states with the
 * same props.
 */
import type { Props } from '../scenes.ts'

import { EARLIER_SUBPATHS, FEEDBACK_SUBPATHS } from '../feedback.ts'
import { FEEDBACK_PARITY_STATES, VARIANT_PARTS } from '../parity-lists.ts'
import { isOverlay, openProps } from '../states.ts'

export interface ParityCase {
  readonly name: string
  readonly props: Record<string, Props>
  readonly subpath: string
}

const variantProps = (variant: 'ghost' | 'primary'): Record<string, Props> => ({
  ...Object.fromEntries(VARIANT_PARTS.map((part) => [part, { size: 'sm', variant }] as const)),
  Toggle: { size: 'sm' },
  'Toast.Action': { size: 'sm', variant },
  'Toast.Close': { size: 'sm', variant },
})

const VARIANT_SETS = [
  { label: '', props: {} },
  { label: ', with variant and size', props: variantProps('primary') },
  { label: ', with variant ghost and size', props: variantProps('ghost') },
] as const

interface State {
  readonly label: string
  readonly props: Record<string, Props>
}

const REST: readonly State[] = [{ label: 'rendered', props: {} }]

/**
 * The feedback states the package rows render, each with what only the wrapper is given merged into
 * its props: the copy and the package are given the same props.
 */
const FEEDBACK_STATES: Readonly<Record<string, readonly State[]>> = Object.fromEntries(
  Object.entries(FEEDBACK_PARITY_STATES).map(([subpath, states]) => [
    subpath,
    states.map(({ extra, label, props }) => ({ label, props: { ...props, ...extra } })),
  ]),
)

const earlierStates = (subpath: string): readonly State[] =>
  isOverlay(subpath)
    ? [
        { label: 'closed', props: {} },
        { label: 'open', props: openProps() },
      ]
    : REST

const statesOf = (subpath: string): readonly State[] =>
  FEEDBACK_STATES[subpath] ?? earlierStates(subpath)

/**
 * The variant props mean something on the Toast's buttons among the seven, and on every earlier
 * component that has a part of the Button family; the rows pass them to all of the earlier ones.
 */
const variantSetsOf = (
  subpath: string,
): typeof VARIANT_SETS | readonly [(typeof VARIANT_SETS)[0]] =>
  subpath === 'toast' || FEEDBACK_STATES[subpath] === undefined ? VARIANT_SETS : [VARIANT_SETS[0]]

/**
 * The subpaths no row of the package's DOM parity covers: a styled subpath that is in neither list.
 */
export const uncoveredSubpaths = (styled: readonly string[]): string[] => {
  const known = new Set<string>([...EARLIER_SUBPATHS, ...FEEDBACK_SUBPATHS])
  return styled.filter((subpath) => !known.has(subpath))
}

/**
 * Every (scene, state) the comparison covers for the given styled subpaths.
 */
export const parityCases = (styled: readonly string[]): ParityCase[] =>
  styled
    .filter((subpath) => uncoveredSubpaths([subpath]).length === 0)
    .flatMap((subpath) =>
      statesOf(subpath).flatMap((state) =>
        variantSetsOf(subpath).map((variants) => ({
          name: `${subpath}, ${state.label}${variants.label}`,
          props: { ...state.props, ...variants.props },
          subpath,
        })),
      ),
    )

/**
 * How many (scene, state) pairs the package's DOM parity rows have for the given styled subpaths,
 * counted from the rows' own shape: a state for each of an overlay's two, a component's one, or a
 * feedback component's listed ones, times the variant sets that apply.
 */
export const harnessCaseCount = (styled: readonly string[]): number =>
  styled.reduce((total, subpath) => {
    if (uncoveredSubpaths([subpath]).length > 0) return total
    const states = FEEDBACK_STATES[subpath]?.length ?? (isOverlay(subpath) ? 2 : 1)
    return total + states * variantSetsOf(subpath).length
  }, 0)
