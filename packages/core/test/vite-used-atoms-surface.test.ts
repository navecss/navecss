/**
 * The used-atoms criteria for the plugin's surface (AC-used-atoms-01, -02, -17, -18, -23): two
 * plugin objects for every options value, one signature, `keep` validated and typed, `cx.dynamic()`
 * with and without the plugin, and a post-order half that never changes a module.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { atomClassMap } from '../src/atoms.ts'
import { cx } from '../src/cx.ts'
import { navePlugin } from '../src/vite.ts'
import {
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import type { Transformer } from './helpers/vite-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']

/**
 * Type-checks `source` as a consumer's file against the built `dist/vite.d.ts` and Vite's types,
 * returning the messages of every diagnostic.
 */
function diagnosticsFor(source: string, files: Record<string, string> = {}): string[] {
  const dir = mkdtempSync(path.join(CORE_ROOT, '.nave-vite-types-'))
  try {
    mkdirSync(dir, { recursive: true })
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
    const file = path.join(dir, 'consumer.ts')
    writeFileSync(
      file,
      source
        .replaceAll('@navecss/core/vite', '../dist/vite.js')
        .replaceAll('@navecss/core/cx', '../dist/cx.js'),
    )
    const program = ts.createProgram([file], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: ['node'],
      ignoreDeprecations: '6.0',
    })
    return ts
      .getPreEmitDiagnostics(program)
      .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

describe('AC-used-atoms-01 — navePlugin() returns two plugin objects for every options value', () => {
  const calls: [string, Parameters<typeof navePlugin>[0]][] = [
    ['no argument', undefined],
    ['{}', {}],
    ['atomic: used', { atomic: 'used' }],
    ['atomic: all', { atomic: 'all' }],
    [
      'all with keep and keepFor',
      { atomic: 'all', keep: ['grid'], keepFor: { 'x-lib': ['block'] } },
    ],
  ]

  it.each(calls)('%s', (_name, options) => {
    const plugins = navePlugin(options)

    expect(plugins).toHaveLength(2)
    for (const plugin of plugins) expect(Object.getPrototypeOf(plugin)).toBe(Object.prototype)
    const [first, second] = plugins as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(first.name).toBe('nave')
    expect('enforce' in first).toBe(false)
    expect(first.transform).toBeTypeOf('function')
    for (const key of ['configResolved', 'transform', 'hotUpdate', 'generateBundle'])
      expect(first).toHaveProperty(key)
    expect((first.generateBundle as { order: string }).order).toBe('post')
    expect(second.name).toBe('nave:collect')
    expect(second.enforce).toBe('post')
  })

  describe.each(TRANSFORMERS)('built under css.transformer %s', (transformer) => {
    it('builds the default three ways to one tree, and `all` to the tree of a build with no Nave plugin', async () => {
      const app = makeUsedApp(
        appFiles({
          'index.html':
            '<!doctype html><p class="nave-hidden">h</p><div id="app"></div><script type="module" src="/src/main.ts"></script>',
          'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
        }),
      )
      try {
        const trees = async (options?: Parameters<typeof navePlugin>[0]) => {
          const built = await buildUsed(app, { transformer, ...(options && { options }) })
          expect(built.error).toBeUndefined()
          return JSON.stringify([built.assets, built.js])
        }
        const none = await trees()
        const used = await trees({ atomic: 'used' })
        const empty = await trees({})
        const all = await trees({ atomic: 'all' })
        const allWithOptions = await trees({
          atomic: 'all',
          keep: ['grid'],
          keepFor: { 'x-lib': ['block'] },
        })
        const withoutNave = JSON.stringify(
          await (async () => {
            const built = await buildUsed(app, { transformer, nave: [] })
            return [built.assets, built.js]
          })(),
        )

        expect(used).toBe(none)
        expect(empty).toBe(none)
        expect(all).toBe(allWithOptions)
        expect(all).toBe(withoutNave)
        expect(all).not.toBe(none)
        const built = await buildUsed(app, { transformer })
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'hidden'))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('builds green in a plugins list beside another plugin (Vite flattens the array)', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }))
      try {
        const built = await buildUsed(app, { transformer, plugins: [{ name: 'beside' }] })

        expect(built.error).toBeUndefined()
      } finally {
        app.dispose()
      }
    }, 60_000)
  })
})

