/**
 * The last corrections to what the Vite plugin reads and reports: the line-unknown sentence, a
 * class continued past an empty value, a position the cache file never invents, a module the host
 * compiles from TypeScript, expressions nested deeper than a call stack, the specifiers a module
 * imports `cx` through, and the classes a module the build cannot read still writes.
 */
import vuePlugin from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseAst, type PluginOption } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'
import { createExtendSource } from '../src/vite-extend.ts'
import { HANDSHAKE_FILE } from '../src/vite-handshake.ts'
import { resolveUsedOptions } from '../src/vite-options.ts'
import { NOT_PARSED, textRecord, unreadableRecord } from '../src/vite-unread-record.ts'
import { createUsedContext } from '../src/vite-used.ts'
import { assertScalesLinearly } from './helpers/perf-scaling.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  buildUsed,
  type Built,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const UNMAPPED = ' (line unknown: no source map leads from the compiled code to this file)'
const WITHOUT_MAP =
  " (line unknown: this file's compiled code has no source map in this build; with build.sourcemap set in the Vite config, the report gives the line if the source maps then lead back to it)"

/**
 * Reads `code` as an application module.
 */
function read(code: string): ModuleReading {
  return readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: false,
  })
}

/**
 * Builds an app of `modules` with the default plugin.
 */
async function build(
  modules: Record<string, string>,
  settings: Parameters<typeof buildUsed>[1] = {},
): Promise<Built> {
  const app = makeUsedApp(appFiles(modules))
  try {
    return await buildUsed(app, settings)
  } finally {
    app.dispose()
  }
}

describe('AC-used-atoms-34: an inline script of an HTML file is never told to ask for a map', () => {
  const page =
    '<!doctype html><html><body><script type="module">import { cx } from "@navecss/core/cx"\nexport const f = (v) => cx(v)</script></body></html>'

  it.each([false, true])(
    'ends with the second sentence with sourcemap %s',
    async (sourcemap) => {
      const app = makeUsedApp({ 'index.html': page })
      try {
        const built = await buildUsed(app, { build: { sourcemap } })

        const line = built.error!.split('\n').find((text) => text.startsWith('index.html: '))!

        expect(line.endsWith(`the argument is not a literal atom name.${UNMAPPED}`)).toBe(true)
        expect(line).not.toContain(WITHOUT_MAP)
      } finally {
        app.dispose()
      }
    },
    60_000,
  )
})

/**
 * An app module whose `f` returns `expression`.
 */
const module = (expression: string): Record<string, string> => ({
  'src/a.js': `export const f = (on) => ${expression}\n`,
})

describe('AC-used-atoms-31: an empty value ends a class only when what follows it ends it too', () => {
  it.each([
    "`nave-flex${''}-col`",
    "'nave-flex' + (on ? '' : ' x') + '-col'",
    "`nave-flex${on ? '' : ' x'}-col`",
  ])(
    'fails %s with one concatenation problem',
    async (expression) => {
      const built = await build(module(expression))

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('src/a.js')
    },
    60_000,
  )

  it('fails a template that ends in the prefix and an empty substitution when the chain goes on with a name', async () => {
    const built = await build(module("`nave-${''}` + tone"))

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/a.js')
  }, 60_000)

  it('is green when what follows the empty value ends the class, and holds flex', async () => {
    const built = await build(module("'nave-flex' + (on ? '' : ' x') + ' y'"))

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['flex'])
  }, 60_000)

  it('stays green when nothing follows the empty value', async () => {
    const built = await build(module("`nave-flex${on ? ' nave-grid' : ''}`"))

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['flex', 'grid'])
  }, 60_000)

  it("is green for a known string left operand that decides || ('nave-flex' + (' ' || suffix()))", async () => {
    const built = await build(module("'nave-flex' + (' ' || suffix())"))

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['flex'])
  }, 60_000)
})

