/**
 * The used-atoms criteria for the one pair of atoms where one restores what the other removes
 * (AC-used-atoms-26, and the composition of two invocations, AC-used-atoms-14): `srOnly` hides an
 * element and `srOnlyFocusable` shows it again on focus, so a build that ships `srOnly` without
 * `srOnlyFocusable` leaves a skip link that carries both classes invisible and still focusable.
 * Whenever the emitted set holds `srOnly` it holds `srOnlyFocusable` too, whole.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { HANDSHAKE_FILE } from '../src/vite-handshake.ts'
import { classesOf, keepOnly, parseAtomicLayer } from './helpers/css-layer.ts'
import {
  appFiles,
  atomLayerAtoms,
  type Built,
  type BuildOptions,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import type { Transformer } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']
const PAIR = classesOf('srOnly', 'srOnlyFocusable')
const SKIP_LINK = '<a class="nave-sr-only nave-sr-only-focusable" href="#main">Skip</a>'

// Lightning CSS at Vite's own default browser targets, minifying: where it merges the two atoms'
// rules into one list, `.nave-sr-only,.nave-sr-only-focusable`. Vite minifies after the prune from
// 8.3 and while compiling the stylesheet (before the prune) on 8.2.1.
const VITE_DEFAULTS: Pick<BuildOptions, 'build' | 'config'> = {
  build: { cssTarget: undefined, cssMinify: 'lightningcss' },
  config: { css: { transformer: 'lightningcss' } },
}
const FLOOR: Pick<BuildOptions, 'build' | 'config'> = {}

const LEGS = [
  { name: 'postcss at the fixtures’ floor', transformer: 'postcss', settings: FLOOR },
  { name: 'lightningcss at the fixtures’ floor', transformer: 'lightningcss', settings: FLOOR },
  {
    name: 'lightningcss at Vite’s defaults, minifying',
    transformer: 'lightningcss',
    settings: VITE_DEFAULTS,
  },
] as const

/**
 * Builds `app` under a leg of the matrix with the layer left readable.
 */
function build(
  app: ReturnType<typeof makeUsedApp>,
  leg: (typeof LEGS)[number],
  extra: BuildOptions = {},
): Promise<Built> {
  return buildUsed(app, {
    transformer: leg.transformer,
    ...leg.settings,
    build: { cssMinify: false, ...leg.settings.build, ...extra.build },
    ...(leg.settings.config && { config: leg.settings.config }),
    ...(extra.options && { options: extra.options }),
  })
}

describe.each(LEGS)('AC-used-atoms-26 - srOnly always ships with srOnlyFocusable: $name', (leg) => {
  const states: [string, Record<string, string>, BuildOptions][] = [
    [
      "S2: the only use is cx('srOnly')",
      { 'src/App.ts': `${IMPORT}export const a = cx('srOnly')\n` },
      {},
    ],
    [
      "S3: no use, keep: ['srOnly']",
      { 'src/App.ts': 'export const a = 1\n' },
      { options: { keep: ['srOnly'] } },
    ],
    [
      'S4: nave-sr-only in index.html',
      {
        'index.html': `<!doctype html><html><body><p class="nave-sr-only">hidden</p><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`,
        'src/App.ts': 'export const a = 1\n',
      },
      {},
    ],
  ]

  it.each(states)(
    '%s: the layer is the full layer pruned to the pair',
    async (_name, files, extra) => {
      const app = makeUsedApp(appFiles(files))
      try {
        const used = await build(app, leg, extra)
        const all = await build(app, leg, { options: { atomic: 'all' } })
        const expected = keepOnly(parseAtomicLayer(all.css), PAIR)
        const handshake = JSON.parse(
          readFileSync(path.join(app.root, '.vite', HANDSHAKE_FILE), 'utf8'),
        ) as { emitted: string[] }

        expect(used.error).toBeUndefined()
        expect(parseAtomicLayer(used.css)).toEqual(expected)
        expect(atomLayerAtoms(used.css)).toEqual(['srOnly', 'srOnlyFocusable'])
        expect(expected.length).toBeGreaterThanOrEqual(2)
        expect(JSON.stringify(expected)).toContain('focus-visible')
        expect(JSON.stringify(expected)).toContain('focus-within')
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it('records both atoms in the cache file after S2, and a use of srOnlyFocusable alone adds no .nave-sr-only', async () => {
    const both = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('srOnly')\n` }))
    const alone = makeUsedApp(
      appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('srOnlyFocusable')\n` }),
    )
    try {
      await build(both, leg)
      const aloneBuilt = await build(alone, leg)
      const handshake = JSON.parse(
        readFileSync(path.join(both.root, '.vite', HANDSHAKE_FILE), 'utf8'),
      ) as { emitted: string[] }

      expect(handshake.emitted).toEqual(['srOnly', 'srOnlyFocusable'])
      expect(atomLayerAtoms(aloneBuilt.css)).toEqual(['srOnlyFocusable'])
      expect(JSON.stringify(parseAtomicLayer(aloneBuilt.css))).not.toMatch(
        /\.nave-sr-only(?![\w-])/,
      )
    } finally {
      both.dispose()
      alone.dispose()
    }
  }, 60_000)
})

