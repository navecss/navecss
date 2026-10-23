/**
 * The used-atoms criterion for a CSS Module's global `composes` (AC-used-atoms-61): under the
 * default, a Nave class a CSS Module composes from global ships its atom, read from the module's
 * class map and from nothing else in it. Real builds and dev servers of scratch apps, under both
 * CSS transformers, on the floor Vite and the newest 8.x. The computed styles in Chromium are in
 * `browser/driven/vite-used-atoms-css-modules.browser.test.ts`.
 */
import type { InlineConfig, PluginOption } from 'vite'

import vuePlugin from '@vitejs/plugin-vue'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { atomsWrittenIn } from '../src/vite-literal-classes.ts'
import { navePlugin } from '../src/vite.ts'
import { changelogEntries, shippedChangesetProse } from './helpers/released-changeset.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { CARD_MODULE, cssModuleFiles } from './helpers/used-atoms-css-modules.ts'
import {
  appConfig,
  devCss,
  startDev,
  stopDev,
  type Transformer,
  VITE_APIS,
  type ViteApi,
} from './helpers/vite-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..')
const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']
const LEGS = Object.entries(VITE_APIS).flatMap(([version, api]) =>
  TRANSFORMERS.map((transformer) => ({ version, api, transformer })),
)
const MAIN_ATOMS = atoms('flex', 'gap', 'grid', 'inlineFlex')

interface Leg {
  readonly api: ViteApi
  readonly transformer: Transformer
}

/**
 * The atomic layer's atoms of the stylesheet the dev server serves for `src/app.css`, with the
 * page and its scripts requested as a browser would request them. `config` is merged over the
 * fixture's own.
 */
async function devLayerAtoms(
  root: string,
  leg: Leg,
  plugins: PluginOption[] = [],
  config: InlineConfig = {},
): Promise<string[]> {
  const server = await startDev(
    {
      ...appConfig(root, leg.transformer, [...plugins, navePlugin()], config),
      cacheDir: path.join(root, 'node_modules', '.vite'),
      optimizeDeps: { noDiscovery: true },
    },
    leg.api,
  )
  try {
    await server.transformIndexHtml(
      '/index.html',
      readFileSync(path.join(root, 'index.html'), 'utf8'),
    )
    const served = await devCss(server, '/src/main.ts')
    const css = Object.entries(served).find(([url]) => url.startsWith('/src/app.css'))?.[1]
    if (css === undefined)
      throw new Error(`no stylesheet was served: ${Object.keys(served).join(', ')}`)
    return atomLayerAtoms(css)
  } finally {
    await stopDev(server)
  }
}

/**
 * The atoms the build ships for `root`, and what it printed.
 */
async function builtAtoms(
  app: ReturnType<typeof makeUsedApp>,
  leg: Leg,
  settings: { readonly config?: Record<string, unknown>; readonly plugins?: PluginOption[] } = {},
): Promise<{ atoms: string[]; warnings: readonly string[] }> {
  const built = await buildUsed(app, { api: leg.api, transformer: leg.transformer, ...settings })
  expect(built.error).toBeUndefined()
  return { atoms: atomLayerAtoms(built.css), warnings: built.warnings ?? [] }
}

const pluginWarnings = (warnings: readonly string[]): string[] =>
  warnings.filter((message) => message.includes('[plugin nave'))

