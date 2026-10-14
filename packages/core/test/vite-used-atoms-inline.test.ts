/**
 * The used-atoms criteria for inlining (AC-used-atoms-21, -22, -23 and -59):
 * in a build each `cx()`, `cx.raw()` and `cx.dynamic()` call the plugin read becomes the value it
 * returns, so the name map ships nowhere, and the dev server keeps the run-time functions. The
 * rows of what the rewrite writes are in vite-rewrite.test.ts; the strings a page renders are in
 * test/browser/driven/vite-used-atoms-inline.browser.test.ts.
 */
import type { PluginOption } from 'vite'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import vuePlugin from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { withoutRewrite } from './helpers/used-atoms-unrewritten.ts'
import { appConfig, startDev } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/generated/minified-dependencies',
)

/**
 * Records, by module id from `src/` or `node_modules/`, the text the plugins after it are given.
 */
function recorder(seen: Map<string, string>): PluginOption {
  return {
    name: 'record-post-order',
    enforce: 'post',
    transform(code, id) {
      seen.set(id.replace(/^.*?\/(src|node_modules)\//, '$1/'), code)
    },
  }
}

/**
 * The ids of the modules in every chunk the build wrote.
 */
function chunkLister(sink: string[]): PluginOption {
  return {
    name: 'list-chunk-modules',
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (entry.type === 'chunk') sink.push(...Object.keys(entry.modules))
      }
    },
  }
}

const SCRIPT = `<script setup lang="ts">
import { cx } from '@navecss/core/cx'
const props = defineProps<{ on: boolean }>()
const v = 'grid'
</script>
`
const CARD = `${SCRIPT}<template><div :class="cx('flex', props.on && 'itemsCenter', v)"><span :class="cx.raw('legacy')" /></div></template>\n`

const FILES = appFiles(
  {
    'src/Card.vue': CARD,
    'src/App.tsx': `${IMPORT}console.log(cx('flex', Math.random() > 2 && 'grid'))\n`,
    'src/libs.ts': `import Card from './Card.vue'\nimport { a, b, pass } from 'min-lib'\nconsole.log(Card, a(true), b(), pass([1]))\n`,
  },
  ['src/App.tsx', 'src/libs.ts'],
)

