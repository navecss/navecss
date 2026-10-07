/**
 * The used-atoms criteria for the plugin's surface (AC-used-atoms-01, -02, -17, -18, -23): two
 * plugin objects for every options value, one signature, `keep` validated and typed, `cx.dynamic()`
 * with and without the plugin, and a post-order half that never changes a module.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import {
  createProgram,
  flattenDiagnosticMessageText,
  getPreEmitDiagnostics,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
} from 'typescript'
import { parseAst } from 'vite'
import { describe, expect, it, vi } from 'vitest'

import type { Transformer } from './helpers/vite-app.ts'

import { atomClassMap } from '../src/atoms.ts'
import { cx } from '../src/cx.ts'
import { stateFor } from '../src/vite-state.ts'
import { navePlugin } from '../src/vite.ts'
import {
  APP_CSS,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']

const EQUAL = `
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    declare function assertTrue<T extends true>(): T
  `

/**
 * The consumer files the type rows check, by name. They are checked together, in one TypeScript
 * program: a program of its own for each re-reads and re-checks the standard library, Node's types
 * and Vite's declarations every time, which is nearly all of what these rows cost.
 */
const SNIPPETS = {
  configTime: `
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
    `,
  unknownAtomic: `
      import { navePlugin } from '@navecss/core/vite'
      navePlugin({ atomic: 'some' })
    `,
  overloaded: `
      import { navePlugin } from '@navecss/core/vite'
      ${EQUAL}
      declare function overloaded(options: { atomic: 'all' }): ReturnType<typeof navePlugin>[0]
      declare function overloaded(options?: Parameters<typeof navePlugin>[0]): ReturnType<typeof navePlugin>
      const a = overloaded()
      const c = overloaded({ atomic: 'all' })
      assertTrue<Equal<typeof a, typeof c>>()
    `,
  readonlyTuple: `
      import type { Plugin } from 'vite'
      import { navePlugin } from '@navecss/core/vite'
      declare function readonlyTuple(): readonly [ReturnType<typeof navePlugin>[0], ReturnType<typeof navePlugin>[1]]
      const ps: Plugin[] = readonlyTuple()
      void navePlugin
      void ps
    `,
  keepOk: `
      import type { AtomName } from '@navecss/core/cx'
      import { navePlugin } from '@navecss/core/vite'
      navePlugin({ keep: ['flex', 'srOnly'] })
      const k = ['flex', 'grid'] as const
      navePlugin({ keep: k })
      const naveAtoms = ['flex', 'inlineFlex'] as const satisfies readonly AtomName[]
      navePlugin({ keepFor: { '@acme/ui': naveAtoms } })
      navePlugin({ keep: naveAtoms })
    `,
  keepBad: `
      import { navePlugin } from '@navecss/core/vite'
      navePlugin({ keep: ['nope'] })
      navePlugin({ keepFor: { '@acme/ui': ['nope'] } })
    `,
  keepMutable: `
      import type { AtomName } from '@navecss/core/cx'
      declare function scratch(options: { keep?: AtomName[] }): void
      const k = ['flex'] as const
      scratch({ keep: k })
    `,
  dynamicTyped: `
      import { cx, type AtomName } from '@navecss/core/cx'
      const s: string = cx.dynamic('flex')
      declare const x: AtomName | undefined
      cx.dynamic(x)
      cx.dynamic('nope')
      cx.dynamic('flex', 'grid')
      void s
    `,
} as const

type SnippetName = keyof typeof SNIPPETS

/**
 * Type-checks every snippet as a consumer's file against the built `dist/vite.d.ts` and Vite's
 * types, in one program, returning the messages of the diagnostics of each: its own, and any that
 * belong to no snippet (a problem in a declaration file every snippet loads).
 */