describe.each(LEGS)(
  'AC-used-atoms-61 — a CSS Module’s global composes ships its atom ($version, $transformer)',
  (leg) => {
    it('ships the atoms composed from global, in the build and in the dev server, and none a selector or a local class names', async () => {
      const app = makeUsedApp(appFiles(cssModuleFiles()))
      try {
        const built = await builtAtoms(app, leg)

        expect(built.atoms).toEqual(MAIN_ATOMS)
        expect(pluginWarnings(built.warnings)).toEqual([])
        expect(await devLayerAtoms(app.root, leg)).toEqual(MAIN_ATOMS)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('row 1: a ?inline import of the module changes nothing, with no warning', async () => {
      const app = makeUsedApp(
        appFiles({
          ...cssModuleFiles(),
          'src/extra.ts': "import inline from './card.module.css?inline'\nconsole.log(inline)\n",
          'src/main.ts': `${cssModuleFiles()['src/main.ts']}import './extra.ts'\n`,
        }),
      )
      try {
        const built = await builtAtoms(app, leg)

        expect(built.atoms).toEqual(MAIN_ATOMS)
        expect(pluginWarnings(built.warnings)).toEqual([])
        expect(await devLayerAtoms(app.root, leg)).toEqual(MAIN_ATOMS)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('row 2: a ?raw import of the module leaves the set as main has it, the raw text read as any text is', async () => {
      const app = makeUsedApp(
        appFiles({
          ...cssModuleFiles(),
          'src/extra.ts': "import raw from './card.module.css?raw'\nconsole.log(raw)\n",
          'src/main.ts': `${cssModuleFiles()['src/main.ts']}import './extra.ts'\n`,
        }),
      )
      try {
        // On main the raw import is a text module: every Nave class its source writes ships.
        const expected = atoms(
          ...new Set([...MAIN_ATOMS, ...atomsWrittenIn(CARD_MODULE), 'srOnlyFocusable']),
        )
        const built = await builtAtoms(app, leg)

        expect(built.atoms).toEqual(expected)
        expect(await devLayerAtoms(app.root, leg)).toEqual(expected)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('row 4: a preprocessed module (.module.scss) is read as a .module.css one is', async () => {
      const app = makeUsedApp(
        appFiles({
          ...cssModuleFiles(),
          'src/s.module.scss': '.y { composes: nave-inline-block from global; }\n',
          'src/extra.ts': "import s from './s.module.scss'\ndocument.body.className = s.y\n",
          'src/main.ts': `${cssModuleFiles()['src/main.ts']}import './extra.ts'\n`,
        }),
      )
      try {
        const expected = atoms(...MAIN_ATOMS, 'inlineBlock')

        const built = await builtAtoms(app, leg)

        expect(built.atoms).toEqual(expected)
        expect(await devLayerAtoms(app.root, leg)).toEqual(expected)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('row 5: a dependency’s CSS Module is read, with no plugin message and no keepFor', async () => {
      const app = makeUsedApp(
        appFiles({
          ...cssModuleFiles(),
          'src/extra.ts': "import { z } from 'mod-lib'\ndocument.body.className = z\n",
          'src/main.ts': `${cssModuleFiles()['src/main.ts']}import './extra.ts'\n`,
        }),
      )
      addPackage(
        app,
        'mod-lib',
        {
          'index.js': "import s from './card.module.css'\nexport const z = s.z\n",
          'card.module.css': '.z { composes: nave-flex-col from global; }\n',
        },
        false,
      )
      try {
        const expected = atoms(...MAIN_ATOMS, 'flexCol')
        const built = await builtAtoms(app, leg)

        expect(built.atoms).toEqual(expected)
        expect(pluginWarnings(built.warnings)).toEqual([])
        expect(await devLayerAtoms(app.root, leg)).toEqual(expected)
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('a Vue <style module> block is read the same way, and a selector in it is not a use', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/Card.vue': `<template><div :class="$style['my-box']" /></template>
<style module>
.my-box { composes: nave-grid from global; }
.sel :global(.nave-block) { color: red; }
</style>
`,
          'src/main.ts': "import './app.css'\nimport Card from './Card.vue'\nconsole.log(Card)\n",
        }),
      )
      try {
        const plugins = [vuePlugin()]
        const built = await builtAtoms(app, leg, { plugins })

        expect(built.atoms).toEqual(['grid'])
        expect(await devLayerAtoms(app.root, leg, plugins)).toEqual(['grid'])
      } finally {
        app.dispose()
      }
    }, 60_000)
  },
)

describe('AC-used-atoms-61 — css.modules.exportGlobals (row 6)', () => {
  const GLOBALS = {
    css: { transformer: 'postcss', modules: { exportGlobals: true } },
  } as const satisfies InlineConfig

  it.each(Object.entries(VITE_APIS))(
    'also ships what a global selector exports, in the build and in the dev server alike ($0)',
    async (_version, api) => {
      const app = makeUsedApp(appFiles(cssModuleFiles()))
      try {
        const leg = { api, transformer: 'postcss' } as const
        const expected = atoms(...MAIN_ATOMS, 'block', 'hidden')
        const built = await builtAtoms(app, leg, { config: GLOBALS })

        expect(built.atoms).toEqual(expected)
        expect(await devLayerAtoms(app.root, leg, [], GLOBALS)).toEqual(expected)
      } finally {
        app.dispose()
      }
    },
    60_000,
  )
})

describe('AC-used-atoms-61 — the README and the changeset', () => {
  const README = readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
  const ACCESSIBILITY = /focus|screen reader|accessib/i
  const CHANGESET = {
    path: path.join(REPO_ROOT, '.changeset/core-reads-css-module-global-composes.md'),
    entryStart: 'A Nave class a CSS Module composes from global now ships its atom',
  }
  const CLAUSE = 'and each Nave class a CSS Module composes from global'

  /**
   * The section `#### Which atoms the build ships`, to the next heading.
   */
  function shipsSection(): string {
    const start = README.indexOf('#### Which atoms the build ships')
    const next = README.indexOf('\n#', start + 1)
    return README.slice(start, next)
  }

  it('names the case in the sentence about the atom of each Nave class written as text, once', () => {
    const section = shipsSection().replaceAll(/\s+/g, ' ')
    const sentenceStart = section.indexOf('for the atom of each Nave class written as text')

    expect(section.split(CLAUSE)).toHaveLength(2)
    expect(sentenceStart).toBeGreaterThan(0)
    expect(section.indexOf(CLAUSE)).toBeGreaterThan(sentenceStart)
    expect(section.indexOf(CLAUSE)).toBeLessThan(section.indexOf('; `srOnlyFocusable`'))
  })

  it('has a changeset that is a patch of @navecss/core and says the atom now ships, without an accessibility claim', () => {
    const prose = shippedChangesetProse(
      CHANGESET.path,
      path.join(CORE_ROOT, 'CHANGELOG.md'),
      CHANGESET.entryStart,
    )
    const isPatchOnCore = existsSync(CHANGESET.path)
      ? readFileSync(CHANGESET.path, 'utf8').startsWith("---\n'@navecss/core': patch\n---\n")
      : changelogEntries(readFileSync(path.join(CORE_ROOT, 'CHANGELOG.md'), 'utf8')).some(
          (entry) => entry.kind === 'Patch Changes' && entry.text.startsWith(CHANGESET.entryStart),
        )

    expect(isPatchOnCore).toBe(true)
    expect(prose).toContain('CSS Module')
    expect(prose).toContain('global')
    expect(prose).not.toMatch(ACCESSIBILITY)
  })
})
