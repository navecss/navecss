/**
 * The type criteria of the feedback and navigation spec for the seven subpaths (Toast, Navigation
 * Menu, Scroll Area, Meter, Progress, Avatar, Separator): the import swap (-02), each export typed
 * from its own namespace (-03) and the variant and size types (-05). Each is a TypeScript fixture
 * written from what the installed Base UI declares and compiled with `tsc --noEmit` against the
 * built package, with Base UI's types at the devDependency version and at the 1.3.0 floor. The
 * seven subpaths are listed in `support/feedback-subpaths.ts`, not read from the package.
 */
import { describe, expect, it } from 'vitest'

import type { BaseUiVersion } from '../scripts/wrappers/read-types.ts'

import {
  instantiatedRootControlFixture,
  instantiatedRootFixture,
  navigationMenuGenericFixture,
} from './support/feedback-generic.ts'
import {
  feedbackEqualityFixture,
  importSwapFixture,
  readFeedbackTypes,
  swapSpecifiers,
} from './support/feedback-types.ts'
import {
  feedbackRefFixture,
  feedbackRejectionFixture,
  feedbackVariantFixture,
} from './support/feedback-variants.ts'
import { BASE, compile, EQUAL, NAVE } from './support/type-fixtures.ts'

const VERSIONS: readonly BaseUiVersion[] = ['current', 'floor']
const MINUTES = 180_000

// The type error TypeScript reports for a type argument list on a type that declares no type
// parameter (TS2315), or on a generic reached through a namespace that is not (TS2707).
const NOT_GENERIC = /fixture\.tsx?\(\d+,\d+\): error TS(?:2315|2707): /

const namedWithString = (from: string): string =>
  `import { NavigationMenu } from '${from}/navigation-menu'\nexport type OfString = NavigationMenu.Root.Props<string>\n`