// Each type-check builds a TypeScript program over Vite's own types, which a loaded runner
// (every test file of the package running at once) takes well past the default timeout to do.
describe(
  'AC-used-atoms-02 — one signature: every call has the same tuple type',
  { timeout: 120_000 },
  () => {
    const EQUAL = `
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    declare function assertTrue<T extends true>(): T
  `

    it('compiles a config-time choice, assigns to Plugin[] and keeps one type for every call', () => {
      const diagnostics = diagnosticsFor(`
      import { defineConfig, type Plugin } from 'vite'
      import type { AtomName } from '@navecss/core/cx'
      import { navePlugin } from '@navecss/core/vite'
      ${EQUAL}
      const a = navePlugin()
      const b = navePlugin({ extend: { brandBox: { declarations: { color: 'red' } } } })
      const c = navePlugin({ atomic: 'all' })
      const d = navePlugin({ atomic: 'used' })
      declare const isBuild: boolean
      const e = navePlugin({ atomic: isBuild ? 'used' : 'all' })
      const k = ['flex'] as const satisfies readonly AtomName[]
      const f = navePlugin({ keep: k, keepFor: { '@acme/ui': k } })
      const ps: Plugin[] = navePlugin()
      defineConfig({ plugins: [a, d, e] })
      assertTrue<Equal<typeof a, typeof c>>()
      assertTrue<Equal<typeof a, typeof b>>()
      assertTrue<Equal<typeof a, typeof d>>()
      assertTrue<Equal<typeof a, typeof e>>()
      assertTrue<Equal<typeof a, typeof f>>()
      assertTrue<Equal<typeof a['length'], 2>>()
      void ps
    `)

      expect(diagnostics.join('\n')).toBe('')
    })

    it('fails an unknown atomic value', () => {
      const diagnostics = diagnosticsFor(`
      import { navePlugin } from '@navecss/core/vite'
      navePlugin({ atomic: 'some' })
    `)

      expect(diagnostics.some((message) => message.includes('some'))).toBe(true)
    })

    it('control: a return type that depends on the option makes the equality fail', () => {
      const diagnostics = diagnosticsFor(`
      import { navePlugin } from '@navecss/core/vite'
      ${EQUAL}
      declare function overloaded(options: { atomic: 'all' }): ReturnType<typeof navePlugin>[0]
      declare function overloaded(options?: Parameters<typeof navePlugin>[0]): ReturnType<typeof navePlugin>
      const a = overloaded()
      const c = overloaded({ atomic: 'all' })
      assertTrue<Equal<typeof a, typeof c>>()
    `)

      expect(diagnostics.length).toBeGreaterThan(0)
    })

    it('control: a readonly tuple does not assign to Vite’s Plugin[] (TS4104)', () => {
      const diagnostics = diagnosticsFor(`
      import type { Plugin } from 'vite'
      import { navePlugin } from '@navecss/core/vite'
      declare function readonlyTuple(): readonly [ReturnType<typeof navePlugin>[0], ReturnType<typeof navePlugin>[1]]
      const ps: Plugin[] = readonlyTuple()
      void navePlugin
      void ps
    `)

      expect(diagnostics.some((message) => message.startsWith('TS4104'))).toBe(true)
    })
  },
)

describe(
  'AC-used-atoms-17 — keep: always emitted, typed readonly, validated under both values',
  { timeout: 120_000 },
  () => {
    const extend = { brandBox: { declarations: { color: 'red' } } }

    it('ships exactly the code’s atoms plus keep', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }))
      try {
        const built = await buildUsed(app, { options: { keep: ['grid', 'focusRing'] } })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid', 'focusRing'))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it.each(['used', 'all'] as const)(
      'refuses an unknown name and an atom of the consumer’s own under %s',
      (atomic) => {
        expect(() => navePlugin({ atomic, keep: ['sr-only' as never] })).toThrow(
          'navePlugin(): keep names an unknown atom "sr-only". Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.',
        )
        expect(() => navePlugin({ atomic, extend, keep: ['brandBox' as never] })).toThrow(
          'navePlugin(): keep names "brandBox", an atom of your own; those have no class, so there is nothing to keep.',
        )
      },
    )

    it('under all, keep writes a dist byte-identical to the same build without it', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }))
      try {
        const plain = await buildUsed(app, { options: { atomic: 'all' } })
        const kept = await buildUsed(app, { options: { atomic: 'all', keep: ['grid'] } })

        expect(JSON.stringify([kept.assets, kept.js])).toBe(
          JSON.stringify([plain.assets, plain.js]),
        )
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('types keep as a readonly list of atom names', () => {
      const ok = diagnosticsFor(`
      import type { AtomName } from '@navecss/core/cx'
      import { navePlugin } from '@navecss/core/vite'
      navePlugin({ keep: ['flex', 'srOnly'] })
      const k = ['flex', 'grid'] as const
      navePlugin({ keep: k })
      const naveAtoms = ['flex', 'inlineFlex'] as const satisfies readonly AtomName[]
      navePlugin({ keepFor: { '@acme/ui': naveAtoms } })
      navePlugin({ keep: naveAtoms })
    `)
      const bad = diagnosticsFor(`
      import { navePlugin } from '@navecss/core/vite'
      navePlugin({ keep: ['nope'] })
      navePlugin({ keepFor: { '@acme/ui': ['nope'] } })
    `)
      const mutable = diagnosticsFor(`
      import type { AtomName } from '@navecss/core/cx'
      declare function scratch(options: { keep?: AtomName[] }): void
      const k = ['flex'] as const
      scratch({ keep: k })
    `)

      expect(ok).toEqual([])
      expect(bad.filter((message) => message.includes('nope'))).toHaveLength(2)
      expect(mutable.some((message) => message.startsWith('TS4104'))).toBe(true)
    })
  },
)

