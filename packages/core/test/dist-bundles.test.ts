/**
 * Traceability: C12 (tsup triple-bundles atoms.ts into atoms.js, cx.js and
 * postcss.js). The atom declaration data must exist once in dist/, with
 * postcss.js and the other entries that need it referencing it rather than carrying their own copy.
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

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

/**
 * The files an entry file reaches through relative imports, itself included: what a bundler is
 * handed from this package when a consumer imports that entry. Bare specifiers are not
 * followed; they name other packages, which the walk does not judge.
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
 * A declaration string that only ever appears in the atoms source of truth: the property name
 * alone also appears in the table of CSS property names, so the marker is a whole declaration.
 */
const ATOM_DECLARATION_MARKER = '"container-type": "inline-size"'

describe('C12 — the atom declarations are bundled once, and cx.js never reaches them', () => {
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

  it('control: the walk reaches the declaration data from postcss.js, which holds none itself', () => {
    expect(read('postcss.js')).not.toContain(ATOM_DECLARATION_MARKER)
    expect(reachableText('postcss.js')).toContain(ATOM_DECLARATION_MARKER)
  })

  it('control: the walk reads a dynamic import and a parent path as imports', () => {
    const text =
      "export { a } from './a.js'\nimport './b.js'\nimport('./c.js')\nimport(\n  \"../d.js\"\n)\n"
    const specifiers = text
      .matchAll(RELATIVE_IMPORT)
      .map(([, specifier]) => specifier)
      .toArray()
    expect(specifiers).toEqual(['./a.js', './b.js', './c.js', '../d.js'])
  })

  it('holds the declaration data in one file of everything the entries reach', () => {
    const manifest = readFileSync(path.join(DIST, '../package.json'), 'utf8')
    const entries = new Set(manifest.matchAll(/"\.\/dist\/([\w-]+\.js)"/g).map(([, file]) => file!))
    expect(entries).toContain('cx.js')
    expect(entries).toContain('bin.js')
    const holders = new Set(
      [...entries]
        .flatMap((entry) => [...reachableFiles(entry)])
        .filter((file) => read(file).includes(ATOM_DECLARATION_MARKER)),
    )
    expect(holders.size).toBe(1)
  })

  it('still exposes working entry points', () => {
    expect(read('cx.js')).toContain('cx')
    expect(read('postcss.js')).toContain('postcssPlugin')
  })
})
