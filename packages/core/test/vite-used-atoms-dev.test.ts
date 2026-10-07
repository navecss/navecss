/* eslint-disable unicorn/consistent-function-scoping -- each fixture sits beside the criterion whose rows use it */
import type { InlineConfig, PluginOption } from 'vite'

/**
 * The used-atoms criteria for the dev server (AC-used-atoms-33, -39, -41, -42 and the dev
 * halves of -20 and -38): under the default the dev server filters the atomic layer of every
 * stylesheet it serves to the atoms the build would emit, as far as it has read. The dev server
 * runs in this process; the criteria that need a browser are in `vite-used-atoms-dev-browser`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { atomClassMap } from '../src/atoms.ts'
import { devServing } from '../src/vite-dev.ts'
import { navePlugin } from '../src/vite.ts'
import { classesOf, keepOnly, parseAtomicLayer } from './helpers/css-layer.ts'
import {
  addPackage,
  APP_CSS,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, devCss, startDev, stopDev } from './helpers/vite-app.ts'

/**
 * The dev server's config. Its dependency cache is under `node_modules`, where Vite keeps it by
 * default, so a prebundled file is a dependency's, as it is for a consumer.
 */
function devConfig(
  root: string,
  plugins: PluginOption[],
  server?: InlineConfig['server'],
): InlineConfig {
  return {
    ...appConfig(root, 'postcss', plugins),
    cacheDir: path.join(root, 'node_modules', '.vite'),
    ...(server && { server }),
  }
}

// The edits in these rows are made by a request and an event of the test's own, so the file
// watcher, which would report each write as well, is switched off.
// eslint-disable-next-line unicorn/no-null -- `null` is Vite's own spelling for "no watcher"
const NO_WATCHER = { watch: null }

/**
 * The CSS served for `src/app.css`, under its URL with or without the timestamp Vite adds after
 * the module was invalidated.
 */
function stylesheetOf(served: Record<string, string>): string {
  return Object.entries(served).find(([url]) => url.startsWith('/src/app.css'))?.[1] ?? ''
}

type DevServer = Awaited<ReturnType<typeof startDev>>

const PAGE = (body: string): string =>
  `<!doctype html><html><body>${body}<script type="module" src="/src/main.ts"></script></body></html>`

/**
 * Serves `/src/main.ts` and what it reaches, reading the page first as a browser's request for it
 * would, and returns the CSS served for `src/app.css`.
 */
async function servedLayer(server: DevServer, root: string): Promise<string> {
  await server.transformIndexHtml(
    '/index.html',
    readFileSync(path.join(root, 'index.html'), 'utf8'),
  )
  const served = await devCss(server, '/src/main.ts')
  const css = stylesheetOf(served)
  if (css === '') throw new Error(`no stylesheet was served: ${Object.keys(served).join(', ')}`)
  return css
}

