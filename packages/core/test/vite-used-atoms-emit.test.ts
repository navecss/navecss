/**
 * The used-atoms criteria for emitting (AC-used-atoms-24 to -28, -32): the atom is the unit of
 * emission. A real `vite build` of a scratch app, under both CSS transformers, compared against
 * an `'all'` build of the same app through the same pipeline.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import vuePlugin from '@vitejs/plugin-vue'
import { describe, expect, it } from 'vitest'

import { atomClassMap } from '../src/atoms.ts'
import { navePlugin } from '../src/vite.ts'
import { classesOf, keepOnly, parseAtomicLayer, withoutAtomicLayer } from './helpers/css-layer.ts'
import {
  APP_CSS,
  appFiles,
  atomLayerAtoms,
  atoms,
  type Built,
  type BuildOptions,
  buildUsed,
  makeUsedApp,
  tamperCss,
} from './helpers/used-atoms-app.ts'
import { VITE_APIS, type Transformer, type ViteApi } from './helpers/vite-app.ts'

const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']
// Lightning CSS at Vite's own default browser targets (the fixtures' floor is above them), which
// is where it lowers nesting and, minifying, merges two rules that share their declarations.
const VITE_DEFAULTS = {
  build: { cssTarget: undefined, cssMinify: 'lightningcss' },
  config: { css: { transformer: 'lightningcss' } },
}
// The re-feed of Vite's CSS step is a Vite internal, so every row runs on each Vite measured.
const LEGS = Object.entries(VITE_APIS).flatMap(([version, api]) =>
  TRANSFORMERS.map((transformer) => ({ version, api, transformer })),
)
const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * The name of the (only) CSS file a build wrote.
 */
function cssName(built: Built): string {
  const names = Object.keys(built.assets).filter((name) => name.endsWith('.css'))
  expect(names).toHaveLength(1)
  return names[0]!
}

describe.each(LEGS)('Vite $version under css.transformer $transformer', ({ api, transformer }) => {
  describe('AC-used-atoms-24 — the CSS file name follows the emitted set', () => {
    it('changes with the set, returns with it, and differs from the full layer', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
      const write = (body: string): void =>
        writeFileSync(path.join(app.root, 'src/App.ts'), `${IMPORT}export const a = ${body}\n`)
      try {
        write("cx('flex')")
        const a = await buildUsed(app, { api, transformer })
        write("cx('flex', 'grid')")
        const b = await buildUsed(app, { api, transformer })
        write("cx('flex')")
        const c = await buildUsed(app, { api, transformer })
        const all = await buildUsed(app, { api, transformer, options: { atomic: 'all' } })

        expect(cssName(a)).not.toBe(cssName(b))
        expect(cssName(a)).toBe(cssName(c))
        expect(cssName(a)).not.toBe(cssName(all))
        expect(atomLayerAtoms(b.css)).toContain('grid')
        expect(atomLayerAtoms(a.css)).not.toContain('grid')
        const html = a.assets['index.html']!
        expect(html).toContain(cssName(a))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('control: pruning in generateBundle instead keeps the full set’s file name', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
      const lateFilter = tamperCss((css) => css.replaceAll(/\.nave-grid\{[^}]*\}/g, ''))
      const write = (body: string): void =>
        writeFileSync(path.join(app.root, 'src/App.ts'), `${IMPORT}export const a = ${body}\n`)
      try {
        write("cx('flex')")
        const a = await buildUsed(app, {
          api,
          transformer,
          options: { atomic: 'all' },
          after: [lateFilter],
        })
        write("cx('flex', 'grid')")
        const b = await buildUsed(app, {
          api,
          transformer,
          options: { atomic: 'all' },
          after: [lateFilter],
        })

        expect(cssName(a)).toBe(cssName(b))
      } finally {
        app.dispose()
      }
    }, 60_000)
  })
})

/**
 * The tree of the atomic layer a build wrote, unminified so its rules read as the pipeline made
 * them.
 */
async function layerOf(
  app: ReturnType<typeof makeUsedApp>,
  transformer: Transformer,
  atomic: 'all' | 'used',
  api: ViteApi,
  settings: Pick<BuildOptions, 'build' | 'config'> = {},
) {
  const built = await buildUsed(app, {
    api,
    transformer,
    options: { atomic },
    build: { cssMinify: false, ...settings.build },
    ...(settings.config && { config: settings.config }),
  })
  expect(built.error).toBeUndefined()
  return { built, tree: parseAtomicLayer(built.css) }
}

