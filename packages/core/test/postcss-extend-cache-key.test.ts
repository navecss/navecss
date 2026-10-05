/**
 * AC-directive-core-25: re-reading an `extend` path specifier on
 * change must not be fooled by a content edit that leaves the file's mtime
 * and size exactly where they were — a size-preserving edit, or a build
 * step that restores an old mtime, both leave `mtime`/`size` alone even
 * though the bytes changed. The cache key is the file's own content hash,
 * not its stat fields.
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

describe('an extend specifier is re-read by content, not by mtime/size', () => {
  let tmp: string | undefined

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    tmp = undefined
  })

  it('sees a same-size content change pinned to the same mtime', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-extend-cache-key-'))
    const modulePath = path.join(tmp, 'my-atoms.mjs')
    const pinnedMtime = new Date('2024-01-01T00:00:00Z')

    writeFileSync(modulePath, "export default { brand: { declarations: { color: 'red__' } } }\n")
    utimesSync(modulePath, pinnedMtime, pinnedMtime)

    const plugin = navePlugin({ extend: modulePath })
    const first = await postcss([plugin]).process('.a { @nave brand; }', { from: undefined })
    expect(first.css).toContain('color: red__')

    // Same byte length as the first write, mtime pinned right back to the
    // same instant: a cache keyed on mtime/size sees no change at all.
    writeFileSync(modulePath, "export default { brand: { declarations: { color: 'blue_' } } }\n")
    utimesSync(modulePath, pinnedMtime, pinnedMtime)

    const second = await postcss([plugin]).process('.a { @nave brand; }', { from: undefined })
    expect(second.css).toContain('color: blue_')
  })
})
