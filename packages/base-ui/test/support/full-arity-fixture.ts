/**
 * The fixture that names everything the current Base UI declares in a part's type namespace, each
 * generic member with all of its type parameters, so that a type this package leaves out fails on
 * the line that names it.
 */
import type { SubpathTypes } from '../../scripts/wrappers/read-types.ts'

import { accessor, type BASE, importLines, type NAVE, referenceLine } from './type-fixtures.ts'

/**
One line of the fixture, and the reference it makes as a reader would write it
(`Combobox.Root.Props<any, any, any>`).
 */
export interface Reference {
  readonly line: string
  readonly spelling: string
}

/**
Every namespace member of every part, written from the declarations it is given and not narrowed to
anything, with every type parameter a generic member declares written out, the defaulted ones
included. A member the package drops, and a type parameter it drops, each fail on the line that
names them.
 */
export const fullArityReferences = (subpaths: readonly SubpathTypes[]): Reference[] =>
  subpaths.flatMap(({ parts, subpath }) =>
    parts.flatMap((part) =>
      part.members.map(({ name: member, parameters }) => {
        const args = parameters.length === 0 ? '' : `<${parameters.map(() => 'any').join(', ')}>`
        return {
          line: referenceLine(subpath, part, member, args),
          spelling: `${accessor(subpath, part.name)}.${member}${args}`,
        }
      }),
    ),
  )

/**
The fixture as a file: the imports of every subpath, then its references.
 */
export const fullArityFixture = (
  subpaths: readonly SubpathTypes[],
  from: typeof BASE | typeof NAVE,
): string =>
  [
    ...subpaths.flatMap(({ flatTypes, subpath }) => importLines(subpath, flatTypes, from)),
    ...fullArityReferences(subpaths).map(({ line }) => line),
  ].join('\n')
