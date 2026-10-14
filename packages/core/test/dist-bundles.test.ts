/**
 * Traceability: C12 (tsup triple-bundles atoms.ts into atoms.js, cx.js and
 * postcss.js). The atom declaration data must exist once in dist/, with cx.js
 * and postcss.js referencing it rather than carrying their own copy.
 *
 * C12 also covers the other half: cx.js must not reach the declaration data at all, even
 * through a shared chunk. cx() needs a name-to-class map and nothing else, so a consumer who
 * imports only `cx` must not download every atom's CSS declarations as JavaScript.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const read = (file: string): string => readFileSync(path.join(DIST, file), 'utf8')

const RELATIVE_IMPORT = /(?:from|import)\s*['"](\.\/[^'"]+)['"]/g

/**
 * The files an entry file reaches through relative imports, itself included: what a bundler is
 * handed when a consumer imports that entry. Bare specifiers stay external, as they do for a
 * consumer.
 */
const reachableFiles = (entry: string): Set<string> => {
  const seen = new Set<string>()
  const pending = [entry]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const dir = path.posix.dirname(file)
    for (const [, specifier] of read(file).matchAll(RELATIVE_IMPORT)) {
      pending.push(path.posix.join(dir, specifier!))
    }
  }
  return seen
}

const reachableText = (entry: string): string =>
  [...reachableFiles(entry)].map((file) => read(file)).join('\n')

/**
 * A declaration string that only ever appears in the atoms source of truth.
 */
const ATOM_DECLARATION_MARKER = 'container-type'

describe('C12 — the atoms object is bundled once, not three times', () => {
  it('keeps the declaration data out of cx.js', () => {
    expect(read('cx.js')).not.toContain(ATOM_DECLARATION_MARKER)
  })

  it('keeps the declaration data out of postcss.js', () => {
    expect(read('postcss.js')).not.toContain(ATOM_DECLARATION_MARKER)
  })

  it('keeps the declaration data out of everything cx.js imports', () => {
    const reached = reachableText('cx.js')
    // The control: the walk found the module that holds the name map, so a pass is not an
    // empty walk.
    expect(reached).toContain('focusRing')
    expect(reached).not.toContain(ATOM_DECLARATION_MARKER)
  })

  it('still exposes working entry points', () => {
    expect(read('cx.js')).toContain('cx')
    expect(read('postcss.js')).toContain('postcssPlugin')
  })
})