/**
 * One app, one `cacheDir`, run as a pipeline of two invocations in either order, three times.
 */
async function pipeline(
  transformer: Transformer,
  server: string,
  client: string,
): Promise<{
  all: ReturnType<typeof parseAtomicLayer>
  runs: { order: string; run: number; serverError: string | undefined; client: Built }[]
}> {
  const app = makeUsedApp(
    appFiles({ 'src/App.ts': client, 'src/entry-server.ts': server }, ['src/App.ts']),
  )
  try {
    const clientBuild = (): Promise<Built> =>
      buildUsed(app, { transformer, build: { cssMinify: false } })
    const serverBuild = (): Promise<Built> =>
      buildUsed(app, {
        transformer,
        build: { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false },
      })
    const reference = await buildUsed(app, {
      transformer,
      options: { atomic: 'all' },
      build: { cssMinify: false },
    })
    const runs = []
    for (const order of ['server first', 'client first']) {
      for (let run = 1; run <= 3; run += 1) {
        const first = order === 'server first' ? await serverBuild() : await clientBuild()
        const second = order === 'server first' ? await clientBuild() : await serverBuild()
        runs.push({
          order,
          run,
          serverError: order === 'server first' ? first.error : second.error,
          client: order === 'server first' ? second : first,
        })
      }
    }
    return { all: parseAtomicLayer(reference.css), runs }
  } finally {
    app.dispose()
  }
}

describe.each(TRANSFORMERS)(
  'AC-used-atoms-14 - the pair across two invocations, %s',
  (transformer) => {
    it('a skip link and a focus ring only the server reads are whole in the client CSS, or the server build fails', async () => {
      const { all, runs } = await pipeline(
        transformer,
        `${IMPORT}export const s = ['<a class="nave-sr-only-focusable" href="#main">Skip</a>', cx('interactive', 'focusRing')]\n`,
        `${IMPORT}console.log(cx('flex'))\n`,
      )
      const kept = classesOf('focusRing', 'srOnlyFocusable')
      const expected = keepOnly(all, kept)

      expect(runs).toHaveLength(6)
      for (const { order, run, serverError, client } of runs) {
        const label = `${order} run ${run}`
        expect(client.error, label).toBeUndefined()
        const holdsBoth =
          JSON.stringify(keepOnly(parseAtomicLayer(client.css), kept)) === JSON.stringify(expected)
        expect(holdsBoth || serverError !== undefined, label).toBe(true)
        if (order === 'server first') expect(holdsBoth, label).toBe(true)
      }
    }, 240_000)

    it('a retried server build that missed fails again, and the next client build holds both atoms whole', async () => {
      const kept = classesOf('focusRing', 'srOnlyFocusable')
      const app = makeUsedApp(
        appFiles(
          {
            'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
            'src/entry-server.ts': `${IMPORT}export const s = ['<a class="nave-sr-only-focusable" href="#main">Skip</a>', cx('interactive', 'focusRing')]\n`,
          },
          ['src/App.ts'],
        ),
      )
      try {
        const clientBuild = (): Promise<Built> =>
          buildUsed(app, { transformer, build: { cssMinify: false } })
        const serverBuild = (): Promise<Built> =>
          buildUsed(app, {
            transformer,
            build: { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false },
          })
        const reference = await buildUsed(app, {
          transformer,
          options: { atomic: 'all' },
          build: { cssMinify: false },
        })
        const expected = keepOnly(parseAtomicLayer(reference.css), kept)

        await clientBuild()
        const first = await serverBuild()
        const again = await serverBuild()
        const next = await clientBuild()
        const last = await serverBuild()

        expect(first.error).toContain('focusRing')
        expect(again.error).toContain('focusRing')
        expect(next.error).toBeUndefined()
        expect(keepOnly(parseAtomicLayer(next.css), kept)).toEqual(expected)
        expect(last.error).toBeUndefined()
      } finally {
        app.dispose()
      }
    }, 240_000)

    it('whenever the client layer holds .nave-sr-only it holds srOnlyFocusable whole', async () => {
      const { all, runs } = await pipeline(
        transformer,
        `export const s = '${SKIP_LINK}'\n`,
        `${IMPORT}console.log(cx('srOnly'))\n`,
      )
      const expected = keepOnly(all, PAIR)

      expect(runs).toHaveLength(6)
      for (const { order, run, serverError, client } of runs) {
        const label = `${order} run ${run}`
        const layer = parseAtomicLayer(client.css)
        expect(client.error, label).toBeUndefined()
        expect(serverError, label).toBeUndefined()
        expect(JSON.stringify(layer), label).toMatch(/\.nave-sr-only(?![\w-])/)
        expect(keepOnly(layer, PAIR), label).toEqual(expected)
      }
    }, 240_000)
  },
)
