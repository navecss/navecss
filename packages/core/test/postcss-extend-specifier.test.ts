/**
 * AC-directive-core-25: an `extend` module specifier declares itself as a
 * PostCSS dependency and is re-read on change, so a host's persistent cache
 * invalidates correctly. The Next.js webpack/Turbopack fixture rows are out
 * of scope here — they land once a separate, not-yet-merged change to how
 * Next.js and CommonJS load this package's PostCSS entry point ships.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import type { navePlugin as NavePlugin } from '../src/postcss.ts'

import { navePlugin } from '../src/postcss.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..', 'src')
const PACKAGE_ROOT = path.resolve(HERE, '..')
const POSTCSS_DIST = path.resolve(PACKAGE_ROOT, 'dist', 'postcss.js')

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

  it('validates a path-form extend module on every load, before any output', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-val-'))
    const f = path.join(tmp, 'atoms.mjs')
    writeFileSync(
      f,
      `export default { evil: { declarations: { color: "red; } body { display: none" } } }\n`,
    )
    const plugin = navePlugin({ extend: f })
    for (let i = 0; i < 2; i++) {
      await expect(
        postcss([plugin]).process('.x { @nave evil; }', { from: undefined }),
      ).rejects.toThrow(/declaration value for "color"/)
    }

    writeFileSync(f, `export default { ok: { declarations: { color: 'red' } } }\n`)
    const okResult = await postcss([plugin]).process('.x { @nave ok; }', { from: undefined })
    expect(okResult.css).toBe('.x { color: red; }')

    writeFileSync(f, `export default { ok: { declarations: { color: 'red;' } } }\n`)
    await expect(
      postcss([plugin]).process('.x { @nave ok; }', { from: undefined }),
    ).rejects.toThrow(/declaration value for "color"/)
  })

  it('reds under a mutant that skips validation on a path-form load', async () => {
    const scratch = mkdtempSync(path.join(path.resolve(SRC, '..'), '.nave-extend-load-scratch-'))
    try {
      cpSync(SRC, path.join(scratch, 'src'), { recursive: true })

      const postcssPath = path.join(scratch, 'src', 'postcss.ts')
      const source = readFileSync(postcssPath, 'utf8')
      const broken = source.replace(
        'const snapshot = snapshotExtendMap(value)\n            validateExtendAtoms(snapshot)\n            extend = snapshot',
        'extend = snapshotExtendMap(value)',
      )
      expect(broken).not.toBe(source)
      writeFileSync(postcssPath, broken)

      const { navePlugin: mutantNavePlugin } = (await import(
        `${pathToFileURL(postcssPath).href}?scratch=${Date.now()}`
      )) as { navePlugin: typeof NavePlugin }

      tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-val-mutant-'))
      const f = path.join(tmp, 'atoms.mjs')
      writeFileSync(
        f,
        `export default { evil: { declarations: { color: "red; } body { display: none" } } }\n`,
      )
      const plugin = mutantNavePlugin({ extend: f })

      // The mutant skips validation on every load, so an atom that would
      // otherwise be refused now reaches the generated CSS unrefused.
      const result = await postcss([plugin]).process('.x { @nave evil; }', { from: undefined })
      expect(result.css).toContain('display: none')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('loads a .json path as a JSON module, validated the same as any other map', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-json-'))
    const f = path.join(tmp, 'atoms.json')
    writeFileSync(f, '{"b":{"declarations":{"color":"red"}}}')

    const result = await postcss([navePlugin({ extend: f })]).process('.x { @nave b; }', {
      from: undefined,
    })

    expect(result.css).toBe('.x { color: red; }')
  })

  it('loads a .json path in a real Node process, not only under the test runner’s own module loader', () => {
    // Vitest's own module runner auto-parses a `.json` import regardless of
    // Node's import-attribute rule, so the in-process test above cannot
    // prove this works outside it — a plain `node --input-type=module`
    // child process, importing the built dist entry, can.
    tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-json-child-'))
    const f = path.join(tmp, 'atoms.json')
    writeFileSync(f, '{"b":{"declarations":{"color":"red"}}}')
    const script = [
      `import { navePlugin } from ${JSON.stringify(pathToFileURL(POSTCSS_DIST).href)}`,
      `import postcss from 'postcss'`,
      `const result = await postcss([navePlugin({ extend: ${JSON.stringify(f)} })]).process('.x { @nave b; }', { from: undefined })`,
      `process.stdout.write(result.css)`,
    ].join('\n')

    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
      timeout: 5000,
    })

    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('.x { color: red; }')
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
