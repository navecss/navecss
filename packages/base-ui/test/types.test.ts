import { describe, expect, it } from 'vitest'

import type { BaseUiVersion } from '../scripts/wrappers/read-types.ts'

import { readSharedTypes } from '../scripts/wrappers/floor.ts'
import { readBaseUiTypes } from '../scripts/wrappers/read-types.ts'
import {
  compile,
  equalityFixture,
  referenceFixture,
  refFixture,
  variantFixture,
} from './support/type-fixtures.ts'
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

describe.each(VERSIONS)('the wrapper types at the %s Base UI', (version) => {
  const subpaths = readBaseUiTypes(version)
  // The wrappers declare each part's type namespace with the members the floor Base UI also has, so
  // that their declarations hold at both versions; the rewritten fixture names those.
  const declared = version === 'current' ? readSharedTypes() : subpaths

  describe('AC-base-ui-overlay-completion-02 (supersedes AC-base-ui-bridge-02): the import swap is the whole migration for types as well as values', () => {
    it(
      'control: the unrewritten fixture, importing from Base UI, compiles',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `02-control-${version}`,
          { 'fixture.ts': referenceFixture(subpaths, '@base-ui/react') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

    it(
      'compiles unchanged once its specifiers are rewritten to this package, for the six as well',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `02-${version}`,
          { 'fixture.ts': referenceFixture(declared, '@navecss/base-ui') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )

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
