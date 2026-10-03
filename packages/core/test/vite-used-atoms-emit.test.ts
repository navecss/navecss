/**
 * The used-atoms criteria for emitting (AC-used-atoms-24 to -28, -32): the atom is the unit of
 * emission. A real `vite build` of a scratch app, under both CSS transformers, compared against
 * an `'all'` build of the same app through the same pipeline.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { classesOf, keepOnly, parseAtomicLayer, withoutAtomicLayer } from './helpers/css-layer.ts'
import {
  appFiles,
  atomLayerAtoms,
  atoms,
  type Built,
  buildUsed,
  makeUsedApp,
  tamperCss,
} from './helpers/used-atoms-app.ts'
import type { Transformer } from './helpers/vite-app.ts'

const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']
const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * The name of the (only) CSS file a build wrote.
 */
function cssName(built: Built): string {
  const names = Object.keys(built.assets).filter((name) => name.endsWith('.css'))
  expect(names).toHaveLength(1)
  return names[0]!
}

describe.each(TRANSFORMERS)('under css.transformer %s', (transformer) => {
  describe('AC-used-atoms-24 — the CSS file name follows the emitted set', () => {
    it('changes with the set, returns with it, and differs from the full layer', async () => {
      const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
      const write = (body: string): void =>
        writeFileSync(path.join(app.root, 'src/App.ts'), `${IMPORT}export const a = ${body}\n`)
      try {
        write("cx('flex')")
        const a = await buildUsed(app, { transformer })
        write("cx('flex', 'grid')")
        const b = await buildUsed(app, { transformer })
        write("cx('flex')")
        const c = await buildUsed(app, { transformer })
        const all = await buildUsed(app, { transformer, options: { atomic: 'all' } })

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
          transformer,
          options: { atomic: 'all' },
          after: [lateFilter],
        })
        write("cx('flex', 'grid')")
        const b = await buildUsed(app, {
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
) {
  const built = await buildUsed(app, {
    transformer,
    options: { atomic },
    build: { cssMinify: false },
  })
  expect(built.error).toBeUndefined()
  return { built, tree: parseAtomicLayer(built.css) }
}

describe.each(TRANSFORMERS)('under css.transformer %s', (transformer) => {
  describe('AC-used-atoms-25 — focusRing and srOnlyFocusable ship whole, compared with a full-set build', () => {
    it('keeps every rule the full layer yields for the two atoms, and no other atom’s', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}export const a = cx('focusRing', 'srOnlyFocusable')\n`,
        }),
      )
      try {
        const used = await layerOf(app, transformer, 'used')
        const all = await layerOf(app, transformer, 'all')
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

    it('control: a filter keeping only rules whose selector is exactly an emitted class drops the pseudo-class rules', () => {
      const wrong = (nodes: ReturnType<typeof parseAtomicLayer>) =>
        nodes.filter((node) => /^\.nave-(?:focus-ring|sr-only-focusable)$/.test(node.prelude))
      const sample = [
        { prelude: '.nave-focus-ring', body: 'outline:none' },
        { prelude: '.nave-focus-ring:focus-visible', body: 'outline:2px solid' },
      ]
      expect(wrong(sample)).toHaveLength(1)
      expect(keepOnly(sample, classesOf('focusRing'))).toHaveLength(2)
    })
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
          const usedLayer = await layerOf(app, transformer, 'used')
          const allLayer = await layerOf(app, transformer, 'all')

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
        const used = await buildUsed(app, { transformer, options, build: { cssMinify: false } })
        const all = await buildUsed(app, {
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
        const { tree, built } = await layerOf(app, transformer, 'used')
        const text = JSON.stringify(tree)

        expect(atomLayerAtoms(built.css)).toEqual(['disabledState'])
        expect(text).toMatch(/:disabled/)
        expect(text).toMatch(/\[aria-disabled/)
      } finally {
        app.dispose()
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
          transformer,
          after: [insertion('.nave-block{display:block}', 'atomic')],
        })
        const d = await buildUsed(app, {
          transformer,
          after: [insertion('.nave-block{display:block}', 'overrides')],
        })
        const b = await buildUsed(app, {
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
        const built = await buildUsed(app, { transformer, nave: copy })

        expect(built.error).toContain('did not emit')
        expect(built.error).toContain('grid')
        expect(built.error).not.toContain('flex, ')
      } finally {
        app.dispose()
      }
    }, 60_000)
  })
})