describe.each(VERSIONS)('the seven subpaths typed at the %s Base UI', (version) => {
  const infos = readFeedbackTypes(version)
  const isNavigationMenuGeneric = version === 'current'

  describe('AC-base-ui-feedback-navigation-02 (extends AC-base-ui-overlay-completion-02): the import swap typechecks for the seven, type-only members included', () => {
    it('reads the seven subpaths, each with its Props and State members, so the fixture names something', () => {
      expect(infos.map(({ subpath }) => subpath)).toEqual([
        'toast',
        'navigation-menu',
        'scroll-area',
        'meter',
        'progress',
        'avatar',
        'separator',
      ])
      for (const info of infos) {
        expect(info.parts.length, `${info.subpath} has parts`).toBeGreaterThan(0)
        expect(info.flatTypes.length, `${info.subpath} has flat type exports`).toBeGreaterThan(0)
      }
      expect(infos.find(({ subpath }) => subpath === 'progress')?.typeMembers).toEqual(['Status'])
    })

    it(
      'control: the unrewritten fixture, with the specifiers of @base-ui/react, compiles',
      { timeout: MINUTES },
      async () => {
        const fixture = importSwapFixture(infos, {
          navigationMenuRootProps: isNavigationMenuGeneric ? 'string' : 'none',
        })
        const result = await compile(`fn-02-control-${version}`, { 'fixture.ts': fixture }, version)
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'compiles the rewritten fixture, with the specifiers of @navecss/base-ui, and exits 0',
      { timeout: MINUTES },
      async () => {
        const fixture = swapSpecifiers(
          importSwapFixture(infos, {
            navigationMenuRootProps: isNavigationMenuGeneric ? 'string' : 'none',
          }),
        )
        expect(fixture).toContain(`${NAVE}/toast`)
        expect(fixture).not.toContain(BASE)
        const result = await compile(`fn-02-${version}`, { 'fixture.ts': fixture }, version)
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'resolves Progress.Status through the wrapper, as the type Base UI declares, and a member Base UI lacks does not resolve',
      { timeout: MINUTES },
      async () => {
        const status = await compile(
          `fn-02-status-${version}`,
          {
            'fixture.ts': [
              `import { Progress as N } from '${NAVE}/progress'`,
              `import { Progress as B } from '${BASE}/progress'`,
              EQUAL,
              'export type Same_ = Assert<Equal<N.Status, B.Status>>',
              "export const progressing: N.Status = 'progressing'",
              "export const complete: N.Status = 'complete'",
              "export const indeterminate: N.Status = 'indeterminate'",
              '// @ts-expect-error a status Base UI does not declare',
              "export const bogus: N.Status = 'finished'",
            ].join('\n'),
          },
          version,
        )
        expect(status.output).toBe('')
        expect(status.code).toBe(0)
        const absent = await compile(
          `fn-02-status-absent-${version}`,
          {
            'fixture.ts': [
              `import { Progress as N } from '${NAVE}/progress'`,
              'export type Nope = N.NotAMember',
            ].join('\n'),
          },
          version,
        )
        expect(absent.output).toContain('TS2694')
        expect(absent.code).not.toBe(0)
      },
    )

    it(
      'reads Separator.Props and Separator.State through the wrapper',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-02-separator-${version}`,
          {
            'fixture.ts': [
              `import { Separator as N } from '${NAVE}/separator'`,
              `import { Separator as B } from '${BASE}/separator'`,
              EQUAL,
              'export type PropsSame = Assert<Equal<N.Props, B.Props>>',
              'export type StateSame = Assert<Equal<N.State, B.State>>',
              "export const state: N.State = { orientation: 'vertical' }",
            ].join('\n'),
          },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it.runIf(isNavigationMenuGeneric)(
      'names NavigationMenu.Root.Props<string> through the wrapper and through Base UI, and both compile',
      { timeout: MINUTES },
      async () => {
        for (const [from, label] of [
          [NAVE, 'wrapper'],
          [BASE, 'base'],
        ] as const) {
          const result = await compile(
            `fn-02-nav-generic-${version}-${label}`,
            { 'fixture.ts': namedWithString(from) },
            version,
          )
          expect(result.output, `${label} at the current run`).toBe('')
          expect(result.code).toBe(0)
        }
      },
    )

    it.runIf(!isNavigationMenuGeneric)(
      'control: NavigationMenu.Root.Props<string> fails at 1.3.0 under the rewritten specifier and the unrewritten one, which declares no type parameter',
      { timeout: MINUTES },
      async () => {
        for (const [from, label] of [
          [NAVE, 'wrapper'],
          [BASE, 'base'],
        ] as const) {
          const result = await compile(
            `fn-02-nav-generic-${version}-${label}`,
            { 'fixture.ts': namedWithString(from) },
            version,
          )
          expect(result.output, `${label} at the floor`).toMatch(NOT_GENERIC)
          expect(result.code).not.toBe(0)
        }
      },
    )

    it('control: the version split is real: NavigationMenu.Root declares a type parameter only at the current run', () => {
      const root = infos
        .find(({ subpath }) => subpath === 'navigation-menu')
        ?.parts.find(({ name }) => name === 'Root')
      expect(root?.callTypeParameters.length).toBe(isNavigationMenuGeneric ? 1 : 0)
      expect(root?.members.find(({ name }) => name === 'Props')?.parameters).toBe(
        isNavigationMenuGeneric ? 1 : 0,
      )
    })
  })

  describe('AC-base-ui-feedback-navigation-03 (extends AC-base-ui-overlay-completion-03): each export of the seven is typed from its own namespace', () => {
    it(
      'types every part outside the Button family and outside Avatar.Root as the Base UI part, and Separator as Base UI Separator',
      { timeout: MINUTES },
      async () => {
        const fixture = feedbackEqualityFixture(infos)
        // The fixture is not empty: it asserts a part of each namespace, the functions and the component.
        expect(fixture).toContain('E_toast_Root =')
        expect(fixture).toContain('E_toast_useToastManager =')
        expect(fixture).toContain('E_toast_createToastManager =')
        expect(fixture).toContain('E_separator_self =')
        expect(fixture).not.toContain('E_toast_Action =')
        expect(fixture).not.toContain('E_toast_Close =')
        expect(fixture).not.toContain('E_avatar_Root =')
        const result = await compile(`fn-03-${version}`, { 'fixture.ts': fixture }, version)
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'control: the instantiated stand-in compares with itself and compiles, so the equality can pass',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-03-instantiated-control-${version}`,
          { 'fixture.ts': instantiatedRootControlFixture() },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it.runIf(isNavigationMenuGeneric)(
      'control: the generic NavigationMenu.Root fixture compiles against Base UI itself',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-03-generic-control-${version}`,
          { 'fixture.tsx': navigationMenuGenericFixture(BASE) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it.runIf(isNavigationMenuGeneric)(
      'keeps the type parameter of NavigationMenu.Root: a value of type string is the callback argument, as string',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-03-generic-${version}`,
          { 'fixture.tsx': navigationMenuGenericFixture(NAVE) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it.runIf(isNavigationMenuGeneric)(
      'control: a wrapper that types NavigationMenu.Root as typeof Base.NavigationMenu.Root<any> reds the equality',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-03-instantiated-${version}`,
          { 'fixture.ts': instantiatedRootFixture() },
          version,
        )
        expect(result.output).toContain('TS2344')
        expect(result.code).not.toBe(0)
      },
    )

    it.runIf(!isNavigationMenuGeneric)(
      'does not compile the generic line at 1.3.0: the part is not generic there',
      () => {
        const root = infos
          .find(({ subpath }) => subpath === 'navigation-menu')
          ?.parts.find(({ name }) => name === 'Root')
        expect(root?.callTypeParameters).toEqual([])
      },
    )
  })

  describe('AC-base-ui-feedback-navigation-05 (supersedes AC-base-ui-overlay-completion-05): the variant and size types', () => {
    it(
      'gives Toast.Action and Toast.Close the props of Base UI plus exactly variant and size, and Avatar.Root the props of Base UI plus exactly size sm, md or lg, with no Base UI size on any Avatar part',
      { timeout: MINUTES },
      async () => {
        const fixture = feedbackVariantFixture(infos)
        const result = await compile(`fn-05-${version}`, { 'fixture.ts': fixture }, version)
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'accepts a ref to the button element on Toast.Action and Toast.Close',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-05-ref-${version}`,
          { 'fixture.ts': feedbackRefFixture(infos) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'control: a variant and a size are errors on NavigationMenu.Trigger and on Avatar.Root, and size lg is an error on Avatar.Root, when the types come from Base UI',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-05-rejections-control-${version}`,
          { 'fixture.ts': feedbackRejectionFixture(infos, BASE) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'rejects a variant and a size on NavigationMenu.Trigger, a variant and size xs on Avatar.Root, size lg on both Toast parts, and accepts size lg on Avatar.Root in the same file',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `fn-05-rejections-${version}`,
          { 'fixture.ts': feedbackRejectionFixture(infos, NAVE) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )
  })
})
