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
const MINUTES = 180_000

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
    // Known defects of the first release, not of the floor rule: a type-only member the wrapper
    // does not re-export. A separate fix removes them, and these two lines with them.
    'Field.ValidityData TS2724',
    'Toolbar.Orientation TS2694',
  ],
  floor: [
    // The same two defects, present at the floor too.
    'Field.ValidityData TS2724',
    'Toolbar.Orientation TS2694',
  ],
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

  describe('AC-base-ui-overlay-completion-02 (supersedes AC-base-ui-bridge-02): the import swap is the whole migration for types as well as values', () => {
    const references = typeWalkReferences(version)

    it(
      'control: every type name Base UI exports, each generic with all its type parameters, compiles from Base UI itself',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `02-control-${version}`,
          { 'fixture.ts': typeWalkFixture(references, '@base-ui/react') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'fails through this package on exactly the expected list, and on nothing else',
      { timeout: MINUTES },
      async () => {
        const fixture = typeWalkFixture(references, '@navecss/base-ui')
        const result = await compile(`02-${version}`, { 'fixture.ts': fixture }, version)
        expect(errorsOf(result.output, fixture, references).toSorted(byName)).toEqual(
          EXPECTED_ERRORS[version].toSorted(byName),
        )
        // A run with no expected error must exit 0, and any other run must not: an empty error list
        // from a compiler that crashed is never a pass.
        expect(result.code === 0).toBe(EXPECTED_ERRORS[version].length === 0)
      },
    )

    it('names every expected error as a line of the fixture, so a listed line cannot be missing from it', () => {
      const spellings = new Set(references.map(({ spelling }) => spelling))
      expect(
        EXPECTED_ERRORS[version]
          .map((error) => error.slice(0, error.lastIndexOf(' ')))
          .filter((spelling) => !spellings.has(spelling)),
      ).toEqual([])
    })

    it(
      'control: the type arguments the roots need compile from Base UI',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `02-arguments-control-${version}`,
          { 'fixture.ts': typeArgumentsFixture('@base-ui/react') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'compiles Combobox.Root.Props<string>, Combobox.Root.Props<string, true> and Autocomplete.Root.Props<string> from this package',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `02-arguments-${version}`,
          { 'fixture.ts': typeArgumentsFixture('@navecss/base-ui') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it.each([
      ['@base-ui/react', 'combobox'],
      ['@base-ui/react', 'autocomplete'],
      ['@navecss/base-ui', 'combobox'],
      ['@navecss/base-ui', 'autocomplete'],
    ] as const)(
      'control: %s %s Root.Props named with no type argument fails to typecheck, so the type-argument clause is not decorative',
      { timeout: MINUTES },
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
      'reaches both dropped types through their flat names, from the same subpath',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          '02-flat-names',
          {
            'fixture.ts': [
              "import type { ContextMenuRootActions } from '@navecss/base-ui/context-menu'",
              "import type { ComboboxRootProps } from '@navecss/base-ui/combobox'",
              'export type Actions = ContextMenuRootActions',
              'export type Props = ComboboxRootProps<string, false, { id: string }>',
            ].join('\n'),
          },
          'current',
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )
  })

  describe('AC-base-ui-overlay-completion-03 (extends AC-base-ui-bridge-15): each export is typed from its own namespace', () => {
    it(
      'keeps every part outside the Button family typed as the Base UI part of its own namespace, the six included',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `03-${version}`,
          { 'fixture.ts': equalityFixture(subpaths) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'control: the roots fixture compiles against Base UI itself',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `03-roots-control-${version}`,
          { 'fixture.tsx': rootsFixture('@base-ui/react') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'keeps Combobox.Root generic in its value and in multiple, keeps both overloads of Autocomplete.Root, and rejects a modal prop on AlertDialog.Root',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `03-roots-${version}`,
          { 'fixture.tsx': rootsFixture('@navecss/base-ui') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )
  })

  describe('AC-base-ui-overlay-completion-05 (supersedes the variant clauses of AC-base-ui-bridge-15): the variant types', () => {
    it(
      'gives every Button-family part Base UI props plus exactly variant secondary, primary or ghost and size md or sm, and Base UI declares neither',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `05-${version}`,
          { 'fixture.ts': variantFixture(subpaths) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'accepts a ref to the button element on every Button-family part',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `05-ref-${version}`,
          { 'fixture.ts': refFixture(subpaths) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'accepts ghost on every Button-family part, rejects a size lg and a variant danger on each, and rejects a variant on a Toggle',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `05-rejected-${version}`,
          { 'fixture.ts': variantTypesFixture(subpaths) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'control: a variant and a size are errors on the triggers and clears of the six outside the family when they come from Base UI',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `05-non-family-control-${version}`,
          { 'fixture.ts': nonFamilyFixture(subpaths, '@base-ui/react') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'rejects a variant and a size on ContextMenu.Trigger, PreviewCard.Trigger and the Combobox and Autocomplete Trigger and Clear',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `05-non-family-${version}`,
          { 'fixture.ts': nonFamilyFixture(subpaths, '@navecss/base-ui') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )
  })
})

describe('AC-base-ui-overlay-completion-03: the control for a part typed from the wrong namespace', () => {
  it(
    'control: Autocomplete.Item typed from its own namespace equals Base UI at the current run',
    { timeout: MINUTES },
    async () => {
      const result = await compile(
        'wrong-namespace-control',
        { 'fixture.ts': wrongNamespaceFixture('autocomplete') },
        'current',
      )
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    },
  )

  it(
    'reds the equality for an Autocomplete.Item typed from the Combobox namespace at the current run',
    { timeout: MINUTES },
    async () => {
      const result = await compile(
        'wrong-namespace',
        { 'fixture.ts': wrongNamespaceFixture('combobox') },
        'current',
      )
      expect(result.output).toContain('TS2344')
      expect(result.code).not.toBe(0)
    },
  )
})
