/**
 * AC-base-ui-overlay-completion-51, at the floor run: no key of any namespace the package exports
 * has the value `undefined`. A wrapper that reads a part the installed Base UI lacks exports the
 * key with that value, which a parse of the built modules cannot see when the read is not a
 * literal key (`Reflect.get`).
 */
import { describe, expect, it } from 'vitest'

import { loadNave } from '../support/sources.ts'
import { SINGLE_COMPONENT, SUBPATHS, topName } from '../support/subpaths.ts'
import { runMinor } from '../support/w6-minors.ts'

const nave = await loadNave()

describe.runIf(runMinor().version === '1.3.0')(
  'AC-base-ui-overlay-completion-51: at the floor run, no key of a namespace the package exports is undefined',
  () => {
    it.each(SUBPATHS.filter((subpath) => !SINGLE_COMPONENT.has(subpath)))(
      '%s: every key of the namespace holds a value',
      (subpath) => {
        const keys = Object.entries(nave(subpath) as Record<string, unknown>)
        expect(keys.length).toBeGreaterThan(0)
        expect(
          keys
            .filter(([, value]) => value === undefined)
            .map(([key]) => `${topName(subpath)}.${key}`),
        ).toEqual([])
      },
    )
  },
)