describe('AC-used-atoms-33 — dev serves the set the build would emit', () => {
  const OPTIONS = { keep: ['grid'], keepFor: { 'bad-lib': ['block'] } } as const
  const EXPECTED = atoms('flex', 'hidden', 'grid', 'gap', 'block')

  function makeFixture(): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(
      appFiles({
        'index.html': PAGE('<p class="nave-hidden"></p>'),
        'src/App.ts': `${IMPORT}export const a = cx('flex')\n`,
        'src/uses.ts':
          "import { gap } from 'ok-lib'\nimport { x } from 'bad-lib'\nconsole.log(gap, x)\n",
      }),
    )
    addPackage(app, 'ok-lib', { 'index.js': `${IMPORT}export const gap = cx('gap')\n` })
    addPackage(app, 'bad-lib', { 'index.js': `${IMPORT}export const x = (v) => cx(v)\n` })
    return app
  }

  it('names the same atoms as the build, each with the rules the full layer gives it', async () => {
    const app = makeFixture()
    try {
      const used = await startDev(devConfig(app.root, [navePlugin(OPTIONS)]))
      const all = await startDev(devConfig(app.root, [navePlugin({ atomic: 'all' })]))
      try {
        const dev = await servedLayer(used, app.root)
        const full = await servedLayer(all, app.root)
        const built = await buildUsed(app, { options: OPTIONS })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(dev)).toEqual(EXPECTED)
        expect(atomLayerAtoms(built.css)).toEqual(EXPECTED)
        expect(parseAtomicLayer(dev)).toEqual(
          keepOnly(parseAtomicLayer(full), classesOf(...EXPECTED)),
        )
        // The control: the dev layer under 'all' names every built-in atom, so the comparison
        // can see a dev server that does not filter.
        expect(atomLayerAtoms(full)).toHaveLength(Object.keys(atomClassMap).length)
      } finally {
        await stopDev(used)
        await stopDev(all)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('writes the cache file with exactly the emitted set after a green build', async () => {
    const app = makeFixture()
    try {
      const built = await buildUsed(app, { options: OPTIONS })
      const file = JSON.parse(
        readFileSync(path.join(app.root, '.vite', 'nave-used-atoms.json'), 'utf8'),
      ) as { emitted: string[] }

      expect(built.error).toBeUndefined()
      expect(file.emitted.toSorted((a, b) => a.localeCompare(b))).toEqual(EXPECTED)
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('reports no error naming bad-lib in dev with its keepFor entry removed, while the build fails on it', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(devConfig(app.root, [navePlugin({ keep: ['grid'] })]))
      try {
        await expect(server.transformRequest('/src/uses.ts')).resolves.toBeTruthy()
        await expect(
          server.transformRequest('/node_modules/bad-lib/index.js'),
        ).resolves.toBeTruthy()
        const built = await buildUsed(app, { options: { keep: ['grid'] } })
        expect(built.error).toContain('bad-lib')
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('gives a per-module error for each application module the build cannot read, with keep empty', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/Bad.ts': `${IMPORT}export const a = (variant: string) => cx(variant as never)\n`,
        'src/Unk.ts': `${IMPORT}export const a = cx('interactve' as never)\n`,
        'src/Cat.ts': `export const a = (tone: string) => 'nave-' + tone\n`,
        'src/Dyn.ts': `${IMPORT}export const a = (t: string) => cx.dynamic(t as never)\n`,
      }),
    )
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()]))
      try {
        for (const file of ['Bad', 'Unk', 'Cat', 'Dyn']) {
          await expect(server.transformRequest(`/src/${file}.ts`)).rejects.toThrow(
            `src/${file}.ts:`,
          )
        }
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-39 — a dependency’s calls are read in dev, on a cold and a warm optimizer cache', () => {
  function makeFixture(): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(
      appFiles({
        'src/App.ts': `${IMPORT}import { libClass } from 'fake-lib'\nexport const a = [cx('flex'), libClass()]\n`,
      }),
      'copy',
    )
    addPackage(app, 'fake-lib', {
      'index.js': `${IMPORT}export const libClass = () => cx('wFull')\n`,
    })
    return app
  }

  it('serves a rule for wFull both times, with core excluded from prebundling and the build emitting the same set', async () => {
    const app = makeFixture()
    try {
      for (const _run of ['cold', 'warm']) {
        const server = await startDev(devConfig(app.root, [navePlugin()]))
        try {
          const layer = await servedLayer(server, app.root)
          const chunk = readFileSync(
            path.join(app.root, 'node_modules', '.vite', 'deps', 'fake-lib.js'),
            'utf8',
          )

          expect(atomLayerAtoms(layer)).toEqual(atoms('flex', 'wFull'))
          expect(server.config.optimizeDeps.exclude).toContain('@navecss/core')
          expect(chunk).toMatch(/import \{ cx \} from ["']@navecss\/core\/cx["']/)
        } finally {
          await stopDev(server)
        }
      }
      const built = await buildUsed(app)
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'wFull'))
    } finally {
      app.dispose()
    }
  }, 180_000)

  it('control: without core excluded from prebundling the layer holds no wFull rule in either run', async () => {
    const app = makeFixture()
    try {
      for (const _run of ['cold', 'warm']) {
        const [nave, collect] = navePlugin()
        const scratch = {
          ...nave,
          config: () => {
            const { optimizeDeps: _excluded, ...kept } = nave.config() as unknown as Record<
              string,
              unknown
            >
            return kept
          },
        }
        const server = await startDev(devConfig(app.root, [scratch as never, collect]))
        try {
          expect(atomLayerAtoms(await servedLayer(server, app.root))).toEqual(atoms('flex'))
        } finally {
          await stopDev(server)
        }
      }
    } finally {
      app.dispose()
    }
  }, 180_000)
})

interface Update {
  readonly type: string
  readonly updates?: readonly { readonly path: string }[]
}

/**
 * Records what the client environment's channel sends from now on, passing it on.
 */
function recordUpdates(server: DevServer): Update[] {
  const { hot } = server.environments.client
  const sent: Update[] = []
  const send = hot.send.bind(hot)
  Object.assign(hot, {
    send: (payload: Parameters<typeof send>[0]) => {
      sent.push(payload as unknown as Update)
      send(payload)
    },
  })
  return sent
}

/**
 * Whether `sent` holds, within `ms`, an update that names every one of `paths`.
 */
async function isUpdateSent(
  sent: readonly Update[],
  paths: readonly string[],
  ms: number,
): Promise<boolean> {
  const isWanted = (): boolean =>
    sent.some((update) => {
      const named = update.updates?.map((entry) => entry.path) ?? []
      return paths.every((path) => named.includes(path))
    })
  const deadline = Date.now() + ms
  while (Date.now() < deadline && !isWanted()) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return isWanted()
}

/**
 * Writes `src/App.ts` with `body`, invalidates it as a change would, and requests it again.
 */
async function edit(server: DevServer, root: string, body: string): Promise<void> {
  writeFileSync(path.join(root, 'src/App.ts'), `${IMPORT}export const a = ${body}\n`)
  const { moduleGraph } = server.environments.client
  moduleGraph.invalidateModule(moduleGraph.getModuleById(path.join(root, 'src/App.ts'))!)
  await server.transformRequest('/src/App.ts')
}

/**
 * Invalidates the stylesheet, as the browser's reload of it would, and serves it again.
 */
async function stylesheetServedAgain(server: DevServer, root: string): Promise<string> {
  const { moduleGraph } = server.environments.client
  moduleGraph.invalidateModule(moduleGraph.getModuleById(path.join(root, 'src/app.css'))!)
  return stylesheetOf(await devCss(server, '/src/main.ts'))
}

const ACCEPTING = (body: string): string =>
  `${IMPORT}export const a = ${body}\nif (import.meta.hot) import.meta.hot.accept()\n`

describe('AC-used-atoms-41 — a set that grows reloads the stylesheet, with no page reload', () => {
  it('sends a reload of app.css when an edit adds an atom, serves its rule, and drops it when the edit is reverted', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        expect(atomLayerAtoms(await servedLayer(server, app.root))).toEqual(atoms('flex'))

        const sent = recordUpdates(server)
        await edit(server, app.root, "cx('flex', 'block')")
        const isSent = await isUpdateSent(sent, ['/src/app.css'], 10_000)
        const grown = await stylesheetServedAgain(server, app.root)

        expect(isSent).toBe(true)
        expect(atomLayerAtoms(grown)).toEqual(atoms('block', 'flex'))

        await edit(server, app.root, "cx('flex')")
        const shrunk = await stylesheetServedAgain(server, app.root)
        expect(atomLayerAtoms(shrunk)).toEqual(atoms('flex'))
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('sends the stylesheet in the same update as the script whose edit grew the set', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': ACCEPTING("cx('flex')") }))
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        await servedLayer(server, app.root)
        const sent = recordUpdates(server)
        const file = path.join(app.root, 'src/App.ts')
        writeFileSync(file, ACCEPTING("cx('flex', 'block')"))
        server.watcher.emit('change', file)

        expect(await isUpdateSent(sent, ['/src/App.ts', '/src/app.css'], 10_000)).toBe(true)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('batches: several modules adding atoms in one burst send one reload of app.css, and none from inside the transform that grew the set', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/App.ts': `${IMPORT}export const a = cx('flex')\n`,
        'src/B.ts': 'export {}\n',
        'src/C.ts': 'export {}\n',
      }),
    )
    // The reloads asked for by the time the plugin chain of a module ends, after Nave read it.
    const sentAtEnd: Record<string, number> = {}
    let reloadsNow: (() => number) | undefined
    const probe: PluginOption = {
      name: 'probe-reloads',
      enforce: 'post',
      transform(_code: string, id: string) {
        if (reloadsNow && (id.endsWith('src/B.ts') || id.endsWith('src/C.ts'))) {
          sentAtEnd[path.basename(id)] = reloadsNow()
        }
        return
      },
    }
    try {
      const server = await startDev(devConfig(app.root, [navePlugin(), probe], NO_WATCHER))
      try {
        await servedLayer(server, app.root)
        const sent = recordUpdates(server)
        const reloads = (): Update[] =>
          sent.filter((update) => update.updates?.some((entry) => entry.path === '/src/app.css'))
        const { client } = server.environments
        const askedFor: string[] = []
        const reloadModule = client.reloadModule.bind(client)
        client.reloadModule = (module) => {
          askedFor.push(module.id ?? '')
          return reloadModule(module)
        }
        reloadsNow = () => askedFor.length
        const { moduleGraph } = server.environments.client
        writeFileSync(path.join(app.root, 'src/B.ts'), `${IMPORT}export const b = cx('gap')\n`)
        writeFileSync(path.join(app.root, 'src/C.ts'), `${IMPORT}export const c = cx('grid')\n`)
        for (const file of ['src/B.ts', 'src/C.ts']) {
          moduleGraph.invalidateModule(moduleGraph.getModuleById(path.join(app.root, file))!)
          await server.transformRequest(`/${file}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 300))

        expect(sentAtEnd['B.ts']).toBe(0)
        expect(reloads()).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('control: without the stylesheet reload nothing is sent when the set grows', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const saved = { ...devServing }
    devServing.noteGrowth = () => {}
    devServing.modulesWithGrown = () => Promise.resolve(undefined)
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        await servedLayer(server, app.root)
        const sent = recordUpdates(server)

        await edit(server, app.root, "cx('flex', 'block')")

        expect(await isUpdateSent(sent, ['/src/app.css'], 1000)).toBe(false)
      } finally {
        await stopDev(server)
      }
    } finally {
      Object.assign(devServing, saved)
      app.dispose()
    }
  }, 60_000)
})

/**
 * A scratch plugin that takes `delay` milliseconds over the module `file`, so a request for the
 * stylesheet comes while that module is still being read.
 */
function slow(file: string, delay: number): PluginOption {
  return {
    name: 'slow-module',
    async transform(_code: string, id: string) {
      if (id.endsWith(file)) await new Promise((resolve) => setTimeout(resolve, delay))
      return
    },
  }
}

describe('AC-used-atoms-40 — the first stylesheet response waits for the graph', () => {
  const files = {
    'src/A.ts': `${IMPORT}import './B.ts'\nexport const a = cx('flex')\n`,
    'src/B.ts': `${IMPORT}import './C.ts'\nexport const b = cx('gap')\n`,
    'src/C.ts': `${IMPORT}export const c = cx('grid')\n`,
  }

  async function atomsServedAtOnce(): Promise<string[]> {
    const app = makeUsedApp(appFiles(files))
    try {
      const server = await startDev(devConfig(app.root, [slow('src/C.ts', 300), navePlugin()]))
      try {
        // Only main.ts has been requested when the stylesheet is: the three modules below it are
        // read by the wait or by nothing.
        await server.transformRequest('/src/main.ts')
        const css = await server.transformRequest('/src/app.css')
        const served: unknown = JSON.parse(
          /const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(css!.code)![1]!,
        )
        return atomLayerAtoms(served as string)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it('serves a stylesheet requested before the modules that name atoms with those atoms', async () => {
    expect(await atomsServedAtOnce()).toEqual(atoms('flex', 'gap', 'grid'))
  }, 60_000)

  it('control: with the wait removed the stylesheet is served with what had been read', async () => {
    const saved = { ...devServing }
    devServing.hold = () => Promise.resolve()
    try {
      expect(await atomsServedAtOnce()).not.toEqual(atoms('flex', 'gap', 'grid'))
    } finally {
      Object.assign(devServing, saved)
    }
  }, 60_000)
})

describe('AC-used-atoms-40 — what the wait reaches', () => {
  it('reads a lazy module only the root of the importing graph reaches, not just the stylesheet’s direct importer', async () => {
    const app = makeUsedApp({
      'src/app.css': APP_CSS,
      'src/main.ts': "import './Layout.ts'\nexport const lazy = () => import('./Other.ts')\n",
      'src/Layout.ts': `${IMPORT}import './app.css'\nexport const l = cx('flex')\n`,
      'src/Other.ts': `${IMPORT}export const o = cx('grid')\n`,
    })
    try {
      const server = await startDev(devConfig(app.root, [slow('src/Other.ts', 300), navePlugin()]))
      try {
        await server.transformRequest('/src/main.ts')
        await server.transformRequest('/src/Layout.ts')
        const css = await server.transformRequest('/src/app.css')
        const served: unknown = JSON.parse(
          /const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(css!.code)![1]!,
        )

        expect(atomLayerAtoms(served as string)).toEqual(atoms('flex', 'grid'))
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('a stylesheet no module imports is answered at once, with the atoms of the pages read so far', async () => {
    const app = makeUsedApp({
      'index.html':
        '<!doctype html><link rel="stylesheet" href="/src/linked.css"><p class="nave-hidden"></p>',
      'src/linked.css': APP_CSS,
      'src/app.css': APP_CSS,
      'src/main.ts': "import './app.css'\n",
    })
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()]))
      try {
        const waits: string[] = []
        const { client } = server.environments
        const wait = client.waitForRequestsIdle.bind(client)
        client.waitForRequestsIdle = (id?: string) => {
          waits.push(id ?? '')
          return wait(id)
        }
        await server.transformIndexHtml(
          '/index.html',
          readFileSync(path.join(app.root, 'index.html'), 'utf8'),
        )
        const css = await server.transformRequest('/src/linked.css?direct')

        expect(waits).toEqual([])
        expect(atomLayerAtoms(css!.code)).toEqual(atoms('hidden'))

        await server.transformRequest('/src/main.ts')
        await server.transformRequest('/src/app.css')
        expect(waits).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-42 — what dev shows as the build will, and the divergences', () => {
  function makeFixture(): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(
      appFiles(
        {
          'index.html': PAGE('<a class="nave-sr-only-focusable" href="#main">Skip</a>'),
          'src/App.ts': [
            IMPORT,
            "import { kf } from 'kf-lib'",
            "export const a = [cx('flex'), kf('inlineFlex')]",
            "if (import.meta.env.DEV) console.log(cx('grid'))",
            '',
          ].join('\n'),
          'src/server-only.ts': `${IMPORT}export const s = cx('itemsCenter')\n`,
        },
        ['src/App.ts'],
      ),
    )
    addPackage(app, 'kf-lib', { 'index.js': `${IMPORT}export const kf = (v) => cx(v)\n` })
    return app
  }
  const OPTIONS = { keepFor: { 'kf-lib': ['block'] } } as const

  it('reads the page before the stylesheet, keeps a dev-only branch, and collects a server render of the dev process', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(devConfig(app.root, [navePlugin(OPTIONS)]))
      try {
        await server.ssrLoadModule('/src/server-only.ts')
        const dev = await servedLayer(server, app.root)
        const built = await buildUsed(app, { options: OPTIONS })

        expect(atomLayerAtoms(dev)).toEqual(
          atoms('block', 'flex', 'grid', 'itemsCenter', 'srOnlyFocusable'),
        )
        expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex', 'grid', 'srOnlyFocusable'))
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('a branch that holds only an import of a dev-only module is read by the build too: dev and the build agree', async () => {
    const app = makeUsedApp(
      appFiles(
        {
          'src/App.ts': `${IMPORT}export const a = cx('flex')\nif (import.meta.env.DEV) import('./dev-only.ts')\n`,
          'src/dev-only.ts': `${IMPORT}export const d = cx('grid')\n`,
        },
        ['src/App.ts'],
      ),
    )
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()]))
      try {
        const dev = await servedLayer(server, app.root)
        const built = await buildUsed(app)

        expect(atomLayerAtoms(dev)).toEqual(atoms('flex', 'grid'))
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('control: with inlineFlex added to the package’s list, the dev layer has its rule', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(
        devConfig(app.root, [navePlugin({ keepFor: { 'kf-lib': ['block', 'inlineFlex'] } })]),
      )
      try {
        expect(atomLayerAtoms(await servedLayer(server, app.root))).toContain('inlineFlex')
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)
})

/**
 * Waits for the dependency optimizer to write its metadata, which it does once its crawl ends.
 */
async function optimized(root: string): Promise<void> {
  const file = path.join(root, 'node_modules', '.vite', 'deps', '_metadata.json')
  for (let tries = 0; tries < 200 && !existsSync(file); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * The dev server's config for a row that looks only at the process-wide keep map. Dependency
 * discovery is off, so no scan of the app's dependencies is running when the row closes the
 * server and removes the app's directory.
 */
function keepMapConfig(root: string, plugins: PluginOption[]): InlineConfig {
  return { ...devConfig(root, plugins), optimizeDeps: { noDiscovery: true } }
}

describe('AC-used-atoms-20 — the define in dev: server renders and the optimizer', () => {
  function makeFixture(): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(
      appFiles({
        'src/ssr.ts': "import { tone } from 'dyn-lib'\nexport default tone('grid')\n",
        'src/ssr2.ts': "import { tone } from 'dyn-lib'\nexport default tone('grid')\n",
        'src/client.ts': "import { tone } from 'dyn-lib'\nexport const c = tone('flex')\n",
      }),
      'copy',
    )
    addPackage(app, 'dyn-lib', {
      'index.js': `${IMPORT}export const tone = (t) => cx.dynamic(t)\n`,
    })
    return app
  }

  it('(c) a server render in the dev process gives "" for an atom outside keep and keepFor', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(
        devConfig(app.root, [navePlugin({ keep: ['flex'], keepFor: { 'dyn-lib': ['block'] } })]),
      )
      try {
        const module = (await server.ssrLoadModule('/src/ssr.ts')) as { default: string }
        expect(module.default).toBe('')
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('a server render takes a listed atom through the same map', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(devConfig(app.root, [navePlugin({ keep: ['grid'] })]))
      try {
        const module = (await server.ssrLoadModule('/src/ssr.ts')) as { default: string }
        expect(module.default).toBe('nave-grid')
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  const render = async (server: DevServer, file: string): Promise<string> =>
    ((await server.ssrLoadModule(file)) as { default: string }).default

  it('a restart keeps the map: a fresh render gives "" before and after it, and the global stays', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(keepMapConfig(app.root, [navePlugin({ keep: ['flex'] })]))
      try {
        const before = await render(server, '/src/ssr.ts')
        await server.restart()
        const after = await render(server, '/src/ssr2.ts')

        expect({ before, after }).toEqual({ before: '', after: '' })
        expect('__NAVE_KEEP_CLASSES__' in globalThis).toBe(true)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('with two dev servers in one process, closing the second leaves the first its own map', async () => {
    const first = makeFixture()
    const second = makeFixture()
    try {
      const a = await startDev(keepMapConfig(first.root, [navePlugin({ keep: ['flex'] })]))
      const b = await startDev(keepMapConfig(second.root, [navePlugin({ keep: ['grid'] })]))
      try {
        await stopDev(b)

        expect(await render(a, '/src/ssr.ts')).toBe('')
      } finally {
        await stopDev(a)
      }
      expect('__NAVE_KEEP_CLASSES__' in globalThis).toBe(false)
    } finally {
      first.dispose()
      second.dispose()
    }
  }, 120_000)

  it('closing the servers in the order they started leaves the second its own map, and then gives the global back what it held', async () => {
    const first = makeFixture()
    const second = makeFixture()
    const held = { flex: 'held' }
    Object.assign(globalThis, { __NAVE_KEEP_CLASSES__: held })
    try {
      const a = await startDev(keepMapConfig(first.root, [navePlugin({ keep: ['flex'] })]))
      const b = await startDev(keepMapConfig(second.root, [navePlugin({ keep: ['grid'] })]))
      try {
        await stopDev(a)

        expect(await render(b, '/src/ssr.ts')).toBe('nave-grid')
      } finally {
        await stopDev(b)
      }
      expect((globalThis as Record<string, unknown>).__NAVE_KEEP_CLASSES__).toBe(held)
    } finally {
      Reflect.deleteProperty(globalThis, '__NAVE_KEEP_CLASSES__')
      first.dispose()
      second.dispose()
    }
  }, 120_000)

  it('closing the only dev server gives the global back what it held before it started', async () => {
    const app = makeFixture()
    const held = { flex: 'held' }
    Object.assign(globalThis, { __NAVE_KEEP_CLASSES__: held })
    try {
      const server = await startDev(keepMapConfig(app.root, [navePlugin({ keep: ['flex'] })]))
      const during = (globalThis as Record<string, unknown>).__NAVE_KEEP_CLASSES__
      await stopDev(server)

      expect(during).not.toBe(held)
      expect((globalThis as Record<string, unknown>).__NAVE_KEEP_CLASSES__).toBe(held)
    } finally {
      Reflect.deleteProperty(globalThis, '__NAVE_KEEP_CLASSES__')
      app.dispose()
    }
  }, 60_000)

  it('a server whose close fails in a plugin of its own still gives the global back what it held', async () => {
    const app = makeFixture()
    try {
      // Vite 8.2.1 skips the close hooks of an environment whose `buildEnd` throws, so the
      // server's own close is what has to take the map off.
      const failsToClose: PluginOption = {
        name: 'fails-to-close',
        buildEnd() {
          throw new Error('this plugin cannot close')
        },
      }
      const server = await startDev(
        keepMapConfig(app.root, [navePlugin({ keep: ['flex'] }), failsToClose]),
      )
      expect('__NAVE_KEEP_CLASSES__' in globalThis).toBe(true)
      await stopDev(server)

      expect('__NAVE_KEEP_CLASSES__' in globalThis).toBe(false)
    } finally {
      Reflect.deleteProperty(globalThis, '__NAVE_KEEP_CLASSES__')
      app.dispose()
    }
  }, 60_000)

  it('dyn-lib’s prebundled chunk keeps core’s import and holds no keep map', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(
        devConfig(app.root, [navePlugin({ keep: ['flex'], keepFor: { 'dyn-lib': ['block'] } })]),
      )
      try {
        await server.transformRequest('/src/main.ts')
        await optimized(app.root)
        const chunk = readFileSync(
          path.join(app.root, 'node_modules', '.vite', 'deps', 'dyn-lib.js'),
          'utf8',
        )

        expect(chunk).toContain('cx.dynamic(')
        expect(chunk).toMatch(/import \{ cx \} from ["']@navecss\/core\/cx["']/)
        for (const absent of [
          '__NAVE_KEEP_CLASSES__',
          'nave-flex',
          'nave-block',
          'applied no class',
        ]) {
          expect(chunk).not.toContain(absent)
        }
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('the resolved define has exactly one key more than under all, and the optimizer’s hash does not change with keep', async () => {
    const app = makeFixture()
    const hashWith = async (keep: readonly string[]): Promise<string> => {
      const server = await startDev(devConfig(app.root, [navePlugin({ keep: keep as never })]))
      try {
        await server.transformRequest('/src/main.ts')
        await optimized(app.root)
        const metadata = readFileSync(
          path.join(app.root, 'node_modules', '.vite', 'deps', '_metadata.json'),
          'utf8',
        )
        const all = await startDev(devConfig(app.root, [navePlugin({ atomic: 'all' })]))
        try {
          expect(
            Object.keys(server.config.define ?? {}).length -
              Object.keys(all.config.define ?? {}).length,
          ).toBe(1)
        } finally {
          await stopDev(all)
        }
        return (JSON.parse(metadata) as { hash: string }).hash
      } finally {
        await stopDev(server)
      }
    }
    try {
      const first = await hashWith(['flex'])
      expect(await hashWith(['grid'])).toBe(first)
    } finally {
      app.dispose()
    }
  }, 120_000)
})
