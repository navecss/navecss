/**
 * The fixtures for the six components the overlay completion adds, and for the variant types of the
 * whole Button family: type errors expected on named lines, the roots that keep their type
 * parameters, and the type-argument and wrong-namespace controls. They build on the fixtures of
 * `type-fixtures.ts` and are compiled by its `compile`.
 */
import type { SubpathTypes } from '../../scripts/wrappers/read-types.ts'

import { BASE, EQUAL, identifier, NAVE, typeOf, VARIANT_PARTS } from './type-fixtures.ts'

/**
The triggers and clears of the six that are not in the Button family: their props gain neither
`variant` nor `size`.
 */
export const NON_FAMILY_PARTS: readonly { part: string; subpath: string }[] = [
  { part: 'Trigger', subpath: 'context-menu' },
  { part: 'Trigger', subpath: 'preview-card' },
  { part: 'Trigger', subpath: 'combobox' },
  { part: 'Clear', subpath: 'combobox' },
  { part: 'Trigger', subpath: 'autocomplete' },
  { part: 'Clear', subpath: 'autocomplete' },
]

const propsOf = (
  subpaths: readonly SubpathTypes[],
  side: 'B' | 'N',
  subpath: string,
  part: string,
): string => {
  const installed = subpaths
    .find((entry) => entry.subpath === subpath)
    ?.parts.find((p) => p.name === part)
  const type = typeOf(side, subpath, part)
  return (installed?.callTypeParameters.length ?? 0) > 0
    ? `Parameters<${type}<string>>[0]`
    : `Parameters<${type}>[0]`
}

const partId = (subpath: string, part: string): string =>
  `${identifier(subpath)}_${part === '.' ? 'self' : part}`

const importsOnly = (specifier: string, subpaths: readonly string[]): string[] =>
  [...new Set(subpaths)].map(
    (subpath) => `import * as N_${identifier(subpath)} from '${specifier}/${subpath}'`,
  )

/**
AC-base-ui-overlay-completion-05's type errors and acceptances, as source with an expected error on every line that must not
typecheck (an unused expectation is itself a compile error, so each line is its own control):
`ghost`, `primary` and a size accepted on every Button-family part; a size outside the union and a
variant outside the union rejected on each; a `variant` rejected on a Toggle.
 */
export const variantTypesFixture = (subpaths: readonly SubpathTypes[]): string => {
  const lines = VARIANT_PARTS.flatMap(({ kind, part, subpath }) => {
    const props = propsOf(subpaths, 'N', subpath, part)
    const id = partId(subpath, part)
    const shared = [
      '// @ts-expect-error size lg is not a size',
      `export const lg_${id}: ${props} = { size: 'lg' }`,
      `export const sm_${id}: ${props} = { size: 'sm' }`,
    ]
    if (kind === 'size') {
      return [
        ...shared,
        '// @ts-expect-error a Toggle takes a size only',
        `export const variant_${id}: ${props} = { variant: 'primary' }`,
        '// @ts-expect-error a Toggle takes a size only, ghost included',
        `export const ghost_${id}: ${props} = { variant: 'ghost' }`,
      ]
    }
    return [
      ...shared,
      '// @ts-expect-error variant danger is not a variant',
      `export const danger_${id}: ${props} = { variant: 'danger' }`,
      `export const ghost_${id}: ${props} = { variant: 'ghost' }`,
      `export const ghostSmall_${id}: ${props} = { variant: 'ghost', size: 'sm' }`,
      `export const primary_${id}: ${props} = { variant: 'primary', size: 'sm' }`,
      `export const secondary_${id}: ${props} = { variant: 'secondary', size: 'md' }`,
    ]
  })
  return [
    ...importsOnly(
      NAVE,
      VARIANT_PARTS.map(({ subpath }) => subpath),
    ),
    ...lines,
  ].join('\n')
}

/**
AC-base-ui-overlay-completion-05's last clause for the six: a `variant` and a `size` are type errors on the triggers and clears
that are not Button-family parts, and the part still takes the props it does declare. Compiled
against Base UI itself, the same lines are errors too, since neither declares either prop.
 */
