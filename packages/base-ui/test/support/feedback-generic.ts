/**
 * The fixtures for the generic of `NavigationMenu.Root`, which Base UI declares from 1.4.0
 * (`<Value = any>`) and not at 1.3.0. They are compiled by `compile` from `type-fixtures.ts`.
 */
import { BASE, EQUAL, type NAVE } from './type-fixtures.ts'

/**
`NavigationMenu.Root` keeps its type parameter: a `value` of type `string` is the type the
`onValueChange` callback is given. Written against `from`, so the same source compiles against Base
UI itself. The first parameter is Base UI's `Value | null`.
 */
export const navigationMenuGenericFixture = (from: typeof BASE | typeof NAVE): string => `
import { NavigationMenu } from '${from}/navigation-menu'
${EQUAL}
export const controlled = (
  <NavigationMenu.Root
    value="a"
    onValueChange={(value) => {
      const noNull: Assert<Equal<NonNullable<typeof value>, string>> = true
      const exact: Assert<Equal<typeof value, string | null>> = true
      void noNull
      void exact
    }}
  />
)
export const uncontrolled = (
  <NavigationMenu.Root
    defaultValue="a"
    onValueChange={(value) => {
      const noNull: Assert<Equal<NonNullable<typeof value>, string>> = true
      void noNull
    }}
  />
)
`

/**
The control for the generic: a stand-in that types `NavigationMenu.Root` as the instantiated
`typeof Base.NavigationMenu.Root<any>` is not equal to Base UI's part (TS2344 on the assertion).
 */
export const instantiatedRootFixture = (): string => `
import { NavigationMenu as BaseNavigationMenu } from '${BASE}/navigation-menu'
${EQUAL}
const standIn = { Root: BaseNavigationMenu.Root as typeof BaseNavigationMenu.Root<any> }
export type RootEquality = Assert<Equal<typeof standIn.Root, typeof BaseNavigationMenu.Root>>
`

/**
The same stand-in without the instantiation, compared with Base UI's part: the positive control,
which compiles.
 */
export const instantiatedRootControlFixture = (): string => `
import { NavigationMenu as BaseNavigationMenu } from '${BASE}/navigation-menu'
${EQUAL}
const standIn = { Root: BaseNavigationMenu.Root }
export type RootEquality = Assert<Equal<typeof standIn.Root, typeof BaseNavigationMenu.Root>>
`
