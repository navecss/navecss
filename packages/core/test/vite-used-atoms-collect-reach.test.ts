/**
 * What the collector must reach, and what it must not accept: a Vue template whose render
 * function shares its module with the setup return, a module the host cannot parse, a virtual
 * module, an import of `cx` through an alias, an escaped specifier, a `var` written in a loop head
 * or by `eval`, a setup return the author wrote, the spellings a minifier prints for `false` and
 * `undefined`, a Svelte problem's quoted call, and the cost of reading a long module.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte'
import vuePlugin from '@vitejs/plugin-vue'
import { parseAst, type PluginOption } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { recordModule } from '../src/vite-collect-module.ts'
import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'
import { createExtendSource } from '../src/vite-extend.ts'
import { resolveUsedOptions } from '../src/vite-options.ts'
import { buildReport } from '../src/vite-used-report.ts'
import { createUsedContext } from '../src/vite-used.ts'
import { navePlugin } from '../src/vite.ts'
import { assertScalesLinearly } from './helpers/perf-scaling.ts'
import {
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  type Built,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, startDev } from './helpers/vite-app.ts'

/**
 * Reads `code` as an application module; `isVueScript` says whether it is a compiled component's
 * script.
 */
function read(code: string, isVueScript = false): ModuleReading {
  return readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: false,
    isVueScript,
  })
}

/**
 * Builds an app of `modules` with the default plugin.
 */
async function build(
  modules: Record<string, string>,
  settings: Parameters<typeof buildUsed>[1] = {},
  imports?: string[],
): Promise<Built> {
  const app = makeUsedApp(appFiles(modules, imports))
  try {
    return await buildUsed(app, settings)
  } finally {
    app.dispose()
  }
}

/**
 * The `<script setup>` block of a component that imports `cx`; `lang` is the attribute text after `setup`.
 */
const script = (lang: string): string =>
  `<script setup${lang}>\nimport { cx } from '@navecss/core/cx'\nconst v = 'grid'\n</script>\n`

