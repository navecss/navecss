import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { BaseUiVersion } from '../scripts/wrappers/read-types.ts'

import { readBaseUiTypes } from '../scripts/wrappers/read-types.ts'
import { compile, equalityFixture, refFixture, variantFixture } from './support/type-fixtures.ts'
import { type Reference, typeWalkFixture, typeWalkReferences } from './support/type-walk.ts'
import {
  missingTypeArgumentFixture,
  nonFamilyFixture,
  rootsFixture,
  typeArgumentsFixture,
  variantTypesFixture,
  wrongNamespaceFixture,
} from './support/w4-type-fixtures.ts'

const VERSIONS: readonly BaseUiVersion[] = ['current', 'floor']

// The type error TypeScript reports for a generic type named without its required arguments: a
// generic interface (TS2314) or a generic type alias reached through a namespace (TS2707). It is
// read on the fixture's own line, so an error inside a declaration file does not count.
const MISSING_ARGUMENTS =
  /fixture\.ts\(\d+,\d+\): error TS(?:2314|2707): Generic type '\w+' requires /

// The errors the type walk expects through this package, by version of Base UI, each as
// `<spelling> <code>`.
const EXPECTED_ERRORS: Readonly<Record<BaseUiVersion, readonly string[]>> = {
  current: [
    // A part's own types are declared from the floor Base UI so that the package's declarations
    // compile there. The floor's Root has no `Actions`, and its `Root.Props` takes two type
    // parameters where the current one takes three. Each has a flat name that reaches the same type
    // from the same subpath (`ContextMenuRootActions`, `ComboboxRootProps`). A change of the floor or
    // of the installed Base UI that moves these two moves them here, in the same change as the
    // README and the changeset sentence that name them.
    'ContextMenu.Root.Actions TS2694',
    'Combobox.Root.Props<any, any, any> TS2707',
    // The third and fourth recorded floor exceptions (the feedback and navigation release): the
    // floor gives the Navigation Menu root's Props no type parameter and the namespace no Value, so
    // the dotted spellings are not generic and absent. The flat `NavigationMenuRootProps<string>` and
    // `NavigationMenuRoot.Value<string>` are what the criterion holds, in `feedback-types.test.ts`.
    'NavigationMenu.Root.Props<any> TS2315',
    'NavigationMenu.Root.Value<any> TS2694',
    // Base UI 1.9.0 added an `OpenChangeEventDetails` to the roots of Select, Combobox and
    // Autocomplete, and a `HighlightEventDetails` and `HighlightEventReason` to the Menu's, none of
    // which the floor declares. Each has a flat name from the same subpath
    // (`SelectRootOpenChangeEventDetails`, `MenuRootHighlightEventDetails`).
    'Autocomplete.Root.OpenChangeEventDetails TS2724',
    'Combobox.Root.OpenChangeEventDetails TS2724',
    'Select.Root.OpenChangeEventDetails TS2724',
    'Menu.Root.HighlightEventDetails TS2694',
    'Menu.Root.HighlightEventReason TS2694',
    // The Menu's filtering parts, which Base UI 1.9.0 added as a preview, are left out of the package
    // (`support/left-out.ts`), so their dotted type names are not reached through it. Their flat type
    // names (`MenuInputProps`, `MenuFilter`) still come through.
    'Menu.Clear.Props TS2694',
    'Menu.Clear.State TS2694',
    'Menu.Empty.Props TS2694',
    'Menu.Empty.State TS2694',
    'Menu.FilterProvider.ChangeEventDetails TS2694',
    'Menu.FilterProvider.ChangeEventReason TS2694',
    'Menu.FilterProvider.Props TS2694',
    'Menu.FilterProvider.State TS2694',
    'Menu.Input.Props TS2694',
    'Menu.Input.State TS2694',
    'Menu.List.Props TS2694',
    'Menu.List.State TS2694',
  ],
  // Nothing: every type name the floor Base UI exports compiles through this package.
  floor: [],
}

const byName = (a: string, b: string): number => a.localeCompare(b)

const ERROR = /(?:^|\n)(?:(\S+)\((\d+),\d+\): )?error (TS\d+): /g

/**
Each error of a `tsc` run as `<spelling> <code>`, the spelling being the reference the fixture's own
line makes. An error that is on no reference of the fixture is named by its place, so it is never
mistaken for a listed one.
 */