function checkSnippets(): Map<SnippetName, string[]> {
  const dir = mkdtempSync(path.join(CORE_ROOT, '.nave-vite-types-'))
  try {
    const files = new Map<string, SnippetName>()
    for (const [name, source] of Object.entries(SNIPPETS)) {
      const file = path.join(dir, `${name}.ts`)
      writeFileSync(
        file,
        source
          .replaceAll('@navecss/core/vite', '../dist/vite.js')
          .replaceAll('@navecss/core/cx', '../dist/cx.js'),
      )
      files.set(file, name as SnippetName)
    }
    const program = createProgram(files.keys().toArray(), {
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      target: ScriptTarget.ESNext,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: ['node'],
      ignoreDeprecations: '6.0',
    })
    const own = new Map<SnippetName, string[]>(
      files.values().map((name): [SnippetName, string[]] => [name, []]),
    )
    const shared: string[] = []
    for (const diagnostic of getPreEmitDiagnostics(program)) {
      const message = `TS${diagnostic.code}: ${flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
      const name = diagnostic.file && files.get(path.normalize(diagnostic.file.fileName))
      if (name) own.get(name)!.push(message)
      else shared.push(message)
    }
    return new Map([...own].map(([name, messages]) => [name, [...messages, ...shared]]))
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

let checked: Map<SnippetName, string[]> | undefined

/**
 * The diagnostics of the snippet `name`; the first call checks them all.
 */
function diagnosticsFor(name: SnippetName): string[] {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- a lazy memo: the first call checks every snippet and later calls reuse the result
  checked ??= checkSnippets()
  return checked.get(name)!
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
    it('builds the default three ways to one tree, and `all` to the tree of the directive half alone', async () => {
      const app = makeUsedApp(
        appFiles({
          'index.html':
            '<!doctype html><p class="nave-hidden">h</p><div id="app"></div><script type="module" src="/src/main.ts"></script>',
          'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
        }),
      )
      try {
        const trees = async (options?: Parameters<typeof navePlugin>[0]): Promise<string> => {
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
        // The directive half alone is the plugin as it was before the atoms were chosen.
        const directiveHalf = JSON.stringify(
          await (async () => {
            const [first] = navePlugin({ atomic: 'all' })
            const built = await buildUsed(app, { transformer, nave: first as never })
            return [built.assets, built.js]
          })(),
        )

        expect(used).toBe(none)
        expect(empty).toBe(none)
        expect(all).toBe(allWithOptions)
        expect(all).toBe(directiveHalf)
        expect(all).not.toBe(none)
        const built = await buildUsed(app, { transformer })
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'hidden'))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('builds `all` to the build of the directive half alone, for a stylesheet that uses @nave', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
          'src/app.css': `${APP_CSS}.card { color: red; @nave flex; }\n`,
        }),
      )
      try {
        const textOf = (built: Awaited<ReturnType<typeof buildUsed>>): string =>
          JSON.stringify([built.assets, built.js])
        const [directiveHalf] = navePlugin({ atomic: 'all' })
        const alone = await buildUsed(app, { transformer, nave: directiveHalf as never })
        const all = await buildUsed(app, { transformer, options: { atomic: 'all' } })

        expect(alone.error).toBeUndefined()
        expect(alone.css).not.toContain('@nave')
        expect(alone.css).toMatch(/\.card\s*\{[^}]*display:\s*flex/)
        expect(textOf(all)).toBe(textOf(alone))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('is inert under all: no define, no noExternal, no re-feed, no worker plugin, no cache file, no module recorded', async () => {
      const cacheDir = mkdtempSync(path.join(tmpdir(), 'nave-inert-'))
      try {
        const [nave, collect] = navePlugin({ atomic: 'all' })
        const handler = vi.fn()
        const cssStep = { name: 'vite:css-post', transform: { handler } }
        const config = {
          root: '/inert',
          command: 'build',
          cacheDir,
          logger: { warn() {} },
          plugins: [cssStep],
        }
        nave.configResolved(config)
        const warn = vi.fn()
        const environment = (
          consumer: string,
        ): { config: { consumer: string }; name: string; plugins: (typeof cssStep)[] } => ({
          name: consumer === 'client' ? 'client' : 'ssr',
          config: { consumer },
          plugins: [cssStep],
        })
        const hostOf = (consumer: string): never =>
          ({
            environment: environment(consumer),
            parse: parseAst,
            warn,
            error: (error: unknown) => {
              throw new Error(String(error))
            },
            addWatchFile() {},
            getCombinedSourcemap: () => ({ mappings: '', sources: [] }),
          }) as never
        const code = `${IMPORT}export const f = (v) => cx(v)\nexport const c = 'nave-flex'\n`

        await nave.renderChunk.call(hostOf('client'), '', { modules: { '/inert/a.css': {} } })
        nave.generateBundle.handler.call(hostOf('client'), {}, {})
        await collect.transform.call(hostOf('client'), code, '/inert/src/a.js')
        collect.transformIndexHtml.handler('<p class="nave-flex">', {
          filename: '/inert/index.html',
        })
        for (const consumer of ['client', 'server']) {
          await collect.buildStart.call(hostOf(consumer))
          await collect.buildEnd.call(hostOf(consumer))
        }
        const state = stateFor('/inert', config)

        expect(nave.config()?.define).toBeUndefined()
        expect(nave.config()?.worker).toBeUndefined()
        expect(nave.configEnvironment('ssr', {})).toBeUndefined()
        expect(cssStep.transform.handler).toBe(handler)
        expect(handler).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled()
        expect(state.modules.size).toBe(0)
        expect(state.pages.size).toBe(0)
        expect(state.emitted).toBeUndefined()
        expect(readdirSync(cacheDir)).toEqual([])
      } finally {
        rmSync(cacheDir, { force: true, recursive: true })
      }
    })

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
    it('compiles a config-time choice, assigns to Plugin[] and keeps one type for every call', () => {
      const diagnostics = diagnosticsFor('configTime')

      expect(diagnostics.join('\n')).toBe('')
    })

    it('fails an unknown atomic value', () => {
      const diagnostics = diagnosticsFor('unknownAtomic')

      expect(diagnostics.some((message) => message.includes('some'))).toBe(true)
    })

    it('control: a return type that depends on the option makes the equality fail', () => {
      const diagnostics = diagnosticsFor('overloaded')

      expect(diagnostics.length).toBeGreaterThan(0)
    })

    it('control: a readonly tuple does not assign to Vite’s Plugin[] (TS4104)', () => {
      const diagnostics = diagnosticsFor('readonlyTuple')

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

    it('names an atom of the consumer’s own in keep when extend is a module, once it has loaded', async () => {
      const app = makeUsedApp(
        appFiles({
          'atoms.mjs': 'export default { brandBox: { declarations: { color: "red" } } }\n',
          'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
        }),
      )
      try {
        const built = await buildUsed(app, {
          options: { extend: './atoms.mjs', keep: ['brandBox' as never] },
        })

        expect(built.error).toContain('keep names "brandBox", an atom of your own')
      } finally {
        app.dispose()
      }
    }, 60_000)

    it.each([
      ['keep: a string', { keep: 'flex' }],
      ['keep: a number', { keep: 42 }],
      ['keep: a Set', { keep: new Set(['flex']) }],
      ['keepFor: a string', { keepFor: 'x-lib' }],
      // eslint-disable-next-line unicorn/no-null -- a literal `null` option value is what is under test
      ['keepFor: null', { keepFor: null }],
      ['keepFor: an entry that is a string', { keepFor: { a: 'flex' } }],
    ])(
      'refuses %s with the same text whether extend is an object or a module path, at the call',
      (_name, options) => {
        const message = (extendOption: unknown): string | undefined => {
          try {
            navePlugin({ extend: extendOption, ...options } as never)
          } catch (error) {
            return (error as Error).message
          }
          return undefined
        }
        const withObject = message({})

        expect(withObject).toMatch(/^navePlugin\(\): (keep|keepFor)/)
        expect(message('./atoms.mjs')).toBe(withObject)
      },
    )

    it('leaves the names a module may define to the module: a path accepts any string at the call', () => {
      expect(() => navePlugin({ extend: './atoms.mjs', keep: ['brandBox' as never] })).not.toThrow()
      expect(() => navePlugin({ extend: {}, keep: ['brandBox' as never] })).toThrow('unknown atom')
    })

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
      const ok = diagnosticsFor('keepOk')
      const bad = diagnosticsFor('keepBad')
      const mutable = diagnosticsFor('keepMutable')

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
    // eslint-disable-next-line unicorn/no-null -- a literal `null` argument is what is under test
    for (const value of ['legacy-card', 'toString', null, undefined, false] as const) {
      expect(cx.dynamic(value as never)).toBe('')
    }
  })

  it('does the same from the built dist/cx.js a consumer installs, which keeps the read of the constant', async () => {
    const file = path.join(CORE_ROOT, 'dist/cx.js')
    const built = (await import(pathToFileURL(file).href)) as { cx: typeof cx }

    expect(built.cx.dynamic('grid')).toBe('nave-grid')
    expect(built.cx.dynamic('toString' as never)).toBe('')
    expect(built.cx.dynamic(false)).toBe('')
    expect(readFileSync(file, 'utf8')).toContain('typeof __NAVE_KEEP_CLASSES__')
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
    const diagnostics = diagnosticsFor('dynamicTyped')

    expect(diagnostics).toHaveLength(2)
    expect(diagnostics.some((message) => message.includes('nope'))).toBe(true)
    expect(diagnostics.some((message) => message.includes('Expected 1 arguments'))).toBe(true)
  })
})

describe('AC-used-atoms-20 — the dev define, from the built package', { timeout: 60_000 }, () => {
  it('evaluates in a context with nothing but a console, maps keep, and logs the not-kept line once per hasOwn call', async () => {
    const built = (await import(pathToFileURL(path.join(CORE_ROOT, 'dist/vite.js')).href)) as {
      navePlugin: typeof navePlugin
    }
    const [nave] = built.navePlugin({ keep: ['flex'] })
    const expression = nave.config(undefined, { command: 'serve' })!.define.__NAVE_KEEP_CLASSES__!
    const logged: string[] = []
    const map = vm.runInNewContext(expression, {
      console: {
        error: (message: string) => {
          logged.push(message)
        },
      },
    }) as Record<string, string>

    expect(Object.keys(map)).toEqual(['flex'])
    expect(map.flex).toBe('nave-flex')
    expect(logged).toEqual([])
    expect(Object.hasOwn(map, 'grid')).toBe(false)
    expect(logged).toEqual([
      '[nave] cx.dynamic("grid") applied no class: "grid" is not kept, so the build does not ship it either. Add "grid" to keep in navePlugin(), or, when a dependency makes the call, to its list in keepFor.',
    ])
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
      const probe = (
        label: string,
      ): { buildEnd(this: { getModuleIds(): IterableIterator<string> }): void; name: string } => ({
        name: `probe-${label}`,
        buildEnd(this: { getModuleIds(): IterableIterator<string> }) {
          modules.set(
            label,
            [...this.getModuleIds()].toSorted((a, b) => Number(a > b) - Number(a < b)),
          )
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