describe('AC-used-atoms-06: a template compiled into the module that returns the setup', () => {
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.NODE_ENV
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  })

  const DEVTOOLS = { __VUE_PROD_DEVTOOLS__: 'true' }
  const TEMPLATE = `<div :class="cx('flex', v)" />`

  const shapes: [string, Record<string, string>, Record<string, string>][] = [
    [
      'an inline template with production devtools',
      DEVTOOLS,
      { 'src/A.vue': `${script('')}<template>${TEMPLATE}</template>\n` },
    ],
    [
      '<template src>',
      {},
      {
        'src/A.vue': `${script('')}<template src="./a.html"></template>\n`,
        'src/a.html': TEMPLATE,
      },
    ],
    [
      '<template src> with production devtools',
      DEVTOOLS,
      {
        'src/A.vue': `${script('')}<template src="./a.html"></template>\n`,
        'src/a.html': TEMPLATE,
      },
    ],
  ]

  it.each(shapes)(
    'a JavaScript <script setup> with %s collects the template’s atoms',
    async (_name, define, files) => {
      process.env.NODE_ENV = 'production'
      const built = await build(
        { ...files, 'src/m.ts': "import S from './A.vue'\nconsole.log(S)\n" },
        { plugins: [vuePlugin()], config: { define } },
        ['src/m.ts'],
      )

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
    },
    60_000,
  )

  it.each(['', ' lang="ts"'])(
    'refuses a template call whose argument is a prop, in a <script setup%s> built with production devtools',
    async (lang) => {
      process.env.NODE_ENV = 'production'
      const built = await build(
        {
          'src/Bad.vue': `<script setup${lang}>\nimport { cx } from '@navecss/core/cx'\nconst props = defineProps({ variant: String })\n</script>\n<template><div :class="cx(props.variant)" /></template>\n`,
        },
        { plugins: [vuePlugin()], config: { define: DEVTOOLS } },
      )

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('src/Bad.vue:')
      expect(built.error).toContain('cx(props.variant): the argument is not a literal atom name.')
    },
    60_000,
  )

  it.each(['', ' lang="ts"'])(
    'gives the dev server’s error for that call in a <script setup%s>',
    async (lang) => {
      process.env.NODE_ENV = 'development'
      const app = makeUsedApp(
        appFiles(
          {
            'src/Bad.vue': `<script setup${lang}>\nimport { cx } from '@navecss/core/cx'\nconst props = defineProps({ variant: String })\n</script>\n<template><div :class="cx(props.variant)" /></template>\n`,
          },
          ['src/Bad.vue'],
        ),
      )
      try {
        const server = await startDev(appConfig(app.root, 'postcss', [vuePlugin(), navePlugin()]))
        try {
          await expect(server.transformRequest('/src/Bad.vue')).rejects.toThrow(
            'cx(props.variant): the argument is not a literal atom name.',
          )
        } finally {
          await server.close()
        }
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  const SSR_MODES: [string, string, Record<string, string>][] = [
    ['plain JavaScript', '', {}],
    ['JavaScript with production devtools', '', DEVTOOLS],
    ['TypeScript', ' lang="ts"', {}],
    ['TypeScript with production devtools', ' lang="ts"', DEVTOOLS],
  ]

  it.each(SSR_MODES)(
    'refuses a template call compiled apart from setup() in a server build: %s',
    async (_name, lang, define) => {
      process.env.NODE_ENV = 'production'
      const built = await build(
        {
          'src/Bad.vue': `<script setup${lang}>\nimport { cx } from '@navecss/core/cx'\nconst props = defineProps({ variant: String })\n</script>\n<template src="./bad.html"></template>\n`,
          'src/bad.html': '<div :class="cx(props.variant)" />',
          'src/entry.ts': "import Bad from './Bad.vue'\nexport default Bad\n",
        },
        { plugins: [vuePlugin()], build: { ssr: 'src/entry.ts' }, config: { define } },
        [],
      )

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('src/bad.html:')
      expect(built.error).toContain('cx(props.variant): the argument is not a literal atom name.')
    },
    60_000,
  )

  it('does not take a template-local $setup for the render function’s', async () => {
    process.env.NODE_ENV = 'production'
    const built = await build(
      {
        'src/A.vue': `<script setup lang="ts">\nimport { cx } from '@navecss/core/cx'\nconst items = [{ cx: (v: string) => v }]\n</script>\n<template><div :class="cx('flex')"><i v-for="$setup in items" :title="$setup.cx(String(1))" /></div></template>\n`,
        'src/m.ts': "import S from './A.vue'\nconsole.log(S)\n",
      },
      { plugins: [vuePlugin()], config: { define: DEVTOOLS } },
      ['src/m.ts'],
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)
})

describe('the setup return is the compiler’s own', () => {
  it('is refused when the author names a nested object __returned__ and exposes cx from it', () => {
    const code = `${IMPORT}const _sfc_main = { setup() { function make() { const __returned__ = { get cx() { return cx } }; return __returned__ } return { make } } }\nexport default _sfc_main\n`

    expect(read(code, true).problems.map((problem) => problem.kind)).toEqual(['reference'])
  })

  it('is read when it is declared directly in the component’s setup()', () => {
    const code = `${IMPORT}const _sfc_main = { setup(__props) { const __returned__ = { get cx() { return cx } }; return __returned__ } }\nexport default _sfc_main\n`
    const reading = read(code, true)

    expect(reading.problems).toEqual([])
    expect(reading.exposes.get('cx')).toEqual({ kind: 'cx' })
  })
})

describe('a module the host cannot parse', () => {
  it('reads TypeScript that reaches the build unconverted, as the language its module type names', async () => {
    const built = await build(
      {
        'src/a.ts': `${IMPORT}const n: string = 'x'\nexport const a = cx('grid')\nconsole.log(a, n)\n`,
      },
      { config: { oxc: false } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['grid'])
  })

  it('reads a module the TypeScript transform is told to leave', async () => {
    const built = await build(
      {
        'src/legacy/c.ts': `${IMPORT}const n: string = 'x'\nexport const c = cx('gap')\nconsole.log(c, n)\n`,
      },
      { config: { oxc: { exclude: [/legacy/] } } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(['gap'])
  })

  it('control: with the default TypeScript transform the same module is read', async () => {
    const built = await build({
      'src/a.ts': `${IMPORT}const n: string = 'x'\nexport const a = cx('grid')\nconsole.log(a, n)\n`,
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  })
})

/**
 * A plugin that serves `code` for the virtual module `virtual:ui`, under the module id `id`.
 */
const virtualPlugin = (id: string, code: string): PluginOption => ({
  name: 'virtual-ui',
  resolveId(source) {
    return source === 'virtual:ui' ? id : undefined
  },
  load(loaded) {
    return loaded === id ? code : undefined
  },
})

describe('a virtual module', () => {
  const entry = { 'src/a.js': "import { c } from 'virtual:ui'\nconsole.log(c)\n" }

  it.each(['\0virtual:ui', 'virtual:ui'])(
    'is read for the atoms its cx() calls name, whatever its id (%j)',
    async (id) => {
      const built = await build(entry, {
        plugins: [virtualPlugin(id, `${IMPORT}export const c = cx('grid')\n`)],
      })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
    },
    60_000,
  )

  it('is read for the Nave classes it writes whole', async () => {
    const built = await build(entry, {
      plugins: [virtualPlugin('\0virtual:ui', "export const c = 'nave-grid'\n")],
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  }, 60_000)

  it('has its problem reported under the id the host gave it', async () => {
    const built = await build(entry, {
      plugins: [virtualPlugin('\0virtual:ui', `${IMPORT}export const c = (v) => cx(v)\n`)],
    })

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toMatch(/\\0virtual:ui:2:\d+: cx\(v\): the argument is not a literal/)
  }, 60_000)
})

describe('an import of cx through an alias', () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ['#cx', "import { cx } from '#cx'", { '#cx': '@navecss/core/cx' }],
    [
      '@nave/cx',
      "import { cx } from '@nave/cx'",
      [{ find: /^@nave\//, replacement: '@navecss/core/' }] as never,
    ],
  ]

  it.each(cases)(
    'fails the build, naming the importer and the specifier %s',
    async (specifier, importLine, alias) => {
      const built = await build(
        { 'src/a.js': `${importLine}\nexport const a = cx('grid')\nconsole.log(a)\n` },
        { config: { resolve: { alias } } },
      )

      expect(built.error).toBeDefined()
      expect(built.error).toContain(`src/a.js: imports cx from '${specifier}'`)
      expect(built.error).toContain("Import cx from '@navecss/core/cx' directly")
    },
    60_000,
  )

  it('fails the same way for a dynamic import through the alias', async () => {
    const built = await build(
      { 'src/a.js': "export const a = import('#cx')\nconsole.log(a)\n" },
      { config: { resolve: { alias: { '#cx': '@navecss/core/cx' } } } },
    )

    expect(built.error).toContain("src/a.js: imports cx from '#cx'")
  }, 60_000)

  const aliasConfig = { resolve: { alias: { '#cx': '@navecss/core/cx' } } }

  it('fails when a comment in the importer holds the package specifier', async () => {
    const built = await build(
      {
        'src/a.js': `// cx is @navecss/core/cx, under another name\nimport { cx } from '#cx'\nexport const a = cx('grid')\nconsole.log(a)\n`,
      },
      { config: aliasConfig },
    )

    expect(built.error).toContain("src/a.js: imports cx from '#cx'")
  }, 60_000)

  it('fails when the importer also imports cx by the package specifier', async () => {
    const built = await build(
      {
        'src/a.js': `${IMPORT}import { cx as c2 } from '#cx'\nexport const a = [cx('flex'), c2('grid')]\nconsole.log(a)\n`,
      },
      { config: aliasConfig },
    )

    expect(built.error).toContain("src/a.js: imports cx from '#cx'")
    expect(built.error).not.toContain("from '@navecss/core/cx'.")
  }, 60_000)

  it('fails when a module worker imports cx through the alias', async () => {
    const built = await build(
      {
        'src/a.js':
          "const w = new Worker(new URL('./w.js', import.meta.url), { type: 'module' })\nconsole.log(w)\n",
        'src/w.js': "import { cx } from '#cx'\npostMessage(cx('grid'))\n",
      },
      { config: aliasConfig },
      ['src/a.js'],
    )

    expect(built.error).toContain("src/w.js: imports cx from '#cx'")
  }, 60_000)

  it('control: an import by the package specifier is read and builds', async () => {
    const built = await build({
      'src/a.js': `${IMPORT}export const a = cx('grid')\nconsole.log(a)\n`,
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  }, 60_000)
})

describe('a specifier written with an escape', () => {
  it('is read as the string it spells', async () => {
    const built = await build({
      'src/a.js':
        "import { cx } from '@navecss\\u002Fcore/cx'\nexport const a = cx('grid')\nconsole.log(a)\n",
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  }, 60_000)
})

describe('a var is written by every loop head that redeclares it', () => {
  it.each([
    ['for...of', "var k = 'flex'\nfor (var k of ['grid']) {}\nexport const a = cx(k)"],
    ['for...in', "var k = 'flex'\nfor (var k in { grid: 1 }) {}\nexport const a = cx(k)"],
    [
      'for...of in a function',
      "export function f(list) { var k = 'flex'; for (var k of list) {} return cx(k) }",
    ],
    [
      'a destructuring declarator',
      "var k = 'flex'\nvar { k } = { k: 'grid' }\nexport const a = cx(k)",
    ],
  ])('refuses a call whose argument a %s rewrites', (_name, body) => {
    const reading = read(`${IMPORT}${body}\n`)

    expect(reading.problems.map((problem) => problem.kind)).toEqual(['argument'])
  })

  it('control: a var declared again with no value is still written once', () => {
    const reading = read(`${IMPORT}var k = 'flex'\nvar k\nexport const a = cx(k)\n`)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(['flex'])
  })
})

describe('a direct eval may write any binding it can see', () => {
  it('refuses a call whose argument a let holds when the module calls eval', () => {
    const reading = read(`${IMPORT}let m = 'flex'\neval("m = 'grid'")\nexport const a = cx(m)\n`)

    expect(reading.problems.map((problem) => problem.kind)).toEqual(['argument'])
  })

  it.each([
    ['a const', "const n = 'flex'\neval('1')\nexport const a = cx(n)"],
    [
      'a const, with the eval in a nested function',
      "const n = 'flex'\nexport function g(s) { return eval(s) }\nexport const a = cx(n)",
    ],
  ])('reads %s the eval cannot assign', (_name, body) => {
    const reading = read(`${IMPORT}${body}\n`)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(['flex'])
  })

  it.each([
    [
      'a let above a nested function that calls eval',
      "let m = 'flex'\nexport function g(s) { return eval(s) }\nexport const a = cx(m)",
    ],
    [
      'a var of the function that calls eval',
      "export function f(s) { var m = 'flex'; eval(s); return cx(m) }",
    ],
  ])('control: still refuses %s', (_name, body) => {
    const reading = read(`${IMPORT}${body}\n`)

    expect(reading.problems.map((problem) => problem.kind)).toEqual(['argument'])
  })

  it('control: an indirect eval and a local named eval write nothing', () => {
    const indirect = read(`${IMPORT}const m = 'flex';\n(0, eval)('1');\nexport const a = cx(m)\n`)
    const local = read(
      `${IMPORT}const m = 'flex'\nexport function f(eval) { return eval('1') }\nexport const a = cx(m)\n`,
    )

    expect(indirect.problems).toEqual([])
    expect(local.problems).toEqual([])
  })
})

describe('AC-used-atoms-08: the spellings a minifier prints for false and undefined', () => {
  it.each([
    ['!1', 'cx(on ? "grid" : !1)', ['grid']],
    ['void 0', 'cx(on ? "block" : void 0)', ['block']],
    ['void 0 as an argument', 'cx("gap", void 0)', ['gap']],
  ])('%s resolves as the falsy value it stands for', (_name, call, expected) => {
    const reading = read(`${IMPORT}export const f = (on) => ${call}\n`)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(expected)
  })

  it('resolves a var that holds !1 or void 0 as falsy too', () => {
    const reading = read(
      `${IMPORT}var t = !1, u = void 0\nexport const f = () => cx(t, u, 'flex')\n`,
    )

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(['flex'])
  })

  it('leaves !0 unreadable, since it is true', () => {
    const reading = read(`${IMPORT}export const f = () => cx(!0)\n`)

    expect(reading.problems.map((problem) => problem.kind)).toEqual(['argument'])
  })
})

describe('a Svelte template call is quoted as the author wrote it', () => {
  it('drops the $$props. the compiler adds', () => {
    const reading = read(`${IMPORT}export const f = ($$props) => cx($$props.variant)\n`)

    expect(reading.problems[0]!.construct).toBe('cx(variant)')
  })

  it('names the component’s own file for a template problem in a build', async () => {
    const built = await build(
      {
        'src/Bad.svelte': `<script>\n  import { cx } from '@navecss/core/cx'\n  let { variant } = $props()\n</script>\n\n<p>one</p>\n<div class={cx(variant)}>t</div>\n`,
      },
      { plugins: [svelte()], build: { sourcemap: true } },
    )

    expect(built.error).toContain('src/Bad.svelte:')
    expect(built.error).toContain('cx(variant): the argument is not a literal atom name.')
  }, 60_000)
})

/**
 * The milliseconds `work` takes.
 */
function elapsed(work: () => void): number {
  const start = performance.now()
  work()
  return performance.now() - start
}

/**
 * A context and a host stand-in to record a module through, as the plugin's transform does; the
 * stand-in parses with `parse` (Vite's own parser by default).
 */
function recordingFixture(parse: (code: string) => unknown = (code) => parseAst(code)): {
  context: ReturnType<typeof createUsedContext>
  ctx: never
} {
  const context = createUsedContext(resolveUsedOptions({}), createExtendSource(undefined))
  context.root = '/scale-root'
  const ctx = {
    environment: { name: 'client', config: { consumer: 'client' }, plugins: [] },
    parse,
    getCombinedSourcemap: () => ({ sources: [], mappings: '' }),
    addWatchFile() {},
  } as never
  return { context, ctx }
}

/**
 * A module whose one statement holds an array nested `depth` deep, built node by node: the host's
 * own parser gives out before the reader's stack does, so the nesting is made here.
 */
function nestedProgram(depth: number): unknown {
  const at = { start: 0, end: 1 }
  let init: Record<string, unknown> = { type: 'Literal', value: 1, ...at }
  for (let level = 0; level < depth; level += 1) {
    init = { type: 'ArrayExpression', elements: [init], ...at }
  }
  const id = { type: 'Identifier', name: 'x', ...at }
  const declarator = { type: 'VariableDeclarator', id, init, ...at }
  const declaration = {
    type: 'VariableDeclaration',
    kind: 'const',
    declarations: [declarator],
    ...at,
  }
  return { type: 'Program', body: [declaration], ...at }
}

describe('a module nested deeper than the reader can follow', () => {
  it('is recorded as a problem naming the module, never a crash and never a skip', async () => {
    const { context, ctx } = recordingFixture(() => nestedProgram(200_000))

    const record = await recordModule(context, ctx, {
      code: `${IMPORT}export const x = 1\n`,
      id: '/scale-root/src/deep.js',
    })

    expect(record!.problems.map((problem) => problem.kind)).toEqual(['unreadable'])
    expect(record!.problems[0]!.file).toBe('src/deep.js')
    expect(record!.problems[0]!.text).toContain('nested too deeply')
  })
})

describe('reading a long module costs time in proportion to its length', () => {
  it('a long chain of concatenated strings', async () => {
    await expect(
      assertScalesLinearly((size) => {
        const chain = Array.from({ length: size }, (_, index) => `'p${index} '`).join(' + ')
        const code = `${IMPORT}export const s = ${chain}\n`
        const program = parseAst(code) as unknown as AstNode
        return elapsed(() => {
          readModule(code, program, {
            cxSources: new Set([CX_SOURCE]),
            ownAtoms: new Set(),
            isDependency: false,
          })
        })
      }, 500),
    ).resolves.toBeDefined()
  }, 120_000)

  it('a long chain of constants, each read by a call', async () => {
    await expect(
      assertScalesLinearly((size) => {
        const chain = Array.from({ length: size }, (_, index) => `const c${index + 1} = c${index}`)
        const calls = Array.from(
          { length: size },
          (_, index) => `export const u${index} = cx(c${size})`,
        )
        const code = `${IMPORT}const c0 = 'flex'\n${chain.join('\n')}\n${calls.join('\n')}\n`
        const program = parseAst(code) as unknown as AstNode
        return elapsed(() => {
          readModule(code, program, {
            cxSources: new Set([CX_SOURCE]),
            ownAtoms: new Set(),
            isDependency: false,
          })
        })
      }, 150),
    ).resolves.toBeDefined()
  }, 120_000)

  it('recording a module with many problems', async () => {
    const { context, ctx } = recordingFixture()
    await assertScalesLinearly(async (size) => {
      const lines = Array.from(
        { length: size },
        (_, index) => `export const v${index} = (v) => cx(v)`,
      )
      const code = `${IMPORT}${lines.join('\n')}\n`
      const start = performance.now()
      const record = await recordModule(context, ctx, { code, id: '/scale-root/src/many.js' })
      const took = performance.now() - start
      expect(record!.problems).toHaveLength(size)
      return took
    }, 2000)
  }, 120_000)

  it('a 3000-term concatenation builds under the default', async () => {
    const chain = Array.from({ length: 3000 }, (_, index) => `'p${index} '`).join(' + ')
    const built = await build({
      'src/a.js': `${IMPORT}export const a = cx('flex')\nexport const s = ${chain}\nconsole.log(a, s)\n`,
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 120_000)
})

/**
 * A plugin that serves a JSON-looking virtual module under the given `moduleType`.
 */
const dataPlugin = (moduleType: string): PluginOption => ({
  name: 'data-module',
  resolveId(source) {
    return source === 'virtual:data' ? '\0virtual:data' : undefined
  },
  load(id) {
    if (id !== '\0virtual:data') return
    return { code: '{ "cls": "nave-grid" }', moduleType }
  },
})

describe('a module that is not JavaScript when the build reads it', () => {
  const entry = { 'src/a.js': "import d from 'virtual:data'\nconsole.log(d)\n" }

  it.each(['json', 'text'])(
    'a %s module is read for the Nave classes it writes, not reported as unreadable',
    async (moduleType) => {
      const built = await build(entry, { plugins: [dataPlugin(moduleType)] })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
    },
    60_000,
  )

  it('control: a .json import is read the same way', async () => {
    const built = await build({
      'src/data.json': '{ "cls": "nave-grid" }\n',
      'src/a.js': "import d from './data.json'\nconsole.log(d)\n",
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  }, 60_000)
})

describe('a long chain of constants resolves', () => {
  it('reads an 8000-link chain from 8000 calls without a problem', () => {
    const size = 8000
    const chain = Array.from({ length: size }, (_, index) => `const c${index + 1} = c${index}`)
    const calls = Array.from(
      { length: size },
      (_, index) => `export const u${index} = cx(c${size})`,
    )
    const reading = read(`${IMPORT}const c0 = 'flex'\n${chain.join('\n')}\n${calls.join('\n')}\n`)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(['flex'])
  })

  it('still refuses a chain that ends in something unreadable, and a cycle', () => {
    const open = read(
      `${IMPORT}export const f = (p) => { const a = p; const b = a; return cx(b) }\n`,
    )
    const cycle = read(`${IMPORT}export function f() { const a = b; const b = a; return cx(a) }\n`)

    expect(open.problems.map((problem) => problem.kind)).toEqual(['argument'])
    expect(cycle.problems.map((problem) => problem.kind)).toEqual(['argument'])
  })
})

const UNKNOWN_WITHOUT_MAP =
  " (line unknown: this file's compiled code has no source map in this build; with build.sourcemap set in the Vite config, the report gives the line if the source maps then lead back to it)"
const UNKNOWN_UNMAPPED = ' (line unknown: no source map leads from the compiled code to this file)'

describe('AC-used-atoms-34: a position is printed only where the source map leads to it', () => {
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.NODE_ENV
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  })

  const bad = `<script setup lang="ts">\nimport { cx } from '@navecss/core/cx'\nconst props = defineProps<{ variant: string }>()\n</script>\n\n<template><div :class="cx(props.variant)" /></template>\n`

  it('a Vue component built with no source map is reported by path alone, with the first sentence', async () => {
    process.env.NODE_ENV = 'production'
    const built = await build({ 'src/Bad.vue': bad }, { plugins: [vuePlugin()] })

    expect(built.error).toContain(
      `src/Bad.vue: cx(props.variant): the argument is not a literal atom name.${UNKNOWN_WITHOUT_MAP}`,
    )
    expect(built.error).not.toMatch(/src\/Bad\.vue:\d/)
  }, 60_000)

  it('the same component built with source maps on is reported at its authored line', async () => {
    process.env.NODE_ENV = 'production'
    const built = await build(
      { 'src/Bad.vue': bad },
      { plugins: [vuePlugin()], build: { sourcemap: true } },
    )

    expect(built.error).toContain('src/Bad.vue:6:')
    expect(built.error).not.toContain('line unknown')
  }, 60_000)

  const prepend: PluginOption = {
    name: 'prepend-lines',
    enforce: 'pre',
    transform(code, id) {
      // eslint-disable-next-line unicorn/no-null -- `map: null` is the host's own way of saying "this transform returns no source map"; leaving it out means something else to the host
      return id.endsWith('src/a.js') ? { code: `\n\n\n${code}`, map: null } : undefined
    },
  }
  const a = { 'src/a.js': `${IMPORT}export const f = (v) => cx(v)\n` }

  it('a module rewritten by a plugin that returns no map is reported with the first sentence in a build with no source map', async () => {
    const built = await build(a, { plugins: [prepend] })

    expect(built.error).toContain(
      `src/a.js: cx(v): the argument is not a literal atom name.${UNKNOWN_WITHOUT_MAP}`,
    )
  }, 60_000)

  it('a module rewritten by a plugin that returns no map is reported with the second sentence', async () => {
    const built = await build(a, { plugins: [prepend], build: { sourcemap: true } })

    expect(built.error).toContain(
      `src/a.js: cx(v): the argument is not a literal atom name.${UNKNOWN_UNMAPPED}`,
    )
  }, 60_000)

  it.each([false, true])(
    'control: an untransformed module is reported at its line and column with sourcemap %s',
    async (sourcemap) => {
      const built = await build(a, { build: { sourcemap } })

      expect(built.error).toContain(
        'src/a.js:2:28: cx(v): the argument is not a literal atom name.',
      )
      expect(built.error).not.toContain('line unknown')
    },
    60_000,
  )

  it('sorts a problem with no position after the problems that have one', () => {
    const base = { kind: 'argument', offset: 0, construct: 'cx(v)', text: 'x.', file: 'src/m.js' }
    const report = buildReport([
      { ...base, line: 0, column: 0, unknownLine: UNKNOWN_UNMAPPED },
      { ...base, line: 9, column: 3 },
    ] as never)
    const lines = report.split('\n').filter((line) => line.startsWith('src/m.js'))

    expect(lines).toEqual([`src/m.js:9:3: cx(v): x.`, `src/m.js: cx(v): x.${UNKNOWN_UNMAPPED}`])
  })
})
