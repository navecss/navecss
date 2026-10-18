/**
 * The criteria for plain Vite beside Astro (AC-astro-11, -13, -14): a project built by the
 * `vite build` command with a builder whose server environment writes assets first, or last, keeps
 * its verdicts, its client file names and its order-failure text, with one stated change.
 */
import { afterAll, describe, expect, it } from 'vitest'

import type { ScratchApp } from './helpers/vite-app.ts'
import type { PlainViteSettings } from './helpers/vite-cli.ts'

import { ALL_ATOMS } from './helpers/astro-checks.ts'
import { atomLayerAtoms, atoms } from './helpers/used-atoms-css.ts'
import { cssFiles, plainViteApp, runViteBuild } from './helpers/vite-cli.ts'

const apps: ScratchApp[] = []

afterAll(() => {
  for (const app of apps) app.dispose()
})

/**
 * Builds a project and keeps its output and the CSS it wrote.
 */
async function run(settings: PlainViteSettings): Promise<{
  app: ScratchApp
  client: Record<string, string>
  code: number | null
  output: string
  server: Record<string, string>
}> {
  const app = plainViteApp(settings)
  apps.push(app)
  const { code, output } = await runViteBuild(app)
  return {
    app,
    code,
    output,
    client: cssFiles(`${app.root}/dist`),
    server: cssFiles(`${app.root}/dist-ssr`),
  }
}

const FAILURE = [
  'The build read atoms after it wrote the CSS, so their rules are missing from it:',
  'src/entry-server.tsx: names grid, which the CSS already written does not hold.',
  'List the atoms in keep in navePlugin(), or build the server environments first with builder.buildApp in your Vite config.',
].join('\n')
const SECOND = 120_000

describe('AC-astro-14 — the plain Vite builder matrix: verdicts, file names and the order-failure text unchanged; one stated change', () => {
  it.each([false, true])(
    'client first, emitAssets %s: fails with the order-failure text',
    async (emitAssets) => {
      const built = await run({ order: ['client', 'ssr'], emitAssets })
      expect(built.code).not.toBe(0)
      expect(built.output).toContain(FAILURE)
      expect(built.output).not.toMatch(/\[plugin nave[^\]]*\][^\n]*warn/i)
    },
    SECOND,
  )

  it(
    'server first: green; with emitAssets on the client CSS is unchanged and the server’s stylesheet holds only grid',
    async () => {
      const off = await run({ order: ['ssr', 'client'], emitAssets: false })
      const on = await run({ order: ['ssr', 'client'], emitAssets: true })
      const spelled = await run({ order: ['ssr', 'client'], ssrEmitAssets: true })
      for (const built of [off, on, spelled]) {
        expect(built.code, built.output).toBe(0)
        expect(Object.values(built.client).map((css) => atomLayerAtoms(css))).toEqual([
          atoms('flex', 'grid'),
        ])
      }
      expect(on.client).toEqual(off.client)
      expect(spelled.client).toEqual(off.client)
      expect(Object.values(on.server).map((css) => atomLayerAtoms(css))).toEqual([['grid']])
      expect(Object.values(spelled.server).map((css) => atomLayerAtoms(css))).toEqual([['grid']])
      expect(Object.keys(off.server)).toEqual([])
      for (const built of [off, on, spelled]) expect(built.output).not.toMatch(/warn/i)
    },
    SECOND * 3,
  )
})

describe('AC-astro-16 — a separate server invocation writes its stylesheet as it always did', () => {
  it(
    'ships every atom in the stylesheet of vite build --ssr with ssrEmitAssets, the client unchanged',
    async () => {
      const app = plainViteApp({ order: ['client'], hasBuilder: false, ssrEmitAssets: true })
      apps.push(app)
      const server = await runViteBuild(app, [
        '--ssr',
        'src/entry-server.tsx',
        '--outDir',
        'dist-ssr',
      ])
      expect(server.code, server.output).toBe(0)
      const written = Object.values(cssFiles(`${app.root}/dist-ssr`))
      expect(written.map((css) => atomLayerAtoms(css))).toEqual([ALL_ATOMS])
      const client = await runViteBuild(app)
      expect(client.code, client.output).toBe(0)
      expect(Object.values(cssFiles(`${app.root}/dist`)).map((css) => atomLayerAtoms(css))).toEqual(
        [atoms('flex', 'grid')],
      )
    },
    SECOND * 2,
  )
})

const LIB_WARNING = (key: string): string =>
  `ssr-lib depends on @navecss/core, but no environment of this build transforms it, so the atoms its cx() calls name are not read. Add it to ${key} so the build reads it, or list the atoms its calls can produce under its name in keepFor in navePlugin().`
const SSR_LIB = {
  'ssr-lib': {
    'index.js': "import { cx } from '@navecss/core/cx'\nexport const a = cx('flexGrow')\n",
  },
}
const SERVER_WITH_LIB = {
  'src/entry-server.tsx':
    "import './app.css'\nimport { cx } from '@navecss/core/cx'\nimport { a } from 'ssr-lib'\nexport const s = [cx('grid'), a]\n",
}

describe('AC-astro-11 — on plain Vite the untransformed-dependency warning names the key that reaches the server environment', () => {
  const base = { files: SERVER_WITH_LIB, packages: SSR_LIB, options: "{ keep: ['grid'] }" }

  it(
    'names ssr.noExternal with the client first, unchanged',
    async () => {
      const built = await run({ ...base, order: ['client', 'ssr'] })
      expect(built.code, built.output).toBe(0)
      expect(built.output).toContain(LIB_WARNING('ssr.noExternal in your Vite config'))
    },
    SECOND,
  )

  it(
    'names resolve.noExternal with a server environment that writes assets first, and resolve.noExternal clears it',
    async () => {
      const warned = await run({ ...base, order: ['ssr', 'client'], emitAssets: true })
      expect(warned.code, warned.output).toBe(0)
      expect(warned.output).toContain(
        LIB_WARNING(
          'resolve.noExternal in your Vite config (on Astro, under vite in astro.config)',
        ),
      )
      const cleared = await run({
        ...base,
        order: ['ssr', 'client'],
        emitAssets: true,
        extra: "resolve: { noExternal: ['ssr-lib'] },",
      })
      expect(cleared.code, cleared.output).toBe(0)
      expect(cleared.output).not.toContain('depends on @navecss/core')
    },
    SECOND * 2,
  )

  it(
    'names ssr.noExternal when the server environment writes assets first but no stylesheet holding the layer, since the client writes the first one',
    async () => {
      const built = await run({
        ...base,
        order: ['ssr', 'client'],
        emitAssets: true,
        files: {
          'src/entry-server.tsx':
            "import { cx } from '@navecss/core/cx'\nimport { a } from 'ssr-lib'\nexport const s = [cx('grid'), a]\n",
        },
      })
      expect(built.code, built.output).toBe(0)
      expect(built.output).toContain(LIB_WARNING('ssr.noExternal in your Vite config'))
      expect(built.output).not.toContain('resolve.noExternal')
      expect(Object.keys(built.server)).toEqual([])
      expect(Object.values(built.client).map((css) => atomLayerAtoms(css))).toEqual([
        atoms('flex', 'grid'),
      ])
    },
    SECOND,
  )
})
