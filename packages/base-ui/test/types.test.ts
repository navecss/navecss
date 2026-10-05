import { describe, expect, it } from 'vitest'

import type { BaseUiVersion } from '../scripts/wrappers/read-types.ts'

import { readBaseUiTypes } from '../scripts/wrappers/read-types.ts'
import {
  assertionFixture,
  compile,
  referenceFixture,
  REJECTED_PROPS,
} from './support/type-fixtures.ts'

const VERSIONS: readonly BaseUiVersion[] = ['current', 'floor']
const MINUTES = 180_000

describe.each(VERSIONS)('the wrapper types at the %s Base UI', (version) => {
  const subpaths = readBaseUiTypes(version)

  describe('AC-base-ui-bridge-02: the import swap is the whole migration for types as well as values', () => {
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
      'compiles unchanged once its specifiers are rewritten to this package',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `02-${version}`,
          { 'fixture.ts': referenceFixture(subpaths, '@navecss/base-ui') },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )
  })

  describe('AC-base-ui-bridge-15: the wrapper types', () => {
    it(
      'keeps every non-variant part typed as the Base UI part, and adds exactly variant and size to the Button family',
      { timeout: MINUTES },
      async () => {
        const result = await compile(
          `15-${version}`,
          { 'fixture.ts': assertionFixture(subpaths, version) },
          version,
        )
        expect(result.output).toBe('')
        expect(result.code).toBe(0)
      },
    )
  })
})

describe('AC-base-ui-bridge-15 and AC-base-ui-bridge-07: the variant and size types', () => {
  it(
    'rejects a size and a variant outside the unions, and a variant on a Toggle',
    { timeout: MINUTES },
    async () => {
      const result = await compile('15-rejected', { 'fixture.ts': REJECTED_PROPS }, 'current')
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
    },
  )
})
