/**
 * AC-consumer-constraints-03: `nave.css-data.json` is a toolchain artifact, never loaded by a
 * browser and never part of what `@navecss/core` emits into a consumer's CSS. This slice adds no
 * source file the build graph touches — `scripts/generate-css-data.ts` is invoked by its own
 * drift test and by hand, never by `scripts/build-css.ts` or `tsup` — so the property this AC
 * asks for reduces to: the built `dist/` (already fresh here, since `test` depends on this
 * package's own `build` per `turbo.json`) carries no reference to the new file, and the package's
 * public `exports` map gained no key for it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '../dist')

function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? listFilesRecursive(full) : [full]
  })
}

describe('AC-consumer-constraints-03: the editor-data file is build-inert', () => {
  it('no built .css or .js file references nave.css-data.json', () => {
    const offenders = listFilesRecursive(DIST)
      .filter((file) => file.endsWith('.css') || file.endsWith('.js'))
      .filter((file) => readFileSync(file, 'utf8').includes('nave.css-data.json'))
    expect(offenders).toEqual([])
  })

  it('the package.json exports map is unchanged by this slice', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(HERE, '../package.json'), 'utf8')) as {
      exports: Record<string, unknown>
    }
    expect(Object.keys(pkg.exports).sort()).toEqual(
      [
        '.',
        './atomic',
        './atoms',
        './cx',
        './layers',
        './no-tokens',
        './package.json',
        './postcss',
        './reset',
      ].sort(),
    )
  })
})