export const nonFamilyFixture = (
  subpaths: readonly SubpathTypes[],
  from: typeof BASE | typeof NAVE,
): string => {
  const lines = NON_FAMILY_PARTS.flatMap(({ part, subpath }) => {
    const props = propsOf(subpaths, 'N', subpath, part)
    const id = partId(subpath, part)
    return [
      `export const none_${id}: ${props} = {}`,
      '// @ts-expect-error a variant is for the Button family',
      `export const variant_${id}: ${props} = { variant: 'primary' }`,
      '// @ts-expect-error a ghost variant is for the Button family',
      `export const ghost_${id}: ${props} = { variant: 'ghost' }`,
      '// @ts-expect-error a size is for the Button family',
      `export const size_${id}: ${props} = { size: 'sm' }`,
    ]
  })
  return [
    ...importsOnly(
      from,
      NON_FAMILY_PARTS.map(({ subpath }) => subpath),
    ),
    ...lines,
  ].join('\n')
}

/**
AC-base-ui-overlay-completion-03's generic and overloaded roots, as JSX: the Combobox root keeps both type parameters, so the
value type reaches `onValueChange` (an array when `multiple` is true), by type arguments and by
inference from `defaultValue`; the Autocomplete root keeps both overloads; and an Alert Dialog root
takes no `modal`. Written against `from` so the same source compiles against Base UI itself.
 */
export const rootsFixture = (from: typeof BASE | typeof NAVE): string => `
import { AlertDialog } from '${from}/alert-dialog'
import { Autocomplete } from '${from}/autocomplete'
import { Combobox } from '${from}/combobox'
${EQUAL}
export const single = (
  <Combobox.Root<string>
    items={['a', 'b']}
    onValueChange={(value) => {
      const check: Assert<Equal<typeof value, string | null>> = true
      void check
    }}
  />
)
export const multiple = (
  <Combobox.Root<string, true>
    items={['a', 'b']}
    multiple
    onValueChange={(value) => {
      const check: Assert<Equal<typeof value, string[]>> = true
      void check
    }}
  />
)
export const inferredSingle = (
  <Combobox.Root
    defaultValue="a"
    items={['a', 'b']}
    onValueChange={(value) => {
      const check: Assert<Equal<typeof value, string | null>> = true
      void check
    }}
  />
)
export const inferredMultiple = (
  <Combobox.Root
    defaultValue={['a']}
    items={['a', 'b']}
    multiple
    onValueChange={(value) => {
      const check: Assert<Equal<typeof value, string[]>> = true
      void check
    }}
  />
)
export const flat = <Autocomplete.Root items={['a', 'b']} />
export const grouped = <Autocomplete.Root items={[{ value: 'letters', items: ['a', 'b'] }]} />
export const alert = <AlertDialog.Root defaultOpen />
// @ts-expect-error an alert dialog is always modal, so its root takes no modal prop
export const modal = <AlertDialog.Root modal />
`

/**
AC-base-ui-overlay-completion-02's type-argument clause: the roots whose first type parameter has no default are named with
arguments, and, as the control, named with none.
 */
export const typeArgumentsFixture = (from: typeof BASE | typeof NAVE): string => `
import { Autocomplete } from '${from}/autocomplete'
import { Combobox } from '${from}/combobox'
export type Single = Combobox.Root.Props<string>
export type Multiple = Combobox.Root.Props<string, true>
export type AutocompleteProps = Autocomplete.Root.Props<string>
`

/**
AC-base-ui-overlay-completion-02's control: a root's `Props` named without its type argument does not typecheck.
 */
export const missingTypeArgumentFixture = (
  from: typeof BASE | typeof NAVE,
  line: 'autocomplete' | 'combobox',
): string =>
  line === 'combobox'
    ? `import { Combobox } from '${from}/combobox'\nexport type Bare = Combobox.Root.Props\n`
    : `import { Autocomplete } from '${from}/autocomplete'\nexport type Bare = Autocomplete.Root.Props\n`

/**
AC-base-ui-overlay-completion-03's control: a part typed from the wrong namespace is not equal to the part of the right one.
`typed` is the namespace the stand-in takes `Item` from.
 */
export const wrongNamespaceFixture = (typed: 'autocomplete' | 'combobox'): string => `
import { Autocomplete as BaseAutocomplete } from '${BASE}/autocomplete'
import { Combobox as BaseCombobox } from '${BASE}/combobox'
${EQUAL}
const standIn = { Item: ${typed === 'combobox' ? 'BaseCombobox' : 'BaseAutocomplete'}.Item }
export type ItemEquality = Assert<Equal<typeof standIn.Item, typeof BaseAutocomplete.Item>>
`