describe('AC-used-atoms-46: the cache file records no position it does not have', () => {
  it('writes the path alone for a listed package whose template has no source map', async () => {
    const app = makeUsedApp(appFiles({ 'src/uses.ts': "import C from 'ui-vue'\nconsole.log(C)\n" }))
    addPackage(app, 'ui-vue', {
      'index.js': "export { default } from './C.vue'\n",
      'C.vue': `<script setup>\nimport { cx } from '@navecss/core/cx'\nconst props = defineProps(['v'])\n</script>\n\n<template><div :class="cx(props.v)" /></template>\n`,
    })
    try {
      const built = await buildUsed(app, {
        plugins: [vuePlugin()],
        options: { keepFor: { 'ui-vue': ['flex'] } },
      })
      const file = JSON.parse(
        readFileSync(path.join(app.root, '.vite', HANDSHAKE_FILE), 'utf8'),
      ) as { keepFor: Record<string, { unreadable: string[] }> }
      const unreadable = file.keepFor['ui-vue']!.unreadable

      expect(built.error).toBeUndefined()
      expect(unreadable.length).toBeGreaterThan(0)
      expect(unreadable.some((entry) => entry.includes('C.vue'))).toBe(true)
      expect(unreadable.filter((entry) => entry.endsWith(':0:0'))).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-02: a module the host compiles from TypeScript is parsed as TypeScript', () => {
  it('reads a TypeScript module a plugin loads', async () => {
    const virtual: PluginOption = {
      name: 'virtual-ts',
      resolveId(id) {
        return id === 'virtual:ts' ? '\0virtual:ts' : undefined
      },
      load(id) {
        if (id !== '\0virtual:ts') return
        return {
          code: `${IMPORT}const n: string = 'x'\nexport const c = cx('grid') + n\n`,
          moduleType: 'ts',
        }
      },
    }
    const built = await build({ 'src/a.js': "import 'virtual:ts'\n" }, { plugins: [virtual] })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['grid'])
  }, 60_000)

  it('reads TypeScript that Vite does not compile (oxc off)', async () => {
    const built = await build(
      { 'src/a.ts': `${IMPORT}export const c: string = cx('grid')\n` },
      { config: { oxc: false } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['grid'])
  }, 60_000)
})

/**
 * A `cx()` call whose argument is a chain of `size` empty strings joined by `||`, ending in `'flex'`.
 */
const chainOf = (size: number): string =>
  `${IMPORT}export const a = cx(${Array.from({ length: size }, () => "''").join(' || ')} || 'flex')\n`

/**
 * A module with `size` names that each read the one before twice, ending in a call that reads the last.
 */
const doubleReadChain = (size: number): string => {
  const links = Array.from(
    { length: size },
    (_, index) => `const a${index + 1} = on ? a${index} : a${index}`,
  )
  return `${IMPORT}export const f = (on) => {\nconst a0 = 'flex'\n${links.join('\n')}\nreturn ['nave-grid' + a${size}, cx(a${size})]\n}\n`
}

describe('AC-used-atoms-03: an expression nested deeper than a call stack is read', () => {
  it('builds a 2500-term chain of || green, with flex', async () => {
    const built = await build({ 'src/a.js': chainOf(2500) })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['flex'])
  }, 60_000)

  it('reads a chain of || in time proportional to its length', async () => {
    await assertScalesLinearly((size) => {
      const code = chainOf(size)
      const start = performance.now()
      const reading = read(code)
      const spent = performance.now() - start
      expect([...reading.atoms]).toEqual(['flex'])
      return spent
    }, 400)
  }, 120_000)

  it('reads a name bound to a name, 3000 deep, in a concatenation, and a call', () => {
    const names = Array.from({ length: 3000 }, (_, index) => `const b${index + 1} = b${index}`)
    const parenthesised = Array.from(
      { length: 3000 },
      (_, index) => `const p${index + 1} = (p${index})`,
    )
    const code = `${IMPORT}const b0 = ' x'\n${names.join('\n')}\nconst p0 = 'flex'\n${parenthesised.join('\n')}\nexport const s = 'nave-grid' + b3000\nexport const c = cx(p3000)\n`
    const reading = read(code)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(['flex'])
    expect([...reading.classes]).toEqual(['grid'])
  })

  it('reads names that each read the one before twice in time proportional to their number', async () => {
    await assertScalesLinearly((size) => {
      const start = performance.now()
      const reading = read(doubleReadChain(size))
      const spent = performance.now() - start
      expect(reading.problems.map((problem) => problem.kind)).toEqual(['concatenation'])
      return spent
    }, 5)
    const reading = read(doubleReadChain(40))
    expect([...reading.atoms]).toEqual(['flex'])
  }, 120_000)
})

describe('a specifier is judged from the module that writes it', () => {
  const core = '{"private":true,"type":"module","imports":{"#cx":"@navecss/core/cx"}}'
  const dep = {
    'package.json': JSON.stringify({
      name: 'dep-a',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
      imports: { '#cx': './local-cx.js' },
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${IMPORT}import local from '#cx'\nexport const d = [cx('flex'), local]\n`,
    'local-cx.js': 'export default 1\n',
  }

  it('fails an importer whose #cx reaches cx although a dependency maps the same text elsewhere', async () => {
    const app = makeUsedApp({
      ...appFiles({
        'src/main.ts': "import { d } from 'dep-a'\nimport './a.js'\nconsole.log(d)\n",
        'src/a.js': `${IMPORT}import { cx as c2 } from '#cx'\nexport const x = c2('grid')\n`,
      }),
      'package.json': core,
    })
    addPackage(app, 'dep-a', dep)
    try {
      const built = await buildUsed(app)

      expect(built.error).toContain("src/a.js: imports cx from '#cx'.")
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('fails a relative import of the installed cx file in a module that also imports the package', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/a.js': `${IMPORT}import { cx as c2 } from '../node_modules/@navecss/core/dist/cx.js'\nexport const x = [cx('flex'), c2('grid')]\n`,
      }),
      'copy',
    )
    try {
      const built = await buildUsed(app)

      expect(built.error).toContain(
        "src/a.js: imports cx from '../node_modules/@navecss/core/dist/cx.js'.",
      )
    } finally {
      app.dispose()
    }
  }, 60_000)
})

/**
 * A used-atoms context whose `keepFor` lists `ui-lib`.
 */
const context = (): ReturnType<typeof createUsedContext> =>
  createUsedContext(
    resolveUsedOptions({ keepFor: { 'ui-lib': ['flex'] } }),
    createExtendSource(undefined),
  )

describe('AC-used-atoms-17: a module the build cannot read still writes its classes', () => {
  it('keeps the classes of an unreadable module of a listed package', () => {
    const record = unreadableRecord(
      context(),
      {
        code: 'const x = <div class="nave-grid" />',
        id: '/r/node_modules/ui-lib/i.js',
        pkg: 'ui-lib',
      },
      NOT_PARSED,
    )

    expect(record.problems).toEqual([])
    expect(record.suppressed).toHaveLength(1)
    expect([...record.atoms]).toEqual(['grid'])
  })

  it('decodes the strings of a JSON module before it looks for classes', () => {
    const record = textRecord(context(), {
      code: String.raw`{"c":"nave-\u0066lex","d":["a nave-grid"]}`,
      id: '/r/src/data.json',
      moduleType: 'json',
      pkg: undefined,
    })

    expect([...record.atoms].toSorted((a, b) => a.localeCompare(b))).toEqual(['flex', 'grid'])
  })

  it('writes the file nothing else would: a JSON module the build reads names its classes', async () => {
    const data: PluginOption = {
      name: 'json-data',
      resolveId(id) {
        return id === 'virtual:data' ? '\0virtual:data' : undefined
      },
      load(id) {
        return id === '\0virtual:data'
          ? { code: String.raw`{"c":"nave-\u0066lex"}`, moduleType: 'json' }
          : undefined
      },
    }
    const built = await build(
      { 'src/a.js': "import d from 'virtual:data'\nconsole.log(d)\n" },
      { plugins: [data] },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['flex'])
  }, 60_000)
})

describe('AC-used-atoms-17: a data module of any size is read', () => {
  it('reads a JSON module holding 200,000 items and one Nave class', async () => {
    const items = JSON.stringify([...Array.from({ length: 200_000 }, () => 'x'), 'nave-flex'])
    const data: PluginOption = {
      name: 'big-json',
      resolveId(id) {
        return id === 'virtual:big' ? '\0virtual:big' : undefined
      },
      load(id) {
        return id === '\0virtual:big' ? { code: items, moduleType: 'json' } : undefined
      },
    }
    const built = await build(
      { 'src/a.js': "import d from 'virtual:big'\nconsole.log(d.length)\n" },
      { plugins: [data] },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['flex'])
  }, 120_000)
})

describe('AC-used-atoms-31: a long chain that goes on after the prefix is read once', () => {
  it('reads "nave-" + "" + ... + tone in time proportional to its length', async () => {
    await assertScalesLinearly((size) => {
      const code = `export const f = (tone) => 'nave-' + ${Array.from({ length: size }, () => "''").join(' + ')} + tone\n`
      const start = performance.now()
      const reading = read(code)
      const spent = performance.now() - start
      expect(reading.problems.map((problem) => problem.kind)).toContain('concatenation')
      return spent
    }, 300)
  }, 120_000)
})

/**
 * A module of `f`, with `prefix` before its import and `lineBreak` between its lines.
 */
const source = (prefix: string, lineBreak: string): string =>
  `${prefix}${IMPORT.trim()}${lineBreak}export const f = (v) => cx(v)${lineBreak}`

describe('AC-used-atoms-34: a map that differs from the file only by a byte order mark or line breaks', () => {
  const bom = '\u{FEFF}'

  it.each([
    ['a byte order mark', bom, '\n'],
    ['CRLF line breaks', '', '\r\n'],
    ['both', bom, '\r\n'],
  ])(
    'still leads to the file when it differs by %s',
    async (_name, prefix, lineBreak) => {
      const normalizing: PluginOption = {
        name: 'normalizing-load',
        enforce: 'pre',
        load(id) {
          if (!id.endsWith('src/a.js')) return
          return readFileSync(id, 'utf8')
            .replace(/^\u{FEFF}/u, '')
            .replaceAll('\r\n', '\n')
        },
      }
      const app = makeUsedApp(appFiles({ 'src/a.js': source('', '\n') }))
      writeFileSync(path.join(app.root, 'src/a.js'), source(prefix, lineBreak))
      try {
        const built = await buildUsed(app, { plugins: [normalizing], build: { sourcemap: true } })

        expect(built.error).toContain('src/a.js:2:28: cx(v)')
      } finally {
        app.dispose()
      }
    },
    60_000,
  )
})