describe('AC-used-atoms-21 — each call becomes the string cx() returns, in a build only', () => {
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  })

  const minLib = readFileSync(path.join(FIXTURES, 'min-lib.js.txt'), 'utf8')

  it('leaves no call to the cx binding in the Vue component, the dependency or the application', async () => {
    const app = makeUsedApp(FILES)
    addPackage(app, 'min-lib', { 'index.js': minLib })
    const seen = new Map<string, string>()
    const control = new Map<string, string>()
    try {
      const built = await buildUsed(app, { plugins: [vuePlugin()], after: [recorder(seen)] })
      const first = await buildUsed(app, {
        plugins: [vuePlugin()],
        nave: withoutRewrite(),
        after: [recorder(control)],
      })

      expect(built.error).toBeUndefined()
      expect(first.error).toBeUndefined()
      const own = (modules: Map<string, string>): [string, string][] =>
        [...modules].filter(([id]) => /Card\.vue|App\.tsx|min-lib/.test(id))
      expect(own(seen).length).toBeGreaterThanOrEqual(3)
      for (const [id, code] of own(seen)) {
        expect(code, id).not.toMatch(/(?:\bcx|_unref\(cx\))\(/)
        expect(code, id).not.toContain('@navecss/core/cx')
      }
      // Control: the build that keeps the run-time functions leaves the calls the shapes name, so the scan reaches them.
      expect(
        own(control)
          .map(([, code]) => code)
          .join('\n'),
      ).toContain('_unref(cx)(')
      expect(
        own(control)
          .map(([, code]) => code)
          .join('\n'),
      ).toMatch(/\bcx\(/)
      expect(atomLayerAtoms(built.css)).toEqual(atomLayerAtoms(first.css))
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid', 'itemsCenter'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('rewrites the calls of a template compiled apart from setup(), and keeps the import its exposure needs', async () => {
    const app = makeUsedApp(FILES)
    addPackage(app, 'min-lib', { 'index.js': minLib })
    const seen = new Map<string, string>()
    try {
      const built = await buildUsed(app, {
        plugins: [vuePlugin()],
        config: { define: { __VUE_PROD_DEVTOOLS__: 'true' } },
        after: [recorder(seen)],
      })

      expect(built.error).toBeUndefined()
      const modules = [...seen].filter(([id]) => id.includes('Card.vue'))
      const code = modules.map(([, text]) => text).join('\n')
      expect(code).not.toContain('$setup.cx(')
      expect(code).toContain('get cx()')
      expect(code).toContain('@navecss/core/cx')
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid', 'itemsCenter'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('rewrites the calls of a Svelte component', async () => {
    const app = makeUsedApp(
      appFiles(
        {
          'src/Tag.svelte': `<script>\n  import { cx } from '@navecss/core/cx'\n  let { on } = $props()\n</script>\n<div class={cx('flex', on && 'truncate')}>t</div>\n`,
        },
        ['src/Tag.svelte'],
      ),
    )
    const seen = new Map<string, string>()
    try {
      const built = await buildUsed(app, { plugins: [svelte()], after: [recorder(seen)] })

      expect(built.error).toBeUndefined()
      const code = [...seen].find(([id]) => id.includes('Tag.svelte'))?.[1]
      expect(code).toBeDefined()
      expect(code).not.toMatch(/\bcx\(/)
      expect(code).toContain('"nave-flex"')
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'truncate'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('rewrites nothing in the dev server, which keeps the run-time functions', async () => {
    process.env.NODE_ENV = 'development'
    const app = makeUsedApp(
      appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'), cx.raw('x'))\n` }),
    )
    const results: unknown[] = []
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
    try {
      const server = await startDev(appConfig(app.root, 'postcss', [nave, watched]))
      try {
        const served = await server.transformRequest('/src/App.ts')

        expect(served?.code).toMatch(/\bcx\(/)
        expect(served?.code).not.toContain('nave-flex')
        expect(results.length).toBeGreaterThan(0)
        expect(results.every((result) => result === undefined)).toBe(true)
      } finally {
        await server.close()
      }
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-22 — the name map ships nowhere when every cx use is a direct call', () => {
  const KEYS = [
    'srOnlyFocusable',
    'hideTabletLandscapeUp',
    'stackPhoneOnly',
    'disabledState',
    'focusRing',
  ]
  const probe = `${IMPORT}export const a = cx('flex')
export const b = (on: boolean) => cx.raw('legacy', on && 'x')
export const c = cx['raw']('y')
export const d = (tone: 'grid' | 'flex') => cx.dynamic(tone)
console.log(a, b(true), c, d('grid'), d('flex'))
`
  const appWith = (extra = ''): ReturnType<typeof makeUsedApp> =>
    makeUsedApp(appFiles({ 'src/probe.ts': probe + extra }))

  /**
   * Whether any JavaScript the build wrote holds the key, a name no minifier renames.
   */
  const holds = (js: string): string[] => KEYS.filter((key) => js.includes(key))

  it('ships neither core module nor atom data, and holds the keep map in the module that looks a name up', async () => {
    const fixture = appWith()
    const modules: string[] = []
    const control: string[] = []
    const seen = new Map<string, string>()
    try {
      const options = { keep: ['grid'] } as const
      const built = await buildUsed(fixture, {
        options,
        after: [chunkLister(modules), recorder(seen)],
      })
      const first = await buildUsed(fixture, {
        options,
        nave: withoutRewrite(options),
        after: [chunkLister(control)],
      })

      expect(built.error).toBeUndefined()
      expect(first.error).toBeUndefined()
      expect(modules.filter((id) => id.includes('@navecss/core') && id.includes('dist'))).toEqual(
        [],
      )
      expect(holds(built.js)).toEqual([])
      // Control: the same fixture with the run-time functions kept lists core's modules and holds every key.
      expect(control.filter((id) => id.includes('dist')).length).toBeGreaterThan(0)
      expect(holds(first.js)).toEqual(KEYS)
      const probed = seen.get('src/probe.ts')!
      expect(probed).toContain('{__proto__:null,"grid":"nave-grid"}')
      expect(probed.match(/__proto__/g)).toHaveLength(1)
    } finally {
      fixture.dispose()
    }
  }, 120_000)

  it('keeps the map for the aliased cx.raw form, and never errors on it', async () => {
    const fixture = appWith("const r = cx.raw\nconsole.log(r('z'))\n")
    const modules: string[] = []
    try {
      const built = await buildUsed(fixture, {
        options: { keep: ['grid'] },
        after: [chunkLister(modules)],
      })

      expect(built.error).toBeUndefined()
      expect(modules.filter((id) => id.includes('dist')).length).toBeGreaterThan(0)
    } finally {
      fixture.dispose()
    }
  }, 120_000)
})

/**
 * The specifiers the module text imports from, in order.
 */
function importsOf(code: string): string[] {
  return code
    .matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)
    .map((match) => match[1]!)
    .toArray()
}

describe('AC-used-atoms-23 — no rewrite injects a Nave module or any style computation', () => {
  it('declares in each rewritten module the imports of its input minus the cx import, and lists no module the plugin created', async () => {
    const fixture = makeUsedApp(
      appFiles({
        'src/App.ts': `import { ref } from 'vue'\n${IMPORT}console.log(ref, cx('flex'), cx.dynamic('grid'))\nvoid import('./Lazy.ts')\n`,
        'src/Lazy.ts': "export const l = 'nave-block'\n",
      }),
    )
    const before = new Map<string, string>()
    const after = new Map<string, string>()
    const used: string[] = []
    const all: string[] = []
    try {
      const built = await buildUsed(fixture, {
        options: { keep: ['grid'] },
        plugins: [recorder(before)],
        after: [recorder(after), chunkLister(used)],
        config: { build: { rolldownOptions: { external: ['vue'] } } },
      })
      const everything = await buildUsed(fixture, {
        options: { atomic: 'all' },
        after: [chunkLister(all)],
        config: { build: { rolldownOptions: { external: ['vue'] } } },
      })

      expect(built.error).toBeUndefined()
      expect(everything.error).toBeUndefined()
      const input = before.get('src/App.ts')!
      const output = after.get('src/App.ts')!
      expect(output).not.toBe(input)
      expect(importsOf(output)).toEqual(
        importsOf(input).filter((name) => name !== '@navecss/core/cx'),
      )
      expect(used.filter((id) => !all.includes(id) && !id.includes('dist'))).toEqual([])
      expect(output).not.toMatch(/\b(?:function|require)\b/)
    } finally {
      fixture.dispose()
    }
  }, 120_000)
})

describe('AC-used-atoms-59 — a keepFor package keeps the map where its calls need it', () => {
  it('rewrites the application and the readable calls, and leaves the unreadable call of the package to the run-time map', async () => {
    const fixture = makeUsedApp(
      appFiles(
        {
          'src/App.ts': `${IMPORT}import { a, b } from 'wide-lib'\nconsole.log(cx('flex'), (x: string) => cx.dynamic(x as 'block'), a('block'), a('grid'), b('block'))\n`,
        },
        ['src/App.ts'],
      ),
    )
    addPackage(fixture, 'wide-lib', {
      'index.js': `${IMPORT}export const a = (v) => cx(v)\nexport const b = (t) => cx.dynamic(t)\n`,
    })
    const seen = new Map<string, string>()
    const first = new Map<string, string>()
    const options = { keep: ['inlineFlex'], keepFor: { 'wide-lib': ['block'] } } as const
    try {
      const built = await buildUsed(fixture, { options, after: [recorder(seen)] })
      const control = await buildUsed(fixture, {
        options,
        nave: withoutRewrite(options),
        after: [recorder(first)],
      })

      expect(built.error).toBeUndefined()
      expect(control.error).toBeUndefined()
      expect(seen.get('src/App.ts')).toContain('"nave-flex"')
      // The unreadable call stays a call, so the package's module keeps its import (R17(e)).
      const lib = seen.get('node_modules/wide-lib/index.js')!
      expect(lib).toContain('cx(v)')
      expect(lib).toContain(`@navecss/core/cx`)
      expect(lib).not.toContain('cx.dynamic')
      expect(
        ['flex', 'block', 'inlineFlex'].every((a) => atomLayerAtoms(built.css).includes(a)),
      ).toBe(true)
      expect(atomLayerAtoms(built.css)).toEqual(atomLayerAtoms(control.css))
      expect(['srOnlyFocusable', 'focusRing'].every((key) => built.js.includes(key))).toBe(true)
    } finally {
      fixture.dispose()
    }
  }, 120_000)
})
