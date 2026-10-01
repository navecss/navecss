/**
 * AC-directive-core-36 and the `?raw` row of AC-directive-core-32: the Vite plugin changes nothing
 * about a project that holds no directive and sets no browser floor of its own, and a `?raw` import
 * hands back a stylesheet's text as it is.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolveConfig } from 'vite'

import { navePlugin } from '../src/vite.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import {
  appConfig,
  buildOutputs,
  devCss,
  makeApp,
  type ScratchApp,
  startDev,
  type Transformer,
} from './helpers/vite-app.ts'

const TRANSFORMERS: readonly Transformer[] = ['postcss', 'lightningcss']

const NO_DIRECTIVE = {
  'index.html': APP_FILES['index.html']!,
  'src/main.js': "import '@navecss/tokens/css'\nimport './app.css'",
  'src/app.css': [
    '.card { color: light-dark(#111, #eee); &:hover { color: red } }',
    '.chip { background: oklch(from var(--x, red) l c h); }',
    '',
  ].join('\n'),
}

let app: ScratchApp
let raw: ScratchApp
beforeAll(() => {
  app = makeApp(NO_DIRECTIVE)
  raw = makeApp({
    'index.html': APP_FILES['index.html']!,
    'src/main.js': "import text from './r.css?raw'\nconsole.log(text)",
    'src/r.css': '.raw { @nave flex; }\n',
  })
})
afterAll(() => {
  app.dispose()
  raw.dispose()
})

/**
 * A bare config, with neither floor key set by the project, so what the plugin leaves is what
 * Vite's own defaults give.
 */
function bare(root: string, transformer: Transformer, plugins: ReturnType<typeof navePlugin>[]) {
  return {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    plugins,
    css: { transformer },
  }
}

describe('AC-directive-core-36 — the plugin leaves the floor keys to the consumer', () => {
  it.each(TRANSFORMERS)(
    'under %s, both keys resolve identically with and without it',
    async (transformer) => {
      const without = await resolveConfig(bare(app.root, transformer, []), 'build')
      const withPlugin = await resolveConfig(bare(app.root, transformer, [navePlugin()]), 'build')

      expect(withPlugin.build.cssTarget).toEqual(without.build.cssTarget)
      expect(withPlugin.css.lightningcss).toEqual(without.css.lightningcss)
    },
  )

  it.each(TRANSFORMERS)(
    'under %s, a project with no directive emits byte-identical CSS',
    async (transformer) => {
      const without = await buildOutputs({
        ...bare(app.root, transformer, []),
        build: { write: false },
      })
      const withPlugin = await buildOutputs({
        ...bare(app.root, transformer, [navePlugin()]),
        build: { write: false },
      })

      expect(without.css.length).toBeGreaterThan(0)
      expect(withPlugin.assets).toEqual(without.assets)
    },
    30_000,
  )

  it('the documented floor keeps every light-dark(); build.cssTarget alone rewrites them (README claim)', async () => {
    const tokens = (css: string): number => css.split('light-dark(').length - 1
    const floor = await buildOutputs(appConfig(app.root, 'lightningcss', [navePlugin()]))
    const targetOnly = await buildOutputs({
      ...appConfig(app.root, 'lightningcss', [navePlugin()]),
      css: { transformer: 'lightningcss' },
    })

    expect(tokens(floor.css)).toBeGreaterThan(0)
    expect(tokens(targetOnly.css)).toBe(0)
  }, 30_000)
})

describe('AC-directive-core-32 — a ?raw import is returned as the file’s text', () => {
  it.each(TRANSFORMERS)(
    'in build under %s, @nave is unchanged',
    async (transformer) => {
      const { js } = await buildOutputs(appConfig(raw.root, transformer, [navePlugin()]))

      expect(js).toContain('@nave flex')
    },
    30_000,
  )

  it.each(TRANSFORMERS)(
    'in dev under %s, @nave is unchanged',
    async (transformer) => {
      const server = await startDev(appConfig(raw.root, transformer, [navePlugin()]))
      try {
        const result = await server.transformRequest('/src/r.css?raw')
        await devCss(server, '/src/main.js')

        expect(result?.code).toContain('@nave flex')
      } finally {
        await server.close()
      }
    },
    30_000,
  )
})