const errorsOf = (output: string, fixture: string, references: readonly Reference[]): string[] => {
  const lines = fixture.split('\n')
  return output
    .matchAll(ERROR)
    .map(([, file, line, code]) => {
      const spelling =
        file === undefined || path.basename(file) !== 'fixture.ts'
          ? undefined
          : references.find((reference) => reference.line === lines[Number(line) - 1])?.spelling
      return `${spelling ?? `(${file ?? 'no position'}:${line ?? ''})`} ${code}`
    })
    .toArray()
}

describe.each(VERSIONS)('the wrapper types at the %s Base UI', (version) => {
  const subpaths = readBaseUiTypes(version)

  describe('AC-base-ui-feedback-navigation-02 and AC-base-ui-overlay-completion-02 (supersede AC-base-ui-bridge-02): the import swap is the whole migration for types as well as values', () => {
    const references = typeWalkReferences(version)

    it('control: every type name Base UI exports, each generic with all its type parameters, compiles from Base UI itself', async () => {
      const result = await compile(
        `02-control-${version}`,
        { 'fixture.ts': typeWalkFixture(references, '@base-ui/react') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('fails through this package on exactly the expected list, and on nothing else', async () => {
      const fixture = typeWalkFixture(references, '@navecss/base-ui')
      const result = await compile(`02-${version}`, { 'fixture.ts': fixture }, version)
      expect(errorsOf(result.output, fixture, references).toSorted(byName)).toEqual(
        EXPECTED_ERRORS[version].toSorted(byName),
      )
      // A run with no expected error must exit 0, and any other run must not: an empty error list
      // from a compiler that crashed is never a pass.
      expect(result.code === 0).toBe(EXPECTED_ERRORS[version].length === 0)
    })

    it('names every expected error as a line of the fixture, so a listed line cannot be missing from it', () => {
      const spellings = new Set(references.map(({ spelling }) => spelling))
      expect(
        EXPECTED_ERRORS[version]
          .map((error) => error.slice(0, error.lastIndexOf(' ')))
          .filter((spelling) => !spellings.has(spelling)),
      ).toEqual([])
    })

    it('control: the type arguments the roots need compile from Base UI', async () => {
      const result = await compile(
        `02-arguments-control-${version}`,
        { 'fixture.ts': typeArgumentsFixture('@base-ui/react') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('compiles Combobox.Root.Props<string>, Combobox.Root.Props<string, true> and Autocomplete.Root.Props<string> from this package', async () => {
      const result = await compile(
        `02-arguments-${version}`,
        { 'fixture.ts': typeArgumentsFixture('@navecss/base-ui') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it.each([
      ['@base-ui/react', 'combobox'],
      ['@base-ui/react', 'autocomplete'],
      ['@navecss/base-ui', 'combobox'],
      ['@navecss/base-ui', 'autocomplete'],
    ] as const)(
      'control: %s %s Root.Props named with no type argument fails to typecheck, so the type-argument clause is not decorative',
      async (from, line) => {
        const result = await compile(
          `02-no-argument-${version}-${from.replaceAll(/\W/g, '')}-${line}`,
          { 'fixture.ts': missingTypeArgumentFixture(from, line) },
          version,
        )
        expect(result.output).toMatch(MISSING_ARGUMENTS)
        expect(result.code).not.toBe(0)
      },
    )

    it.runIf(version === 'current')(
      'reaches the dropped types through their flat names, and the data attribute names as types, from the same subpath',
      async () => {
        const result = await compile(
          '02-flat-names',
          {
            'fixture.ts': [
              "import type { ContextMenuRootActions } from '@navecss/base-ui/context-menu'",
              "import type { ComboboxRootProps } from '@navecss/base-ui/combobox'",
              "import type { AutocompleteRootOpenChangeEventDetails } from '@navecss/base-ui/autocomplete'",
              "import type { ComboboxRootOpenChangeEventDetails } from '@navecss/base-ui/combobox'",
              "import type { MenuRootHighlightEventDetails, MenuRootHighlightEventReason } from '@navecss/base-ui/menu'",
              "import type { SelectRootOpenChangeEventDetails } from '@navecss/base-ui/select'",
              "import type { DialogPopupDataAttributes } from '@navecss/base-ui/dialog'",
              'export type Actions = ContextMenuRootActions',
              'export type Props = ComboboxRootProps<string, false, { id: string }>',
              'export type AutocompleteOpen = AutocompleteRootOpenChangeEventDetails',
              'export type ComboboxOpen = ComboboxRootOpenChangeEventDetails',
              'export type Highlight = [MenuRootHighlightEventDetails, MenuRootHighlightEventReason]',
              'export type SelectOpen = SelectRootOpenChangeEventDetails',
              // The data attribute names come through as a type only (their values are left out).
              'export type PopupOpen = typeof DialogPopupDataAttributes.open',
            ].join('\n'),
          },
          'current',
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it.runIf(version === 'current')(
      'the data attribute and CSS variable names are types only: a use as a value is a compile error',
      async () => {
        const result = await compile(
          '02-attributes-as-value',
          {
            'fixture.ts': [
              "import { DialogPopupDataAttributes } from '@navecss/base-ui/dialog'",
              "import { TabsIndicatorCssVariables } from '@navecss/base-ui'",
              'export const open = DialogPopupDataAttributes.open',
              'export const sizes = TabsIndicatorCssVariables',
            ].join('\n'),
          },
          'current',
        )
        expect(result.output).toMatch(
          /fixture\.ts\(3,\d+\): error TS1362: 'DialogPopupDataAttributes' cannot be used as a value/,
        )
        expect(result.output).toMatch(
          /fixture\.ts\(4,\d+\): error TS1362: 'TabsIndicatorCssVariables' cannot be used as a value/,
        )
        expect(result.code).not.toBe(0)
      },
    )
  })

  describe('AC-base-ui-feedback-navigation-03 and AC-base-ui-overlay-completion-03 (extend AC-base-ui-bridge-15): each export is typed from its own namespace', () => {
    it('keeps every part outside the Button family typed as the Base UI part of its own namespace, the six included', async () => {
      const result = await compile(
        `03-${version}`,
        { 'fixture.ts': equalityFixture(subpaths) },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('control: the roots fixture compiles against Base UI itself', async () => {
      const result = await compile(
        `03-roots-control-${version}`,
        { 'fixture.tsx': rootsFixture('@base-ui/react') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('keeps Combobox.Root generic in its value and in multiple, keeps both overloads of Autocomplete.Root, and rejects a modal prop on AlertDialog.Root', async () => {
      const result = await compile(
        `03-roots-${version}`,
        { 'fixture.tsx': rootsFixture('@navecss/base-ui') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })
  })

  describe('AC-base-ui-feedback-navigation-05 and AC-base-ui-overlay-completion-05 (supersede the variant clauses of AC-base-ui-bridge-15): the variant types', () => {
    it('gives every Button-family part Base UI props plus exactly variant secondary, primary or ghost and size md or sm, and Base UI declares neither', async () => {
      const result = await compile(
        `05-${version}`,
        { 'fixture.ts': variantFixture(subpaths) },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('accepts a ref to the button element on every Button-family part', async () => {
      const result = await compile(
        `05-ref-${version}`,
        { 'fixture.ts': refFixture(subpaths) },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('accepts ghost on every Button-family part, rejects a size lg and a variant danger on each, and rejects a variant on a Toggle', async () => {
      const result = await compile(
        `05-rejected-${version}`,
        { 'fixture.ts': variantTypesFixture(subpaths) },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('control: a variant and a size are errors on the triggers and clears of the six outside the family when they come from Base UI', async () => {
      const result = await compile(
        `05-non-family-control-${version}`,
        { 'fixture.ts': nonFamilyFixture(subpaths, '@base-ui/react') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })

    it('rejects a variant and a size on ContextMenu.Trigger, PreviewCard.Trigger and the Combobox and Autocomplete Trigger and Clear', async () => {
      const result = await compile(
        `05-non-family-${version}`,
        { 'fixture.ts': nonFamilyFixture(subpaths, '@navecss/base-ui') },
        version,
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    })
  })
})

describe('AC-base-ui-overlay-completion-03: the control for a part typed from the wrong namespace', () => {
  it('control: Autocomplete.Item typed from its own namespace equals Base UI at the current run', async () => {
    const result = await compile(
      'wrong-namespace-control',
      { 'fixture.ts': wrongNamespaceFixture('autocomplete') },
      'current',
    )
    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  })

  it('reds the equality for an Autocomplete.Item typed from the Combobox namespace at the current run', async () => {
    const result = await compile(
      'wrong-namespace',
      { 'fixture.ts': wrongNamespaceFixture('combobox') },
      'current',
    )
    expect(result.output).toContain('TS2344')
    expect(result.code).not.toBe(0)
  })
})
