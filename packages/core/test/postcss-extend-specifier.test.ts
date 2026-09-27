/**
 * AC-directive-core-25: an `extend` module specifier declares itself as a
 * PostCSS dependency and is re-read on change, so a host's persistent cache
 * invalidates correctly. The Next.js webpack/Turbopack fixture rows are out
 * of scope here — they land once a separate, not-yet-merged change to how
 * Next.js and CommonJS load this package's PostCSS entry point ships.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

const PLAIN_ATOMS_FIXTURE = fileURLToPath(
  new URL('./fixtures/extend-specifier/plain-atoms.mjs', import.meta.url),
)

describe('AC-directive-core-25 — an extend specifier is a PostCSS dependency, re-read on change', () => {
  let tmp: string | undefined

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    tmp = undefined
  })

  function writeAtomsModule(color: string): string {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-extend-'))
    const modulePath = path.join(tmp, 'my-atoms.mjs')
    writeFileSync(modulePath, `export default { brand: { declarations: { color: '${color}' } } }\n`)
    return modulePath
  }

  it('resolves the atom and emits a dependency message on every stylesheet, including one with no directive', async () => {
    const modulePath = writeAtomsModule('red')
    const plugin = navePlugin({ extend: modulePath })

    const withDirective = await postcss([plugin]).process('.a { @nave brand; }', {
      from: undefined,
    })
    expect(withDirective.css).toContain('color: red')
    expect(withDirective.messages).toContainEqual(
      expect.objectContaining({ type: 'dependency', file: modulePath }),
    )

    const withoutDirective = await postcss([plugin]).process('.a { color: blue; }', {
      from: undefined,
    })
    expect(withoutDirective.messages).toContainEqual(
      expect.objectContaining({ type: 'dependency', file: modulePath }),
    )
  })

  it('adds no dependency message when extend is an object', async () => {
    const result = await postcss([
      navePlugin({ extend: { brand: { declarations: { color: 'red' } } } }),
    ]).process('.a { @nave brand; }', { from: undefined })

    expect(result.messages.filter((message) => message.type === 'dependency')).toHaveLength(0)
  })

  it('re-reads the module on the same plugin instance once its content changes', async () => {
    const modulePath = writeAtomsModule('red')
    const plugin = navePlugin({ extend: modulePath })

    const first = await postcss([plugin]).process('.a { @nave brand; }', { from: undefined })
    expect(first.css).toContain('color: red')

    writeFileSync(modulePath, "export default { brand: { declarations: { color: 'blue' } } }\n")
    const second = await postcss([plugin]).process('.a { @nave brand; }', { from: undefined })
    expect(second.css).toContain('color: blue')
  })

  it('fails at construction when the specifier does not resolve, naming the specifier and the directory', () => {
    let caught: Error | undefined
    try {
      navePlugin({ extend: './does-not-exist-anywhere.mjs' })
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toContain('does-not-exist-anywhere.mjs')
    expect(caught?.message).toContain(process.cwd())
  })

  it('fails at construction when the specifier resolves to a directory', () => {
    expect(() => navePlugin({ extend: './' })).toThrow(/extend/)
  })

  it('fails at construction when the specifier is empty and resolves to the current directory', () => {
    expect(() => navePlugin({ extend: '' })).toThrow(/extend/)
  })

  it('requires the async API once extend is a specifier (the object form stays synchronous)', () => {
    // A permanent fixture, not a temp file: the sync `.css` getter throws
    // before the background `import()` its own `Once()` kicked off ever
    // settles, so a temp file removed by `afterEach` would race a dangling
    // promise into an unhandled rejection once it lost its target.
    expect(
      () =>
        postcss([navePlugin({ extend: PLAIN_ATOMS_FIXTURE })]).process('.a { color: red; }', {
          from: undefined,
        }).css,
    ).toThrow(/Use process\(css\)\.then/)

    const objectFormResult = postcss([
      navePlugin({ extend: { brand: { declarations: { color: 'red' } } } }),
    ]).process('.a { @nave brand; }', { from: undefined })
    expect(objectFormResult.css).toContain('color: red')
  })
})
