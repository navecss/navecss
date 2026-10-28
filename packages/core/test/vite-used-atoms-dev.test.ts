/* eslint-disable unicorn/consistent-function-scoping -- each fixture sits beside the criterion whose rows use it */
import type { InlineConfig, PluginOption, ViteDevServer } from 'vite'

/**
 * The used-atoms criteria for the dev server (AC-used-atoms-33, -39, -41, -42, the dev
 * halves of -20 and -38, and the dev reading of a CSS Module in -61): under the default the dev server filters the atomic layer of every
 * stylesheet it serves to the atoms the build would emit, as far as it has read. The dev server
 * runs in this process; the criteria that need a browser are in `vite-used-atoms-dev-browser`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { atomClassMap } from '../src/atoms.ts'
import { type DevServing, devServing } from '../src/vite-dev.ts'
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
import { CARD_MODULE, cssModuleFiles } from './helpers/used-atoms-css-modules.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, devCss, startDev, stopDev, type Transformer } from './helpers/vite-app.ts'

/**
 * The dev server's config. Its dependency cache is under `node_modules`, where Vite keeps it by
 * default, so a prebundled file is a dependency's, as it is for a consumer.
 */
function devConfig(
  root: string,
  plugins: PluginOption[],
  server?: InlineConfig['server'],
  transformer: Transformer = 'postcss',
): InlineConfig {
  return {
    ...appConfig(root, transformer, plugins),
    cacheDir: path.join(root, 'node_modules', '.vite'),
    ...(server && { server }),
  }
}

/**
 * `config` with dependency discovery off: no dependency is prebundled, so the optimizer never runs
 * under the server and a file of a dependency is served as it is on disk.
 */
function withoutDiscovery(config: InlineConfig): InlineConfig {
  return { ...config, optimizeDeps: { ...config.optimizeDeps, noDiscovery: true } }
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
      // Under load the dependency optimizer can run again while a request is being served, and
      // Vite then refuses the request for a prebundled file it has replaced as outdated. These
      // two servers also share the app's dependency cache. The row compares atoms and rules, not
      // how a dependency is prebundled (the next criterion's rows exercise that), so discovery
      // is off and the libraries are served as they are.
      const config = (plugin: PluginOption): InlineConfig =>
        withoutDiscovery(devConfig(app.root, [plugin]))
      const used = await startDev(config(navePlugin(OPTIONS)))
      const all = await startDev(config(navePlugin({ atomic: 'all' })))
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
  })

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
  })

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
  })

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
  })
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
  })

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
  })
})

interface Update {
  readonly type: string
  readonly path?: string
  readonly updates?: readonly { readonly path: string }[]
}

/**
 * The most a row waits for an update it expects the dev server to send. A row that has the update
 * does not wait for this long: it is only what bounds a row whose update never comes.
 */
const UPDATE_CEILING_MS = 30_000

/**
 * What the client environment's channel has sent since `recordUpdates`, and a wait for the send
 * of one update.
 */
interface Recording {
  readonly sent: readonly Update[]
  /**
   * Resolves `true` as soon as an update naming every one of `paths` has been sent, or `false`
   * once `ms` have passed without one.
   */
  isSent(paths: readonly string[], ms: number): Promise<boolean>
}

/**
 * Records what the client environment's channel sends from now on, passing it on.
 */
function recordUpdates(server: DevServer): Recording {
  const { hot } = server.environments.client
  const sent: Update[] = []
  const listeners = new Set<() => void>()
  const send = hot.send.bind(hot)
  Object.assign(hot, {
    send: (payload: Parameters<typeof send>[0]) => {
      sent.push(payload as unknown as Update)
      for (const listener of listeners) listener()
      send(payload)
    },
  })
  const isNaming = (paths: readonly string[]): boolean =>
    sent.some((update) => {
      const named = update.updates?.map((entry) => entry.path) ?? []
      return paths.every((path) => named.includes(path))
    })
  return {
    sent,
    isSent: (paths, ms) =>
      new Promise<boolean>((resolve) => {
        const finish = (isFound: boolean): void => {
          clearTimeout(timer)
          listeners.delete(check)
          resolve(isFound)
        }
        const check = (): void => {
          if (isNaming(paths)) finish(true)
        }
        const timer = setTimeout(() => {
          finish(false)
        }, ms)
        listeners.add(check)
        check()
      }),
  }
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

/**
 * Resolves once the server has asked for a reload of a module, as Nave does for a stylesheet whose
 * atoms were outgrown, and rejects after `ms`. `stop` ends the watch.
 */
function reloadAsked(server: DevServer, ms: number): { done: Promise<void>; stop: () => void } {
  const { client } = server.environments
  const reloadModule = client.reloadModule.bind(client)
  let timer: NodeJS.Timeout | undefined
  const stop = (): void => {
    clearTimeout(timer)
    client.reloadModule = reloadModule
  }
  const done = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      stop()
      reject(new Error('no reload of a stylesheet was asked for'))
    }, ms)
    client.reloadModule = async (module) => {
      try {
        await reloadModule(module)
      } finally {
        stop()
        resolve()
      }
    }
  })
  return { done, stop }
}