describe('AC-used-atoms-18 — cx.dynamic() without the plugin', { timeout: 120_000 }, () => {
  it('maps an atom through the full map and returns an empty string for anything else', () => {
    expect(cx.dynamic('grid')).toBe(cx('grid'))
    expect(cx.dynamic('grid')).toBe('nave-grid')
    for (const value of ['legacy-card', 'toString', null, undefined, false] as const) {
      expect(cx.dynamic(value as never)).toBe('')
    }
  })

  it('gives nave-grid from a build under all that is run', async () => {
    const app = makeUsedApp(
      appFiles({ 'src/App.ts': `${IMPORT}export const g = cx.dynamic('grid')\n` }),
    )
    try {
      const built = await buildUsed(app, {
        options: { atomic: 'all' },
        build: { lib: { entry: 'src/App.ts', formats: ['es'], fileName: 'app' } },
      })
      const module = (await import(
        `data:text/javascript;base64,${Buffer.from(built.js).toString('base64')}`
      )) as {
        g: string
      }

      expect(built.error).toBeUndefined()
      expect(module.g).toBe('nave-grid')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('is typed as one argument of AtomName or falsy, returning string', () => {
    const diagnostics = diagnosticsFor(`
      import { cx, type AtomName } from '@navecss/core/cx'
      const s: string = cx.dynamic('flex')
      declare const x: AtomName | undefined
      cx.dynamic(x)
      cx.dynamic('nope')
      cx.dynamic('flex', 'grid')
      void s
    `)

    expect(diagnostics).toHaveLength(2)
    expect(diagnostics.some((message) => message.includes('nope'))).toBe(true)
    expect(diagnostics.some((message) => message.includes('Expected 1 arguments'))).toBe(true)
  })
})

describe('AC-used-atoms-23 — the post-order half never changes a module', () => {
  it('returns every module unchanged and adds no module to the build', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/App.ts': `${IMPORT}console.log(cx('flex'), 'nave-grid')\nvoid import('./Lazy.ts')\n`,
        'src/Lazy.ts': "export const l = 'nave-block'\n",
      }),
    )
    try {
      const results: unknown[] = []
      const modules = new Map<string, string[]>()
      const probe = (label: string) => ({
        name: `probe-${label}`,
        buildEnd(this: { getModuleIds(): IterableIterator<string> }) {
          modules.set(label, [...this.getModuleIds()].toSorted())
        },
      })
      const [nave, collect] = navePlugin()
      const watched = {
        ...collect,
        async transform(this: never, code: string, id: string) {
          const result: unknown = await (
            collect.transform as (c: string, i: string) => Promise<unknown>
          ).call(this, code, id)
          results.push(result)
          return result
        },
      }
      const used = await buildUsed(app, { nave: [nave, watched], after: [probe('used')] })
      const all = await buildUsed(app, { options: { atomic: 'all' }, after: [probe('all')] })

      expect(used.error).toBeUndefined()
      expect(all.error).toBeUndefined()
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((result) => result === undefined)).toBe(true)
      expect(modules.get('used')).toEqual(modules.get('all'))
      expect(pathToFileURL(app.root).href).toBeTruthy()
      expect(Object.keys(atomClassMap).length).toBeGreaterThan(0)
    } finally {
      app.dispose()
    }
  }, 60_000)
})