describe.each(LEGS)('Vite $version under css.transformer $transformer', ({ api, transformer }) => {
  describe('AC-used-atoms-25 — focusRing and srOnlyFocusable ship whole, compared with a full-set build', () => {
    it('keeps every rule the full layer yields for the two atoms, and no other atom’s', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}export const a = cx('focusRing', 'srOnlyFocusable')\n`,
        }),
      )
      try {
        const used = await layerOf(app, transformer, 'used', api)
        const all = await layerOf(app, transformer, 'all', api)
        const expected = keepOnly(all.tree, classesOf('focusRing', 'srOnlyFocusable'))

        expect(used.tree).toEqual(expected)
        expect(atomLayerAtoms(used.built.css)).toEqual(atoms('focusRing', 'srOnlyFocusable'))
        const text = JSON.stringify(used.tree)
        expect(text).toContain('focus-visible')
        expect(text).toContain('focus-within')
        expect(text).toContain('outline-offset')
      } finally {
        app.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-26 — srOnlyFocusable alone prunes a merged selector list', () => {
    it.each([
      ['srOnlyFocusable', 'srOnly'],
      ['srOnly', 'srOnlyFocusable'],
    ])(
      '%s alone keeps its rules and none of %s',
      async (used, other) => {
        const app = makeUsedApp(
          appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('${used}')\n` }),
        )
        try {
          const usedLayer = await layerOf(app, transformer, 'used', api)
          const allLayer = await layerOf(app, transformer, 'all', api)

          expect(usedLayer.tree).toEqual(keepOnly(allLayer.tree, classesOf(used)))
          expect(atomLayerAtoms(usedLayer.built.css)).toEqual([used])
          expect(atomLayerAtoms(usedLayer.built.css)).not.toContain(other)
        } finally {
          app.dispose()
        }
      },
      60_000,
    )
  })

  describe('AC-used-atoms-27 — the emitted set, and nothing outside the layer changes', () => {
    it('ships exactly flex, keep and the written class, and leaves every other byte alone', async () => {
      const app = makeUsedApp(
        appFiles(
          {
            'index.html':
              '<!doctype html><html><body><div class="nave-hidden"></div><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
            'src/App.ts': `${IMPORT}export const a = cx('flex')\nvoid import('./Lazy.ts').then((m) => console.log(m.l))\n`,
            'src/Lazy.ts': "import './lazy.css'\nexport const l = 1\n",
            'src/lazy.css': '.lazy { color: blue }\n',
            'src/app.css':
              "@import url('@navecss/core/layers');\n@import url('@navecss/core');\n.card { display: flex }\n@layer overrides { .menu .nave-hidden { color: red } }\n",
          },
          ['src/App.ts'],
        ),
      )
      try {
        const options = { keep: ['grid' as const] }
        const used = await buildUsed(app, {
          api,
          transformer,
          options,
          build: { cssMinify: false },
        })
        const all = await buildUsed(app, {
          api,
          transformer,
          options: { atomic: 'all' },
          build: { cssMinify: false },
        })

        expect(used.error).toBeUndefined()
        expect(atomLayerAtoms(used.css)).toEqual(atoms('flex', 'grid', 'hidden'))
        const outside = (built: Built): string[] =>
          Object.entries(built.assets)
            .filter(([name]) => name.endsWith('.css'))
            .map(([, text]) => withoutAtomicLayer(text))
            .toSorted()
        expect(outside(used)).toEqual(outside(all))
        expect(used.css).toContain('.lazy')
        expect(used.css).toContain('.menu .nave-hidden')
        expect(used.css).not.toMatch(/@media[^{]*\{\s*\}/)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('keeps both members of the lowered selector list of disabledState', async () => {
      const app = makeUsedApp(
        appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('disabledState')\n` }),
      )
      try {
        const { tree, built } = await layerOf(app, transformer, 'used', api)
        const text = JSON.stringify(tree)

        expect(atomLayerAtoms(built.css)).toEqual(['disabledState'])
        expect(text).toMatch(/:disabled/)
        expect(text).toMatch(/\[aria-disabled/)
      } finally {
        app.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-27 - a consumer rule in the layer is removed only when it needs an unemitted atom', () => {
    it('keeps the rules an emitted atom’s element can match, and removes the ones that need another', async () => {
      const rules = [
        ':is(.nave-flex, .nave-grid):hover { color: red }',
        '.card:not(.nave-grid) { color: blue }',
        ':is(.nave-grid, .nave-block) { color: green }',
        '.nave-grid > .child { color: orange }',
      ]
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}export const a = cx('flex')\n`,
          'src/app.css': `${APP_CSS}@layer atomic { ${rules.join(' ')} }\n`,
        }),
      )
      try {
        const used = await layerOf(app, transformer, 'used', api)
        const all = await layerOf(app, transformer, 'all', api)
        const text = JSON.stringify(used.tree)

        expect(used.built.error).toBeUndefined()
        expect(JSON.stringify(all.tree)).toContain('.nave-grid,.nave-block')
        expect(text).toContain(':is(.nave-flex,.nave-grid):hover')
        expect(text).toContain('.card:not(.nave-grid)')
        expect(text).not.toContain('.nave-grid,.nave-block')
        expect(text).not.toContain('.nave-grid>.child')
        expect(used.tree).toEqual(keepOnly(all.tree, classesOf('flex')))
      } finally {
        app.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-27 - a plugin listed after Nave keeps what it did to a stylesheet', () => {
    const outside = (built: Built): string[] =>
      Object.entries(built.assets)
        .filter(([name]) => name.endsWith('.css'))
        .map(([, text]) => withoutAtomicLayer(text))
        .toSorted()

    it('keeps a rule a later plugin appended, and every other byte outside the layer as under all', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
      const later = {
        name: 'consumer-css-transform',
        transform(code: string, id: string) {
          if (id.endsWith('app.css')) return { code: `${code}\n.from-later-plugin{color:red}\n` }
        },
      }
      try {
        const build = { cssMinify: false }
        const used = await buildUsed(app, { api, transformer, build, after: [later as never] })
        const all = await buildUsed(app, {
          api,
          transformer,
          build,
          options: { atomic: 'all' },
          after: [later as never],
        })

        expect(used.error).toBeUndefined()
        expect(all.css).toContain('.from-later-plugin')
        expect(used.css).toContain('.from-later-plugin')
        expect(atomLayerAtoms(used.css)).toEqual(['flex'])
        expect(outside(used)).toEqual(outside(all))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('keeps the scope a Vue plugin listed after Nave puts on a style block', async () => {
      const app = makeUsedApp({
        'index.html':
          '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
        'src/main.ts': "import App from './App.vue'\nconsole.log(App)\n",
        'src/App.vue': `<script setup lang="ts">
${IMPORT}const c = cx('flex')
</script>
<template><div :class="c"><p class="title">hi</p></div></template>
<style scoped>
@import url('@navecss/core/layers');
@import url('@navecss/core');
.title { color: red }
</style>
`,
      })
      try {
        const build = { cssMinify: false }
        const used = await buildUsed(app, {
          api,
          transformer,
          build,
          nave: [navePlugin(), vuePlugin()],
        })
        const all = await buildUsed(app, {
          api,
          transformer,
          build,
          options: { atomic: 'all' },
          nave: [navePlugin({ atomic: 'all' }), vuePlugin()],
        })

        expect(used.error).toBeUndefined()
        expect(all.css).toMatch(/\.title\[data-v-/)
        expect(used.css).toMatch(/\.title\[data-v-/)
        expect(used.css).not.toMatch(/\.title\s*\{/)
        expect(atomLayerAtoms(used.css)).toEqual(['flex'])
        expect(outside(used)).toEqual(outside(all))
      } finally {
        app.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-32 - every route that brings the layer is filtered, or the build says it was not', () => {
    const page = (head = ''): string =>
      `<!doctype html><html><head>${head}</head><body><script type="module" src="/src/main.ts"></script></body></html>`

    it('filters a layer an @import with a media condition wraps', async () => {
      const app = makeUsedApp(
        appFiles({
          'index.html': page(),
          'src/app.css':
            "@import url('@navecss/core/layers');\n@import url('@navecss/core') screen;\n",
          'src/main.ts': `import './app.css'\n${IMPORT}console.log(cx('flex'))\n`,
        }),
      )
      try {
        const built = await buildUsed(app, { api, transformer })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(['flex'])
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('filters the layer a style element of an HTML page imports', async () => {
      const app = makeUsedApp({
        'index.html': page(
          "<style>@import url('@navecss/core/layers');@import url('@navecss/core');</style>",
        ),
        'src/main.ts': `${IMPORT}console.log(cx('flex'))\n`,
      })
      try {
        const built = await buildUsed(app, { api, transformer })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.assets['index.html']!)).toEqual(['flex'])
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('says it could not filter a stylesheet imported with ?inline, naming it', async () => {
      const app = makeUsedApp({
        'index.html': page(),
        'src/app.css': APP_CSS,
        'src/main.ts': `import css from './app.css?inline'\n${IMPORT}console.log(cx('flex'), css)\n`,
      })
      try {
        const built = await buildUsed(app, { api, transformer })
        const said = (built.warnings ?? []).filter((message) => message.includes('app.css'))

        expect(built.error).toBeUndefined()
        expect(said).toHaveLength(1)
        expect(said[0]).toContain('src/app.css')
        expect(said[0]).toContain('?inline')
        // What the warning states is true: the layer is text in the chunk, whole.
        expect(atomLayerAtoms(built.js.replaceAll('\\n', '\n')).length).toBeGreaterThan(40)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('prints no such warning for a stylesheet imported without ?inline, or under all', async () => {
      const app = makeUsedApp({
        'index.html': page(),
        'src/app.css': APP_CSS,
        'src/main.ts': `import css from './app.css?inline'\n${IMPORT}console.log(cx('flex'), css)\n`,
      })
      const plain = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }))
      try {
        const all = await buildUsed(app, { api, transformer, options: { atomic: 'all' } })
        const used = await buildUsed(plain, { api, transformer })

        expect(all.warnings).toEqual([])
        expect(used.warnings).toEqual([])
      } finally {
        app.dispose()
        plain.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-28 — the build fails when the Vite-internal step did not take', () => {
    const insertion = (rule: string, layer: 'atomic' | 'overrides') =>
      tamperCss((css) =>
        css.replace(new RegExp(String.raw`@layer\s+${layer}\s*\{`), (opener) => `${opener}${rule}`),
      )

    it('(a) names an inserted rule for an atom that is not emitted, (b) a removed rule for one that is', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}export const a = cx('flex')\n`,
          'src/app.css': `${"@import url('@navecss/core/layers');\n@import url('@navecss/core');\n"}@layer overrides { .x { color: red } }\n`,
        }),
      )
      try {
        const a = await buildUsed(app, {
          api,
          transformer,
          after: [insertion('.nave-block{display:block}', 'atomic')],
        })
        const d = await buildUsed(app, {
          api,
          transformer,
          after: [insertion('.nave-block{display:block}', 'overrides')],
        })
        const b = await buildUsed(app, {
          api,
          transformer,
          after: [tamperCss((css) => css.replaceAll(/\.nave-flex\{[^}]*\}/g, ''))],
        })

        expect(a.error).toContain('block')
        expect(a.error).toContain('did not emit')
        expect(b.error).toContain('flex')
        expect(b.error).toContain('hold no rule')
        expect(d.error).toBeUndefined()
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('(c) names the unemitted atoms when the re-feed of Vite’s CSS step is removed', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
      const [nave, collect] = navePlugin()
      try {
        // The scratch copy of the plugin: its stylesheets are never handed back to Vite.
        const copy = [{ ...nave, renderChunk: () => Promise.resolve(null) }, collect]
        const built = await buildUsed(app, { api, transformer, nave: copy })

        expect(built.error).toContain('did not emit')
        expect(built.error).toContain('grid')
        expect(built.error).not.toContain('flex, ')
      } finally {
        app.dispose()
      }
    }, 60_000)
  })
})

describe.each(Object.entries(VITE_APIS))(
  'Vite %s under Lightning CSS minifying at Vite’s default targets',
  (_version, api) => {
    describe('AC-used-atoms-25 - the comparison sees a pseudo-class rule the layer holds apart', () => {
      it('control: a filter keeping only rules whose selector is exactly an emitted class drops the pseudo-class rules of the build’s own layer', async () => {
        const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = 1\n` }))
        try {
          const all = await layerOf(app, 'lightningcss', 'all', api, VITE_DEFAULTS)
          const wrong = all.tree.filter((node) =>
            /^\.nave-(?:focus-ring|sr-only-focusable)$/.test(node.prelude),
          )
          const right = keepOnly(all.tree, classesOf('focusRing', 'srOnlyFocusable'))

          // The case this control needs is reached: the layer holds the pseudo-class rules as rules.
          expect(all.tree.map((node) => node.prelude)).toContain('.nave-focus-ring:focus-visible')
          expect(wrong.length).toBeLessThan(right.length)
        } finally {
          app.dispose()
        }
      }, 60_000)
    })

    describe('AC-used-atoms-26 - srOnlyFocusable and srOnly alone prune the merged selector list', () => {
      it.each([
        ['srOnlyFocusable', 'srOnly'],
        ['srOnly', 'srOnlyFocusable'],
      ])(
        '%s alone keeps its member of the list and its own rules, and none of %s',
        async (used, other) => {
          const app = makeUsedApp(
            appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('${used}')\n` }),
          )
          try {
            const usedLayer = await layerOf(app, 'lightningcss', 'used', api, VITE_DEFAULTS)
            const allLayer = await layerOf(app, 'lightningcss', 'all', api, VITE_DEFAULTS)
            // A class name is a whole name: `.nave-sr-only` is no part of `.nave-sr-only-focusable`.
            const named = (name: string): RegExp =>
              new RegExp(`${name.replace('.', String.raw`\.`)}(?![\\w-])`)
            const preludes = (nodes: typeof allLayer.tree): string[] =>
              nodes.map((node) => node.prelude)
            const [kept, dropped] = [used, other].map(
              (name) => `.${classesOf(name).values().next().value}`,
            )

            // The case is reached: the full layer holds the two atoms in one merged list.
            expect(preludes(allLayer.tree)).toContain('.nave-sr-only,.nave-sr-only-focusable')
            expect(usedLayer.tree).toEqual(keepOnly(allLayer.tree, classesOf(used)))
            expect(preludes(usedLayer.tree)).toContain(kept)
            expect(JSON.stringify(usedLayer.tree)).not.toMatch(named(dropped!))
            expect(atomLayerAtoms(usedLayer.built.css)).toEqual([used])
            // Control: dropping the whole list for naming an unemitted atom loses what the emitted one needs.
            const wholeRules = allLayer.tree.filter((node) => !named(dropped!).test(node.prelude))
            expect(wholeRules).not.toEqual(usedLayer.tree)
          } finally {
            app.dispose()
          }
        },
        60_000,
      )
    })
  },
)

describe.each(TRANSFORMERS)('under css.transformer %s', (transformer) => {
  describe('AC-used-atoms-25 - each atom built alone keeps the rules the full layer gives it, and no other', () => {
    it.each([
      ['the fixtures’ browser floor', {}],
      [
        'Vite’s default targets, minifying',
        { build: { cssTarget: undefined }, config: { css: { transformer } } },
      ],
    ] as const)(
      'at %s',
      async (_name, settings) => {
        const names = Object.keys(atomClassMap)
        const reference = makeUsedApp(appFiles({ 'src/App.ts': 'console.log(1)\n' }))
        const mismatches: string[] = []
        try {
          const all = await buildUsed(reference, {
            transformer,
            options: { atomic: 'all' },
            ...settings,
          })
          const allTree = parseAtomicLayer(all.css)
          for (const name of names) {
            const app = makeUsedApp(
              appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('${name}'))\n` }),
            )
            try {
              const built = await buildUsed(app, { transformer, ...settings })
              const expected = keepOnly(allTree, classesOf(name))
              if (
                built.error !== undefined ||
                !isDeepStrictEqual(parseAtomicLayer(built.css), expected)
              ) {
                mismatches.push(name)
              }
            } finally {
              app.dispose()
            }
          }

          expect(allTree.length).toBeGreaterThanOrEqual(names.length)
          expect(mismatches).toEqual([])
        } finally {
          reference.dispose()
        }
      },
      120_000,
    )
  })
})