/**
 * `servedLayer`, for a row that starts from the layer naming `expected`. The stylesheet can be
 * served from the warm-up that follows the entry's first transform, before the modules that name
 * atoms have been read; the dev server then asks for a reload of it once they are, and the
 * request after that reload is the one that names them. A row that compares the first layer, or
 * counts the reloads sent, waits for that reload and reads again, so it does not read the answer
 * that was about to be replaced. A reload that never comes leaves the first answer, which the
 * row then fails on.
 */
async function servedOnceRead(
  server: DevServer,
  root: string,
  expected: readonly string[],
): Promise<string> {
  const reload = reloadAsked(server, UPDATE_CEILING_MS)
  const layer = await servedLayer(server, root)
  if (atomLayerAtoms(layer).join(',') === expected.join(',')) {
    reload.stop()
    return layer
  }
  try {
    await reload.done
  } catch {
    return layer
  }
  return servedLayer(server, root)
}

/**
 * Counts the times the plugin is told that the set of atoms may have grown, which it is at the end
 * of the transform of each module it reads, and passes each on. `stop` ends the count.
 */
function noteGrowths(): { readonly count: number; stop: () => void } {
  const saved = { ...devServing }
  const counted = {
    count: 0,
    stop: () => {
      Object.assign(devServing, saved)
    },
  }
  devServing.noteGrowth = (context) => {
    counted.count += 1
    saved.noteGrowth(context)
  }
  return counted
}

/**
 * Resolves on the next turn of the event loop, after the timers made before it: anything the
 * plugin schedules for its next turn, as its reload is, has gone out by then.
 */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * Runs `body` with the clock standing still and the plugin's growth notes counted. A reload the
 * page has not answered holds the next one back for 2 s of the clock, so a row that edits again
 * after the first update is at the mercy of a machine that takes longer than that between the
 * two; with the clock still, the reload stays unanswered for as long as the row says. Timers
 * stay real. `body` moves the clock itself if the row is about what happens after the 2 s.
 */
async function withClockStopped(
  body: (growth: ReturnType<typeof noteGrowths>) => Promise<void>,
): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] })
  const growth = noteGrowths()
  try {
    await body(growth)
  } finally {
    growth.stop()
    vi.useRealTimers()
  }
}

/**
 * `edit`, then waits until the plugin has decided what the edit's growth means for the reloads:
 * it is told of the growth at the end of the edited module's transform, and sends what it
 * decided on the next turn of the event loop.
 */
async function editAndDecide(
  server: DevServer,
  root: string,
  body: string,
  growth: ReturnType<typeof noteGrowths>,
): Promise<void> {
  const noted = growth.count
  await edit(server, root, body)
  expect(growth.count).toBeGreaterThan(noted)
  await nextTurn()
}

/**
 * A scratch plugin, listed ahead of `navePlugin()`, that keeps what the dev server listens for on
 * the client channel when a page connects or disconnects, so a row can stand a page's connection
 * in without a browser. `connect` and `disconnect` call each of those listeners.
 */
function pageConnections(): { connect: () => void; disconnect: () => void; plugin: PluginOption } {
  const listeners: Record<string, (() => void)[]> = {
    'vite:client:connect': [],
    'vite:client:disconnect': [],
  }
  const plugin: PluginOption = {
    name: 'page-connections',
    configureServer(server: ViteDevServer) {
      const { hot } = server.environments.client
      const on = hot.on.bind(hot) as (event: string, listener: () => void) => void
      Object.assign(hot, {
        on: (event: string, listener: () => void) => {
          listeners[event]?.push(listener)
          on(event, listener)
        },
      })
    },
  }
  const call = (event: string) => (): void => {
    const heard = listeners[event] ?? []
    for (const listener of heard) listener()
  }
  return {
    plugin,
    connect: call('vite:client:connect'),
    disconnect: call('vite:client:disconnect'),
  }
}

const ACCEPTING = (body: string): string =>
  `${IMPORT}export const a = ${body}\nif (import.meta.hot) import.meta.hot.accept()\n`

