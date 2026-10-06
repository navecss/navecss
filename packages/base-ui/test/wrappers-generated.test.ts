import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateWrappers } from '../scripts/generate-wrappers.ts'
import { filesUnder, SRC_DIR } from './support/dist.ts'

const byName = (a: string, b: string): number => a.localeCompare(b)

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
})
