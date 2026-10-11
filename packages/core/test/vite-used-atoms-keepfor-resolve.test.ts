/**
 * AC-used-atoms-53 covers: the file a server loads for an import of a package it leaves external,
 * found by the rules of the package's `exports` map under the server's conditions, as Node finds
 * it (a unit row over the resolver, with the file Node loads as the expected one).
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { RenderContext } from '../src/vite-types.ts'

import { serverFileOf } from '../src/vite-server-resolve.ts'
import { conditionsOf } from '../src/vite-server-takes.ts'

const CONDITIONS = ['node', 'import', 'module-sync', 'default']
const made: string[] = []

/**
 * A project holding `@acme/ui` with `manifest` and `files`, and the path of an importer in it.
 */
function project(
  manifest: Record<string, unknown>,
  files: readonly string[],
): { from: string; root: string } {
  const base = mkdtempSync(path.join(os.tmpdir(), 'nave-resolve-'))
  const root = realpathSync(base)
  made.push(root)
  const directory = path.join(root, 'node_modules/@acme/ui')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: '@acme/ui', ...manifest }),
  )
  for (const file of files) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    writeFileSync(path.join(directory, file), '')
  }
  mkdirSync(path.join(root, 'src'))
  return { from: path.join(root, 'src/entry.ts'), root }
}

/**
 * The file `specifier` names, relative to the package, or `undefined`.
 */
function resolved(
  found: { from: string; root: string },
  specifier: string,
  conditions: readonly string[] = CONDITIONS,
): string | undefined {
  const file = serverFileOf({ conditions, from: found.from, specifier })
  return file === undefined
    ? undefined
    : path.relative(path.join(found.root, 'node_modules/@acme/ui'), file)
}

/**
 * The conditions a server whose bundle is in `format` loads a package under.
 */
function serverConditions(format?: string): string[] {
  return conditionsOf(server(format))
}

/**
 * A server environment whose bundle is in `format`.
 */
function server(format?: string): RenderContext {
  return {
    environment: {
      config: { build: { rolldownOptions: { output: format === undefined ? {} : { format } } } },
    },
  } as unknown as RenderContext
}

afterEach(() => {
  for (const root of made) rmSync(root, { recursive: true, force: true })
  made.length = 0
})

describe('AC-used-atoms-53 - the file a server loads for a package it leaves external', () => {
  it('ranks the patterns of the exports map as Node does: the longer prefix before the star first', () => {
    const found = project({ exports: { './*.js': './one/*.js', './a/*': './two/*' } }, [
      'one/a/x.js',
      'two/x.js',
    ])

    expect(resolved(found, '@acme/ui/a/x.js')).toBe(path.join('two', 'x.js'))
  })

  it('matches a pattern key with an extension to the file the star names', () => {
    const found = project({ exports: { './*.js': './dist/*.js' } }, ['dist/f.js'])

    expect(resolved(found, '@acme/ui/f.js')).toBe(path.join('dist', 'f.js'))
  })

  it('takes the first target of an array that resolves', () => {
    const found = project({ exports: { '.': [{ worker: './w.js' }, './a.js'] } }, ['w.js', 'a.js'])

    expect(resolved(found, '@acme/ui')).toBe('a.js')
  })

  it('takes the first key of a condition object that holds, default included', () => {
    const found = project({ exports: { '.': { default: './d.js', import: './i.js' } } }, [
      'd.js',
      'i.js',
    ])

    expect(resolved(found, '@acme/ui', ['node', 'import'])).toBe('d.js')
  })

  it('uses the conditions it is given and no others', () => {
    const found = project(
      { exports: { '.': { custom: './c.js', node: './n.js', default: './d.js' } } },
      ['c.js', 'n.js', 'd.js'],
    )

    expect(resolved(found, '@acme/ui')).toBe('n.js')
    expect(resolved(found, '@acme/ui', ['custom', ...CONDITIONS])).toBe('c.js')
  })

  it('follows main for a package with no exports map, adding the extension', () => {
    const found = project({ main: './lib/index' }, ['lib/index.js'])

    expect(resolved(found, '@acme/ui')).toBe(path.join('lib', 'index.js'))
  })

  it('returns the real path of a package that is a symbolic link', () => {
    const found = project({ exports: './index.js' }, [])
    const store = path.join(found.root, 'store/ui')
    mkdirSync(store, { recursive: true })
    writeFileSync(path.join(store, 'index.js'), '')
    writeFileSync(
      path.join(store, 'package.json'),
      JSON.stringify({ name: '@acme/ui', exports: './index.js' }),
    )
    rmSync(path.join(found.root, 'node_modules/@acme/ui'), { recursive: true })
    symlinkSync(store, path.join(found.root, 'node_modules/@acme/ui'), 'dir')

    expect(serverFileOf({ conditions: CONDITIONS, from: found.from, specifier: '@acme/ui' })).toBe(
      path.join(store, 'index.js'),
    )
  })

  it('names no file for a subpath the exports map does not hold', () => {
    const found = project({ exports: { '.': './index.js' } }, ['index.js', 'other.js'])

    expect(resolved(found, '@acme/ui/other.js')).toBeUndefined()
  })

  it('ranks the longer key first when two patterns share a prefix', () => {
    const found = project({ exports: { './a/*': './x/*', './a/*.js': './y/*.js' } }, [
      'x/f.js',
      'y/f.js',
    ])

    expect(resolved(found, '@acme/ui/a/f.js')).toBe(path.join('y', 'f.js'))
  })

  it('names no file for a subpath that does not begin with the prefix of a pattern key', () => {
    const found = project({ exports: { './a/*': './x/*' } }, ['x/f.js'])

    expect(resolved(found, '@acme/ui/b/f.js')).toBeUndefined()
  })
})

describe('AC-used-atoms-53 - the conditions a built server loads a package under', () => {
  it('holds module-sync, which Node loads before default', () => {
    const found = project({ exports: { '.': { 'module-sync': './ms.mjs', default: './d.js' } } }, [
      'ms.mjs',
      'd.js',
    ])

    expect(resolved(found, '@acme/ui', serverConditions())).toBe('ms.mjs')
  })

  it('holds import for an ES module server build and require for a CommonJS one', () => {
    const found = project(
      { exports: { '.': { import: './i.js', require: './r.cjs', default: './d.js' } } },
      ['i.js', 'r.cjs', 'd.js'],
    )

    expect(resolved(found, '@acme/ui', serverConditions())).toBe('i.js')
    expect(resolved(found, '@acme/ui', serverConditions('cjs'))).toBe('r.cjs')
  })
})