describe('AC-used-atoms-41 — a set that grows reloads the stylesheet, with no page reload', () => {
  it('sends a reload of app.css when an edit adds an atom, serves its rule, and drops it when the edit is reverted', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        const first = await servedOnceRead(server, app.root, atoms('flex'))
        expect(atomLayerAtoms(first)).toEqual(atoms('flex'))

        const updates = recordUpdates(server)
        await edit(server, app.root, "cx('flex', 'block')")
        const isSent = await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)
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
  })

  it('sends the stylesheet in the same update as the script whose edit grew the set', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': ACCEPTING("cx('flex')") }))
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const file = path.join(app.root, 'src/App.ts')
        writeFileSync(file, ACCEPTING("cx('flex', 'block')"))
        server.watcher.emit('change', file)

        expect(await updates.isSent(['/src/App.ts', '/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

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
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const reloads = (): Update[] =>
          updates.sent.filter((update) =>
            update.updates?.some((entry) => entry.path === '/src/app.css'),
          )
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
        // The reload goes out on the next turn of the event loop, so it is waited for. A second
        // reload, if the burst were not batched, would follow it at once: a short grace covers it.
        await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)
        await new Promise((resolve) => setTimeout(resolve, 300))

        expect(sentAtEnd['B.ts']).toBe(0)
        expect(reloads()).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('control: without the stylesheet reload nothing is sent when the set grows', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const saved = { ...devServing }
    devServing.noteGrowth = () => {}
    devServing.modulesWithGrown = () => Promise.resolve(undefined)
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        await servedLayer(server, app.root)
        const updates = recordUpdates(server)

        await edit(server, app.root, "cx('flex', 'block')")

        expect(await updates.isSent(['/src/app.css'], 1000)).toBe(false)
      } finally {
        await stopDev(server)
      }
    } finally {
      Object.assign(devServing, saved)
      app.dispose()
    }
  })

  it('a page that connects after a reload was sent to no one is sent the reload again', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const reloads = (): Update[] =>
          updates.sent.filter((update) =>
            update.updates?.some((entry) => entry.path === '/src/app.css'),
          )

        await withClockStopped(async (growth) => {
          await edit(server, app.root, "cx('flex', 'block')")
          expect(await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
          // Nothing has asked for the stylesheet since, so the reload may have gone to no one, and
          // more growth is not announced on top of it.
          await editAndDecide(server, app.root, "cx('flex', 'block', 'gap')", growth)
          expect(reloads()).toHaveLength(1)
        })

        const asked = reloadAsked(server, UPDATE_CEILING_MS)
        page.connect()
        await asked.done

        expect(reloads()).toHaveLength(2)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('a connection when no reload went unheard sends nothing, though a served stylesheet is outgrown', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const reloads = (): Update[] =>
          updates.sent.filter((update) =>
            update.updates?.some((entry) => entry.path === '/src/app.css'),
          )

        page.connect()
        await withClockStopped(async (growth) => {
          await edit(server, app.root, "cx('flex', 'block')")
          expect(await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
          // The page was listening, so the reload was heard; the stylesheet has not been asked for
          // since, so it is still outgrown, and more growth is held back by the reload in flight.
          await editAndDecide(server, app.root, "cx('flex', 'block', 'gap')", growth)
          page.connect()
          await nextTurn()
        })

        expect(reloads()).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('a page that disconnects and connects again, with no reload unheard, is sent nothing', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const reloads = (): Update[] =>
          updates.sent.filter((update) =>
            update.updates?.some((entry) => entry.path === '/src/app.css'),
          )

        page.connect()
        await withClockStopped(async (growth) => {
          await edit(server, app.root, "cx('flex', 'block')")
          expect(await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
          await editAndDecide(server, app.root, "cx('flex', 'block', 'gap')", growth)
          page.disconnect()
          page.connect()
          await nextTurn()
        })

        expect(reloads()).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('a page that disconnected before a reload was sent is not counted: the next connection is sent the reload again', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const reloads = (): Update[] =>
          updates.sent.filter((update) =>
            update.updates?.some((entry) => entry.path === '/src/app.css'),
          )

        page.connect()
        page.disconnect()
        await withClockStopped(async (growth) => {
          await edit(server, app.root, "cx('flex', 'block')")
          expect(await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
          await editAndDecide(server, app.root, "cx('flex', 'block', 'gap')", growth)
          expect(reloads()).toHaveLength(1)
        })

        const asked = reloadAsked(server, UPDATE_CEILING_MS)
        page.connect()
        await asked.done

        expect(reloads()).toHaveLength(2)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('a connection when no reload went unheard sends nothing, though a served stylesheet is outgrown and its reload no longer holds the next back', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const reloads = (): Update[] =>
          updates.sent.filter((update) =>
            update.updates?.some((entry) => entry.path === '/src/app.css'),
          )

        page.connect()
        await withClockStopped(async (growth) => {
          await edit(server, app.root, "cx('flex', 'block')")
          expect(await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
          await editAndDecide(server, app.root, "cx('flex', 'block', 'gap')", growth)
          // Past the 2 s a reload not yet answered holds the next one back, so what keeps this
          // outgrown stylesheet from reloading is that a connection reloads only what no page heard.
          vi.setSystemTime(Date.now() + 2100)
          page.connect()
          await nextTurn()
        })

        expect(reloads()).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('a page that connects after a file change sent the stylesheet to no one is sent its reload again', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': ACCEPTING("cx('flex')") }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)
        const file = path.join(app.root, 'src/App.ts')
        writeFileSync(file, ACCEPTING("cx('flex', 'block')"))
        server.watcher.emit('change', file)
        expect(await updates.isSent(['/src/App.ts', '/src/app.css'], UPDATE_CEILING_MS)).toBe(true)

        const asked = reloadAsked(server, UPDATE_CEILING_MS)
        page.connect()
        await asked.done
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('control: a page that connects when the stylesheet it was served is current is sent nothing', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }))
    const page = pageConnections()
    try {
      const server = await startDev(devConfig(app.root, [page.plugin, navePlugin()], NO_WATCHER))
      try {
        await servedOnceRead(server, app.root, atoms('flex'))
        const updates = recordUpdates(server)

        await edit(server, app.root, "cx('flex', 'block')")
        expect(await updates.isSent(['/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
        await stylesheetServedAgain(server, app.root)
        page.connect()
        await new Promise((resolve) => setTimeout(resolve, 300))

        expect(updates.sent).toHaveLength(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })
})

/**
 * Resolves with the page reloads `updates` has recorded once one has been sent, or with none
 * after `ms`.
 */
async function pageReloadsSent(updates: Recording, ms: number): Promise<Update[]> {
  const deadline = Date.now() + ms
  const reloads = (): Update[] => updates.sent.filter((update) => update.type === 'full-reload')
  while (reloads().length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return reloads()
}

describe('AC-used-atoms-41 — a stylesheet inlined in index.html, after the set grew', () => {
  const INLINE_PAGE = `<!doctype html><html><head><style>${APP_CSS}</style></head><body><script type="module" src="/src/main.ts"></script></body></html>`

  it('is answered by a reload of the page, named in the way the client heeds', async () => {
    const app = makeUsedApp(
      appFiles({
        'index.html': INLINE_PAGE,
        'src/App.ts': `${IMPORT}export const a = cx('flex')\n`,
        'src/main.ts': "import './App.ts'\n",
      }),
    )
    try {
      // Not a middleware-mode server: Vite names every page there with `*`, and the reload that
      // went wrong is the one it sends for a server that serves a single page's HTML.
      const server = await startDev(
        devConfig(app.root, [navePlugin()], { ...NO_WATCHER, middlewareMode: false }),
      )
      try {
        await server.transformRequest('/src/main.ts')
        await server.transformIndexHtml(
          '/index.html',
          readFileSync(path.join(app.root, 'index.html'), 'utf8'),
        )
        const updates = recordUpdates(server)

        await edit(server, app.root, "cx('flex', 'block')")
        const reloads = await pageReloadsSent(updates, UPDATE_CEILING_MS)

        // Vite's client ignores a reload that names an `.html` path other than the page's URL,
        // which is what a reload of the module asked for with its file-system path would send.
        expect(reloads.map((reload) => reload.path)).toEqual(['*'])
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })
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

/**
 * A scratch plugin that does not finish reading the module `file` until `release` is called, so the
 * module is certain not to have been read by any response that returns before `release` is, however
 * slow the machine. `arm` bounds a response that is itself waiting for the module: `ceiling`
 * milliseconds after it is first called, the module is let through. It is called where the
 * stylesheet's wait begins and never earlier, because a ceiling counted from before could run out
 * on a slow machine while the stylesheet was still on its way to the wait, and let the module
 * through first. `entered` settles once the module's transform has begun, which is when it is in
 * the module graph, and at no other time: a transform that never begins leaves it waiting, and the
 * row's own timeout ends the row, since a figure counted from before the server has started could
 * run out while the module was still on its way to its transform.
 */
function held(
  file: string,
  ceiling: number,
): { arm: () => void; entered: Promise<void>; plugin: PluginOption; release: () => void } {
  const { promise: entered, resolve: enter } = Promise.withResolvers<void>()
  const { promise: released, resolve: letThrough } = Promise.withResolvers<void>()
  let armed: NodeJS.Timeout | undefined
  const release = (): void => {
    clearTimeout(armed)
    letThrough()
  }
  const arm = (): void => {
    armed ??= setTimeout(release, ceiling)
  }
  const plugin: PluginOption = {
    name: 'held-module',
    async transform(_code: string, id: string) {
      if (!id.endsWith(file)) return
      enter()
      await released
    },
  }
  return { arm, entered, plugin, release }
}

describe('AC-used-atoms-40 — the first stylesheet response waits for the graph', () => {
  const files = {
    'src/A.ts': `${IMPORT}import './B.ts'\nexport const a = cx('flex')\n`,
    'src/B.ts': `${IMPORT}import './C.ts'\nexport const b = cx('gap')\n`,
    'src/C.ts': `${IMPORT}export const c = cx('grid')\n`,
  }

  /**
   * The atoms in the stylesheet served when it is requested right after `main.ts`, with `plugin`
   * standing in the way of the module `src/C.ts`. `afterResponse` runs once the response is back.
   */
  async function atomsServedAtOnce(
    plugin: PluginOption,
    afterResponse: () => void = () => {},
  ): Promise<string[]> {
    const app = makeUsedApp(appFiles(files))
    try {
      const server = await startDev(devConfig(app.root, [plugin, navePlugin()]))
      try {
        // Only main.ts has been requested when the stylesheet is: the three modules below it are
        // read by the wait or by nothing.
        await server.transformRequest('/src/main.ts')
        const css = await server.transformRequest('/src/app.css')
        afterResponse()
        const served: unknown = JSON.parse(
          /const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(css!.code)![1]!,
        )
        return atomLayerAtoms(served as string)
      } finally {
        afterResponse()
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it('serves a stylesheet requested before the modules that name atoms with those atoms', async () => {
    // The wait has to outlast a slow read of the last module, so the read is slowed.
    expect(await atomsServedAtOnce(slow('src/C.ts', 300))).toEqual(atoms('flex', 'gap', 'grid'))
  })

  it('control: with the wait removed the stylesheet is served with what had been read', async () => {
    const saved = { ...devServing }
    devServing.hold = () => Promise.resolve()
    // The last module is not read at all until the response is back, however fast or slow the
    // machine, so the response cannot hold its atom. A response that did wait for it would never
    // be answered, and the row would end on its timeout.
    const gate = held('src/C.ts', 15_000)
    try {
      expect(await atomsServedAtOnce(gate.plugin, gate.release)).not.toEqual(
        atoms('flex', 'gap', 'grid'),
      )
    } finally {
      Object.assign(devServing, saved)
    }
  })
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
  })

  // Taken here, before any row replaces `devServing.hold`: a stand-in that called `devServing.hold`
  // while a row's replacement is in place would reach the replacement, and so itself.
  const realHold = devServing.hold.bind(devServing)

  /**
   * The hold as it was before the fix: a stylesheet with no importer in the module graph, or not
   * in it at all, is answered at once and the held module stays held; any other lets the held
   * module through and waits as the real hold does.
   */
  const atOnceWithoutImporter: StandInHold = async (environment, id, letThrough) => {
    const module = environment.moduleGraph.getModuleById(id)
    if (!module || module.importers.size === 0) return
    letThrough()
    await realHold(environment, id)
  }

  /**
   * An app whose `main.ts` imports `app.css` and `App.ts`, which names `flex`.
   */
  const NAMES_FLEX = appFiles({ 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` })

  /**
   * An app whose `main.ts` imports only `App.ts`, which imports `app.css` and names `flex`.
   */
  const IMPORTED_BY_APP = {
    ...appFiles({ 'src/App.ts': `${IMPORT}import './app.css'\nexport const a = cx('flex')\n` }, []),
    'src/main.ts': "import './App.ts'\n",
  }

  /**
   * The atoms in the atomic layer of the CSS the module `code` serves.
   */
  function layerAtomsOf(code: string): string[] {
    const served: unknown = JSON.parse(/const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(code)![1]!)
    return atomLayerAtoms(served as string)
  }

  /**
   * A stand-in for the real hold. It is the stand-in that decides when the held module is let
   * through, by calling `letThrough`: one that waits for the module has to, and one that answers at
   * once leaves the module held until the stylesheet has been answered.
   */
  type StandInHold = (
    environment: Parameters<DevServing['hold']>[0],
    id: string,
    letThrough: () => void,
  ) => Promise<void>

  interface StylesheetBeforeImporter {
    files?: Readonly<Record<string, string>>
    heldModule?: string
    hold?: StandInHold
    idle?: () => Promise<void>
  }

  /**
   * The atoms in the CSS served for `src/app.css` when it is requested as a module while
   * `heldModule`, a module of `files`, is still being transformed. That module is not let through
   * its transform until the stylesheet's wait has begun (never a delay), or, for a `hold` that
   * answers at once, until the stylesheet has been answered: when it is `src/main.ts`,
   * which imports the stylesheet, the import is not in the module graph until then, the order a
   * warm-up of the stylesheet reaches under load. Any other module is held after `main.ts` has been
   * read in full. `hold` stands in for the real wait, and `idle` for the client's
   * `waitForRequestsIdle`, as it is once the first crawl has ended.
   */
  async function atomsServedBeforeImporter({
    files = NAMES_FLEX,
    heldModule = 'src/main.ts',
    hold,
    idle,
  }: StylesheetBeforeImporter = {}): Promise<string[]> {
    const app = makeUsedApp(files)
    const gate = held(heldModule, 15_000)
    const saved = { ...devServing }
    devServing.hold = (environment, id) => {
      gate.arm()
      if (hold) return hold(environment, id, gate.release)
      const waited = realHold(environment, id)
      gate.release()
      return waited
    }
    try {
      const server = await startDev(devConfig(app.root, [gate.plugin, navePlugin()]))
      try {
        if (idle) server.environments.client.waitForRequestsIdle = idle
        // A held `main.ts` is not read before the stylesheet's wait begins: it cannot be waited for.
        // Its transform having begun can: until then it is not in the module graph at all, and on
        // a busy machine the stylesheet's own request can reach its wait first.
        if (heldModule === 'src/main.ts') {
          const requested = server.transformRequest('/src/main.ts')
          // A request that fails before its transform begins ends the wait with its error; one
          // that is held settles only after `gate.release`, so this never ends it early.
          await Promise.race([gate.entered, requested])
        } else await server.transformRequest('/src/main.ts')
        const css = await server.transformRequest('/src/app.css')
        return layerAtomsOf(css!.code)
      } finally {
        gate.release()
        await stopDev(server)
      }
    } finally {
      Object.assign(devServing, saved)
      app.dispose()
    }
  }

  it('holds a stylesheet requested before the module that imports it has registered the import', async () => {
    expect(await atomsServedBeforeImporter()).toEqual(atoms('flex'))
  })

  it('holds that stylesheet when the first crawl has already spent the wait for the client to be idle', async () => {
    // The row above also passes for a hold that reads nothing: the first crawl's wait reads for it.
    expect(await atomsServedBeforeImporter({ idle: () => Promise.resolve() })).toEqual(
      atoms('flex'),
    )
  })

  it('holds a stylesheet whose importer is not a root of the graph, while that importer is being read', async () => {
    expect(
      await atomsServedBeforeImporter({ files: IMPORTED_BY_APP, heldModule: 'src/App.ts' }),
    ).toEqual(atoms('flex'))
  })

  it('control: a hold that returns at once when no importer is registered serves that stylesheet with what had been read', async () => {
    expect(await atomsServedBeforeImporter({ hold: atOnceWithoutImporter })).toEqual([])
  })

  it('control: that hold waits as the real one does when the importer is registered by the time it is held', async () => {
    expect(
      await atomsServedBeforeImporter({ heldModule: 'src/App.ts', hold: atOnceWithoutImporter }),
    ).toEqual(atoms('flex'))
  })

  /**
   * Requests each of `urls` together, as modules, from an app whose page names `hidden` and whose
   * only other files are those stylesheets, which nothing imports. Returns the code of each answer
   * and the id of every wait the dev server made for the client to be idle.
   */
  async function requestedWithoutImporter(
    urls: readonly string[],
  ): Promise<{ codes: string[]; waits: string[] }> {
    const app = makeUsedApp({
      'index.html': '<!doctype html><p class="nave-hidden"></p>',
      ...Object.fromEntries(urls.map((url) => [url.slice(1), APP_CSS])),
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
        const answers = await Promise.all(urls.map((url) => server.transformRequest(url)))
        return { codes: answers.map((answer) => answer?.code ?? ''), waits }
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it('waits for the graph for a stylesheet requested as a module that no module imports', async () => {
    const { codes, waits } = await requestedWithoutImporter(['/src/orphan.css'])

    expect(waits).toHaveLength(1)
    expect(codes[0]).toContain('__vite__css')
    expect(layerAtomsOf(codes[0]!)).toEqual(atoms('hidden'))
  })

  it('answers two stylesheets requested together as modules that no module imports, each with the atoms of the page', async () => {
    const { codes, waits } = await requestedWithoutImporter(['/src/a.css', '/src/b.css'])

    expect(waits).toHaveLength(2)
    expect(codes.map((code) => layerAtomsOf(code))).toEqual([atoms('hidden'), atoms('hidden')])
  })

  it('a stylesheet a page links, requested as `?direct`, is answered at once, with the atoms of the pages read so far', async () => {
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
  })
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
  })

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
  })

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
  })
})

/**
 * How long a row has, from its start, for the dependency optimizer to commit. Every wait of the
 * row ends at this one deadline, so the number of waits a row makes does not change when it ends.
 */
const OPTIMIZER_DEADLINE_MS = 240_000

/**
 * The room a row has beyond its deadline: one server start or read that is under way when the
 * deadline passes.
 */
const OPTIMIZER_MARGIN_MS = 60_000

/**
 * The vitest timeout of a row whose optimizer waits end at a deadline `deadlineMs` after it
 * starts. It is later than the deadline, so a hung optimizer ends the row on the error that names
 * it, however many waits the row makes.
 */
const optimizerRowTimeout = (deadlineMs: number = OPTIMIZER_DEADLINE_MS): number =>
  deadlineMs + OPTIMIZER_MARGIN_MS

/**
 * The time, as `Date.now()` reads it, by which a row that starts now must have its optimizer
 * committed.
 */
const optimizerDeadline = (deadlineMs: number = OPTIMIZER_DEADLINE_MS): number =>
  Date.now() + deadlineMs

/**
 * The dependencies of the client environment that the optimizer has found and not yet committed.
 */
function uncommitted(server: DevServer): Promise<void>[] {
  const { depsOptimizer } = server.environments.client
  return Object.values(depsOptimizer?.metadata.discovered ?? {}).flatMap(({ processing }) =>
    processing ? [processing] : [],
  )
}

/**
 * Waits until the client environment's dependency optimizer has committed what it found: the
 * crawl of the static imports has ended, the scan has ended, and every dependency either found
 * has been written to the cache with its metadata. A server that is closed before this, and an app
 * whose directory is removed, leave an optimizer run that fails on the missing files, which Vite
 * reports as an unhandled rejection after the row has ended. The wait ends at `deadline` at the
 * latest, with an error that names the optimizer.
 */
async function optimizerSettled(server: DevServer, deadline: number): Promise<void> {
  const { depsOptimizer } = server.environments.client
  if (!depsOptimizer) return
  let timer: NodeJS.Timeout | undefined
  const ceiling = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        reject(new Error('the dependency optimizer did not commit'))
      },
      Math.max(0, deadline - Date.now()),
    )
  })
  const committed = (async (): Promise<void> => {
    await server.waitForRequestsIdle()
    await depsOptimizer.scanProcessing
    // A dependency the crawl finds after the scan starts another run, so look again after each.
    for (let pending = uncommitted(server); pending.length > 0; pending = uncommitted(server)) {
      await Promise.all(pending)
    }
  })()
  try {
    await Promise.race([committed, ceiling])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A dev server whose dependency optimizer never commits: its scan does not end.
 */
function neverCommits(): DevServer {
  const depsOptimizer = {
    scanProcessing: new Promise<void>(() => {}),
    metadata: { discovered: {} },
  }
  return {
    waitForRequestsIdle: () => Promise.resolve(),
    environments: { client: { depsOptimizer } },
  } as unknown as DevServer
}

describe('the wait for the dependency optimizer', () => {
  it(
    'ends at the row’s deadline with the error that names the optimizer, however many waits the row makes',
    async () => {
      const deadlineMs = 300
      const deadline = optimizerDeadline(deadlineMs)
      const server = neverCommits()
      const started = Date.now()

      const errors: unknown[] = []
      for (let waits = 0; waits < 6; waits += 1) {
        try {
          await optimizerSettled(server, deadline)
        } catch (error) {
          errors.push(error)
        }
      }

      expect(errors.map(String)).toEqual(
        Array.from({ length: 6 }, () => 'Error: the dependency optimizer did not commit'),
      )
      // Six waits that each had the deadline's length to themselves would take six times as long.
      expect(Date.now() - started).toBeLessThan(deadlineMs * 3)
    },
    optimizerRowTimeout(300),
  )
})

/**
 * Closes a dev server whose optimizer may be running, once the optimizer has committed.
 */
async function stopOptimized(server: DevServer, deadline: number): Promise<void> {
  try {
    await optimizerSettled(server, deadline)
  } finally {
    await stopDev(server)
  }
}

/**
 * The dev server's config for a row that renders on the server or looks only at the process-wide
 * keep map, and so never asks for a prebundled dependency. Dependency discovery is off, so no scan
 * of the app's dependencies is running when the row closes the server and removes the app's
 * directory.
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
        keepMapConfig(app.root, [
          navePlugin({ keep: ['flex'], keepFor: { 'dyn-lib': ['block'] } }),
        ]),
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
  })

  it('a server render takes a listed atom through the same map', async () => {
    const app = makeFixture()
    try {
      const server = await startDev(keepMapConfig(app.root, [navePlugin({ keep: ['grid'] })]))
      try {
        const module = (await server.ssrLoadModule('/src/ssr.ts')) as { default: string }
        expect(module.default).toBe('nave-grid')
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

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
  })

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
  })

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
  })

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
  })

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
  })

  it(
    'dyn-lib’s prebundled chunk keeps core’s import and holds no keep map',
    async () => {
      const deadline = optimizerDeadline()
      const app = makeFixture()
      try {
        const server = await startDev(
          devConfig(app.root, [navePlugin({ keep: ['flex'], keepFor: { 'dyn-lib': ['block'] } })]),
        )
        try {
          await server.transformRequest('/src/main.ts')
          await optimizerSettled(server, deadline)
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
          await stopOptimized(server, deadline)
        }
      } finally {
        app.dispose()
      }
    },
    optimizerRowTimeout(),
  )

  it(
    'the resolved define has exactly one key more than under all, and the optimizer’s hash does not change with keep',
    async () => {
      const deadline = optimizerDeadline()
      const app = makeFixture()
      const hashWith = async (keep: readonly string[]): Promise<string> => {
        const server = await startDev(devConfig(app.root, [navePlugin({ keep: keep as never })]))
        try {
          await server.transformRequest('/src/main.ts')
          await optimizerSettled(server, deadline)
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
            await stopOptimized(all, deadline)
          }
          return (JSON.parse(metadata) as { hash: string }).hash
        } finally {
          await stopOptimized(server, deadline)
        }
      }
      try {
        const first = await hashWith(['flex'])
        expect(await hashWith(['grid'])).toBe(first)
      } finally {
        app.dispose()
      }
    },
    optimizerRowTimeout(),
  )
})

describe('AC-used-atoms-61 — the dev server reads a CSS Module as it reads a script', () => {
  const MAIN_ATOMS = atoms('flex', 'gap', 'grid', 'inlineFlex')

  it('serves a stylesheet requested before the CSS Module with the atoms the module composes', async () => {
    const app = makeUsedApp(appFiles(cssModuleFiles()))
    try {
      // The module is read slowly, so the stylesheet cannot be answered from a read that was
      // already done when it was asked for.
      const slow: PluginOption = {
        name: 'slow-css-module',
        enforce: 'pre',
        async transform(_code, id) {
          if (id.endsWith('card.module.css'))
            await new Promise((resolve) => setTimeout(resolve, 300))
        },
      }
      const server = await startDev(
        devConfig(app.root, [slow, navePlugin()], { preTransformRequests: false }),
      )
      try {
        // Vite's wait for the requests of the first crawl returns at once once the crawl has
        // ended, and it ends once, so it is stood in as settled; and the server transforms no
        // import ahead of a request for it. Only main.ts has been requested when the stylesheet
        // is: the module is read by the read ahead or by nothing.
        server.environments.client.waitForRequestsIdle = () => Promise.resolve()
        await server.transformRequest('/src/main.ts')
        const css = await server.transformRequest('/src/app.css')
        const served: unknown = JSON.parse(
          /const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(css!.code)![1]!,
        )

        expect(atomLayerAtoms(served as string)).toEqual(MAIN_ATOMS)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('serves a stylesheet requested before a CSS Module that only a lazily imported script reaches with the atoms it composes', async () => {
    const app = makeUsedApp(
      appFiles({
        ...cssModuleFiles(),
        'src/main.ts': "import './app.css'\nimport('./Page.ts')\n",
        'src/Page.ts':
          "import s from './card.module.css'\nconsole.log(s.box, s['my-box'], s.card)\n",
      }),
    )
    try {
      const slow: PluginOption = {
        name: 'slow-css-module',
        enforce: 'pre',
        async transform(_code, id) {
          if (id.endsWith('card.module.css'))
            await new Promise((resolve) => setTimeout(resolve, 300))
        },
      }
      const server = await startDev(devConfig(app.root, [slow, navePlugin()]))
      try {
        await server.transformRequest('/src/main.ts')
        const css = await server.transformRequest('/src/app.css')
        const served: unknown = JSON.parse(
          /const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(css!.code)![1]!,
        )

        expect(atomLayerAtoms(served as string)).toEqual(MAIN_ATOMS)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('answers a CSS Module that holds the atomic layer itself, without waiting on its own read', async () => {
    const app = makeUsedApp(
      appFiles({ ...cssModuleFiles(), 'src/card.module.css': `${APP_CSS}${CARD_MODULE}` }),
    )
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()]))
      try {
        await server.transformRequest('/src/main.ts')
        const hasAnswered = async (): Promise<boolean> => {
          await server.transformRequest('/src/card.module.css')
          return true
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        let isAnswered: boolean
        try {
          isAnswered = await Promise.race([
            hasAnswered(),
            new Promise<boolean>((resolve) => {
              timer = setTimeout(() => resolve(false), 15_000)
            }),
          ])
        } finally {
          clearTimeout(timer)
        }

        expect(isAnswered).toBe(true)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('sends the stylesheet in the same update as the update the CSS Module whose edit grew the set causes', async () => {
    const main = `${cssModuleFiles()['src/main.ts']}import.meta.hot?.accept('./card.module.css', () => {})\n`
    const app = makeUsedApp(appFiles({ ...cssModuleFiles(), 'src/main.ts': main }))
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER))
      try {
        expect(atomLayerAtoms(await servedLayer(server, app.root))).toEqual(MAIN_ATOMS)
        const updates = recordUpdates(server)
        const file = path.join(app.root, 'src/card.module.css')
        writeFileSync(
          file,
          CARD_MODULE.replace('nave-flex from global', 'nave-flex nave-flex-col from global'),
        )
        server.watcher.emit('change', file)

        // The update names the module that accepts the CSS Module's, `main.ts`.
        expect(await updates.isSent(['/src/main.ts', '/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
        expect(atomLayerAtoms(await stylesheetServedAgain(server, app.root))).toEqual(
          atoms(...MAIN_ATOMS, 'flexCol'),
        )
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })

  it('reads a module an edit makes a CSS Module compose from through the CSS Module only, not on its own', async () => {
    const main = `${cssModuleFiles()['src/main.ts']}import.meta.hot?.accept('./card.module.css', () => {})\n`
    const app = makeUsedApp(
      appFiles({
        ...cssModuleFiles(),
        'src/main.ts': main,
        'src/extra.module.css':
          '.x { composes: nave-flex-col from global; }\n.y { composes: nave-block from global; }\n',
      }),
    )
    try {
      const server = await startDev(devConfig(app.root, [navePlugin()], NO_WATCHER, 'lightningcss'))
      try {
        expect(atomLayerAtoms(await servedLayer(server, app.root))).toEqual(MAIN_ATOMS)
        const updates = recordUpdates(server)
        const file = path.join(app.root, 'src/card.module.css')
        writeFileSync(file, `${CARD_MODULE}.extra { composes: x from './extra.module.css'; }\n`)
        server.watcher.emit('change', file)

        expect(await updates.isSent(['/src/main.ts', '/src/app.css'], UPDATE_CEILING_MS)).toBe(true)
        expect(atomLayerAtoms(await stylesheetServedAgain(server, app.root))).toEqual(
          atoms(...MAIN_ATOMS, 'flexCol'),
        )
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  })
})
