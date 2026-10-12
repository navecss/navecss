import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateWrappers } from '../scripts/generate-wrappers.ts'
import { filesUnder, SRC_DIR } from './support/dist.ts'
import { COMPLETION_SUBPATHS, SINGLE_COMPONENT, topName } from './support/subpaths.ts'
import { tableP } from './support/table-p.ts'

const byName = (a: string, b: string): number => a.localeCompare(b)

// The line that declares a part in its subpath's parts module. A component with no parts, such as
// `Menubar`, is declared under its own name.
const declaration = (generated: ReadonlyMap<string, string>, part: string): string => {
  const [top = '', name = top] = part.split('.', 2)
  const subpath = COMPLETION_SUBPATHS.find((candidate) => topName(candidate) === top) ?? ''
  const text = generated.get(`${subpath}/parts.generated.ts`) ?? ''
  const prefix = `export const ${SINGLE_COMPONENT.has(subpath) ? top : name}:`
  return text.split('\n').find((line) => line.startsWith(prefix)) ?? ''
}

/**
 * The wrappers of `src/` are written by `scripts/generate-wrappers.ts` from the installed Base UI
 * and the roster, which throws when the roster names a part Base UI does not have. This is what
 * keeps a hand edit, a stale file and a Base UI that gained a part from going unnoticed. To
 * regenerate: `pnpm --filter @navecss/base-ui run generate`.
 */
describe('the generated wrapper modules', () => {
  const generated = generateWrappers()

  it('are the files on disk, and no others', () => {
    const onDisk = filesUnder(SRC_DIR, ['.ts']).filter((file) => file !== 'part.ts')
    expect(onDisk.toSorted(byName)).toEqual(generated.keys().toArray().toSorted(byName))
  })

  it('are the files on disk, byte for byte', () => {
    const stale = generated
      .entries()
      .filter(([file, text]) => readFileSync(path.join(SRC_DIR, file), 'utf8') !== text)
      .map(([file]) => file)
      .toArray()
    expect(stale).toEqual([])
  })

  it('has an index module and a parts module for each of the six', () => {
    const files = COMPLETION_SUBPATHS.flatMap((subpath) => [
      `${subpath}/index.ts`,
      `${subpath}/parts.generated.ts`,
    ])
    expect(files.filter((file) => !generated.has(file))).toEqual([])
  })

  describe('AC-base-ui-overlay-completion-43: every Table P part of the six is built with the helper and its classes', () => {
    const partsOfTheSix = tableP
      .entries()
      .filter(([part]) =>
        COMPLETION_SUBPATHS.some((subpath) => part.split('.', 1)[0] === topName(subpath)),
      )
      .toArray()

    it.each(partsOfTheSix)('%s takes %j', (part, classes) => {
      const line = declaration(generated, part)
      expect(line).toMatch(/\(\) => wrap(?:Variant|Size)?Part\(/)
      expect(line).toContain(`, '${classes.join(' ')}')`)
    })

    it('control: a pass-through is not a wrapped part', () => {
      const line = declaration(generated, 'ContextMenu.Portal')
      expect(line).toContain('export const Portal:')
      expect(line).not.toMatch(/wrap(?:Variant|Size)?Part\(/)
    })
  })
})
