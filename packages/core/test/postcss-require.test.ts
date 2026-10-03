/**
 * `@navecss/core/postcss` loads through `require()` as well as `import`, so a CommonJS
 * `postcss.config.js` (and Next.js's webpack pipeline, which loads the plugin by its package
 * name) can use it. The other JavaScript subpaths stay import-only.
 *
 * The CommonJS side is held here and nowhere else: `check:pack` runs `attw --profile esm-only`,
 * which ignores the `node16 (from CJS)` column, so a later regression in `postcss.d.cts` would
 * pass it. Both halves run against the built `dist/`, through a consumer-shaped directory that
 * reaches the package by its own name, the way an installed copy is reached.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { packCoreTarball } from './helpers/pack-core.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(HERE, '..')
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

let consumer: string

/** A directory whose `node_modules/@navecss/core` is this package, as an install would put it. */
function makeConsumer(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-core-require-'))
  mkdirSync(path.join(dir, 'node_modules', '@navecss'), { recursive: true })
  symlinkSync(PACKAGE_ROOT, path.join(dir, 'node_modules', '@navecss', 'core'), 'dir')
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  return dir
}

interface Ran {
  readonly status: number
  readonly output: string
}

/** Runs `node` on a CommonJS script inside the consumer, never throwing on a non-zero exit. */
function runCommonJs(script: string): Ran {
  try {
    const stdout = execFileSync(process.execPath, ['--input-type=commonjs', '-e', script], {
      cwd: consumer,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output: stdout }
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string }
    return { status: failed.status ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` }
  }
}

/** Type-checks one `.cts` source as a CommonJS consumer under `nodenext`. */
function typecheckCts(name: string, source: string): Ran {
  writeFileSync(path.join(consumer, name), source)
  writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ['ES2022'],
        types: [],
      },
      files: [name],
    }),
  )
  try {
    const stdout = execFileSync(process.execPath, [TSC, '-p', consumer], {
      cwd: consumer,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output: stdout }
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string }
    return { status: failed.status ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` }
  }
}

beforeAll(() => {
  consumer = makeConsumer()
})

afterAll(() => {
  rmSync(consumer, { recursive: true, force: true })
})

describe('require(@navecss/core/postcss) from a CommonJS file', () => {
  it('returns the plugin function, the same instance import yields', () => {
    const { status, output } = runCommonJs(`
      const viaRequire = require('@navecss/core/postcss')
      import('@navecss/core/postcss').then((ns) => {
        console.log(JSON.stringify({
          type: typeof viaRequire,
          flagged: viaRequire.postcss === true,
          sameAsNamed: viaRequire === ns.navePlugin,
          sameAsDefault: viaRequire === ns.default,
          namespaceKeys: Object.keys(ns).sort(),
        }))
      })
    `)

    expect(status, output).toBe(0)
    expect(JSON.parse(output)).toEqual({
      type: 'function',
      flagged: true,
      sameAsNamed: true,
      sameAsDefault: true,
      namespaceKeys: ['default', 'navePlugin'],
    })
  })

  it('expands @nave through postcss, as in a postcss.config.js', () => {
    const { status, output } = runCommonJs(`
      const postcss = require(${JSON.stringify(createRequire(import.meta.url).resolve('postcss'))})
      const nave = require('@navecss/core/postcss')
      postcss([nave()]).process('.a { @nave flex; }', { from: undefined }).then((result) => {
        console.log(result.css)
      })
    `)

    expect(status, output).toBe(0)
    expect(output).toContain('display: flex')
    expect(output).not.toContain('@nave')
  })

  it.each(['./cx', './atoms'])('still refuses require() of %s', (subpath) => {
    const specifier = `@navecss/core/${subpath.slice(2)}`
    const { status, output } = runCommonJs(`require(${JSON.stringify(specifier)})`)

    expect(status).not.toBe(0)
    expect(output).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED')
  })
})

describe('the CommonJS declarations of @navecss/core/postcss', () => {
  it('type-check a CommonJS consumer that calls the plugin with valid options', () => {
    const { status, output } = typecheckCts(
      'good.cts',
      [
        `import nave = require('@navecss/core/postcss')`,
        `const plugin = nave({ onUnknown: 'warn' })`,
        `const name: string = plugin.postcssPlugin`,
        `export = { plugins: [plugin], name }`,
      ].join('\n'),
    )

    expect(status, output).toBe(0)
  })

  it('reject a bad option (control: the check can fail)', () => {
    const { status, output } = typecheckCts(
      'bad.cts',
      [
        `import nave = require('@navecss/core/postcss')`,
        `const plugin = nave({ onUnknown: 'nope' })`,
        `export = { plugins: [plugin] }`,
      ].join('\n'),
    )

    expect(status).not.toBe(0)
    expect(output).toContain('bad.cts')
    expect(output).toMatch(/TS2345|TS2322/)
  })

  it('reject a property the exported function does not have', () => {
    const { status, output } = typecheckCts(
      'wrong-name.cts',
      [`import nave = require('@navecss/core/postcss')`, `export = nave.notAThing`].join('\n'),
    )

    expect(status).not.toBe(0)
    expect(output).toContain('wrong-name.cts')
  })
})

describe('the CommonJS shim is a pointer, not a second copy of the plugin', () => {
  it('ships dist/postcss.cjs as one require of the ES module and nothing else', () => {
    const shim = readFileSync(path.join(PACKAGE_ROOT, 'dist', 'postcss.cjs'), 'utf8')

    expect(shim.trim()).toBe("module.exports = require('./postcss.js').navePlugin")
  })

  it('packs both CommonJS files into the tarball', { timeout: 120_000 }, () => {
    const { files } = packCoreTarball()

    expect(files).toContain('package/dist/postcss.cjs')
    expect(files).toContain('package/dist/postcss.d.cts')
  })

  it('wires both conditions of ./postcss, each with its own types', () => {
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>
    }

    expect(manifest.exports['./postcss']).toEqual({
      import: { types: './dist/postcss.d.ts', default: './dist/postcss.js' },
      require: { types: './dist/postcss.d.cts', default: './dist/postcss.cjs' },
    })
  })

  it('leaves ./cx and ./atoms import-only', () => {
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, Record<string, unknown>>
    }

    for (const subpath of ['./cx', './atoms']) {
      expect(Object.keys(manifest.exports[subpath]!).toSorted()).toEqual(['import', 'types'])
    }
  })
})
