/**
 * The used-atoms criteria for environments (AC-used-atoms-12 to -15): the emitted set is the
 * union over every environment built in one process, an atom collected after the CSS was written
 * fails the build, two invocations share their sets through `cacheDir`, and a Nave-consuming
 * dependency no environment transforms is warned about.
 */
import type { PluginOption } from 'vite'

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { BuildOptions, Built } from './helpers/used-atoms-app.ts'
import type { ScratchApp } from './helpers/vite-app.ts'

import { HANDSHAKE_FILE } from '../src/vite-handshake.ts'
import { stateFor } from '../src/vite-state.ts'
import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildEnvironments,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { appConfig, startDev, VITE_APIS } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
// The builder is Vite's multi-environment path, which the two Vites reach by their own code, so
// every row that builds through it runs on each Vite measured.
const LEGS = Object.entries(VITE_APIS)

/**
 * An app with a client calling `flex`, a dependency bundled into it calling `gap`, and a server
 * render calling `server`.
 */
function ssrApp(server: string): ScratchApp {
  const app = makeUsedApp(
    appFiles(
      {
        'src/App.ts': `${IMPORT}import { g } from 'ok-lib'\nconsole.log(cx('flex'), g)\n`,
        'src/entry-server.ts': `${IMPORT}export const s = ${server}\n`,
      },
      ['src/App.ts'],
    ),
  )
  addPackage(app, 'ok-lib', { 'index.js': `${IMPORT}export const g = cx('gap')\n` })
  return app
}

/**
 * A barrier: `passed` settles once `done` is called.
 */
function gate(): { done: () => void; passed: Promise<void> } {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { done: resolve, passed: promise }
}

describe('AC-used-atoms-12 — every environment in one process, dependencies included', () => {
  it.each(LEGS)(
    'unions the client, a bundled dependency and the server render, whichever builds first on Vite %s',
    async (_version, api) => {
      for (const order of [
        ['ssr', 'client'],
        ['client', 'ssr'],
      ] as const) {
        const app = ssrApp("cx('grid')")
        try {
          const built = await buildEnvironments(app, { api, order, options: { keep: ['grid'] } })

          expect(built.error, order.join(',')).toBeUndefined()
          expect(atomLayerAtoms(built.client.css)).toEqual(atoms('flex', 'gap', 'grid'))
        } finally {
          app.dispose()
        }
      }
    },
    60_000,
  )

  it.each(LEGS)(
    'builds the server first and the client sees the server’s atom without keep on Vite %s',
    async (_version, api) => {
      const app = ssrApp("cx('grid')")
      try {
        const built = await buildEnvironments(app, { api, order: ['ssr', 'client'] })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.client.css)).toEqual(atoms('flex', 'gap', 'grid'))
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it.each(LEGS)(
    'builds each environment on the Vite the leg names, %s',
    async (_version, api) => {
      const app = ssrApp("cx('grid')")
      const seen = new Set<string>()
      // Each Vite puts its own version on the context its plugins run in, so this reads which
      // Vite's builder ran, not which one the row asked for.
      const witness: PluginOption = {
        name: 'record-vite-version',
        buildStart() {
          // eslint-disable-next-line unicorn/no-this-outside-of-class -- a plugin hook receives its build context as `this`; there is no other way to read it
          seen.add(`${this.environment.name} ${this.meta.viteVersion}`)
        },
      }
      try {
        const built = await buildEnvironments(app, {
          api,
          order: ['ssr', 'client'],
          options: { keep: ['grid'] },
          plugins: [witness],
        })

        expect(built.error).toBeUndefined()
        expect([...seen].toSorted((a, b) => a.localeCompare(b))).toEqual([
          `client ${api.version}`,
          `ssr ${api.version}`,
        ])
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it('keeps the state of two projects apart, built one after the other in one process', async () => {
    const a = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }))
    const b = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('grid'))\n` }))
    try {
      const builtA = await buildUsed(a)
      const builtB = await buildUsed(b)

      expect(atomLayerAtoms(builtA.css)).toEqual(['flex'])
      expect(atomLayerAtoms(builtB.css)).toEqual(['grid'])
    } finally {
      a.dispose()
      b.dispose()
    }
  }, 60_000)

  it('keeps the atoms of two projects apart when one plugin instance builds both at once', async () => {
    const a = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }))
    const b = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('grid'))\n` }))
    try {
      const shared = navePlugin()
      const [builtA, builtB] = await Promise.all([
        buildUsed(a, { nave: shared }),
        buildUsed(b, { nave: shared }),
      ])

      expect(builtA.error).toBeUndefined()
      expect(builtB.error).toBeUndefined()
      expect(atomLayerAtoms(builtA.css)).toEqual(['flex'])
      expect(atomLayerAtoms(builtB.css)).toEqual(['grid'])
    } finally {
      a.dispose()
      b.dispose()
    }
  }, 60_000)

  it('keeps the atoms of two concurrent builds of one root apart, each with its own entry', async () => {
    const app = makeUsedApp(
      appFiles(
        {
          'src/A.ts': `import './app.css'\n${IMPORT}console.log(cx('flex'))\n`,
          'src/B.ts': `import './app.css'\n${IMPORT}console.log(cx('grid'))\n`,
        },
        [],
      ),
    )
    try {
      const shared = navePlugin()
      const entry = (name: string): { build: { rolldownOptions: { input: string } } } => ({
        build: { rolldownOptions: { input: path.join(app.root, name) } },
      })
      writeFileSync(
        path.join(app.root, 'a.html'),
        '<!doctype html><script type="module" src="/src/A.ts"></script>',
      )
      writeFileSync(
        path.join(app.root, 'b.html'),
        '<!doctype html><script type="module" src="/src/B.ts"></script>',
      )
      const [a, b] = await Promise.all([
        buildUsed(app, { nave: shared, ...entry('a.html') }),
        buildUsed(app, { nave: shared, ...entry('b.html') }),
      ])

      expect(a.error).toBeUndefined()
      expect(b.error).toBeUndefined()
      expect(atomLayerAtoms(a.css)).toEqual(['flex'])
      expect(atomLayerAtoms(b.css)).toEqual(['grid'])
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('keeps the page atoms of each of two concurrent builds of one root that read different markup', async () => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('block'))\n` }))
    try {
      const shared = navePlugin()
      // Promise barriers fix the order, so the overlap does not depend on a delay: the first
      // build reads its page only after the second has compiled its own, and the second build
      // finishes only after the first has read its page.
      const secondCompiled = gate()
      const firstRead = gate()
      const markup = (name: string, atom: string, wait?: Promise<void>): PluginOption => ({
        name,
        enforce: 'pre',
        async load(id) {
          if (!id.endsWith('/index.html')) return
          await wait
          return `<!doctype html><html><body><p class="nave-${atom}">x</p><script type="module" src="/src/main.ts"></script></body></html>`
        },
      })
      // Listed after Nave's, so it runs once Nave has noted the page.
      const afterPage = (signal: () => void): PluginOption => ({
        name: 'after-page',
        transform(_code, id) {
          if (id.endsWith('/index.html')) signal()
          return
        },
      })
      const atEntry = (signal: () => void, wait?: Promise<void>): PluginOption => ({
        name: 'at-entry',
        enforce: 'pre',
        async transform(_code, id) {
          if (!id.endsWith('/src/main.ts')) return
          signal()
          await wait
          return
        },
      })
      const nothing = (): void => undefined
      const [a, b] = await Promise.all([
        buildUsed(app, {
          nave: shared,
          plugins: [markup('first', 'flex', secondCompiled.passed), atEntry(firstRead.done)],
        }),
        buildUsed(app, {
          nave: shared,
          plugins: [markup('second', 'grid'), atEntry(nothing, firstRead.passed)],
          after: [afterPage(secondCompiled.done)],
        }),
      ])

      expect(a.error).toBeUndefined()
      expect(b.error).toBeUndefined()
      expect(atomLayerAtoms(a.css)).toEqual(['block', 'flex'])
      expect(atomLayerAtoms(b.css)).toEqual(['block', 'grid'])
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('keeps the atoms of a page of the outer build when a build of a root inside it ran before', async () => {
    const app = makeUsedApp(
      appFiles(
        {
          'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
          'sub/index.html':
            '<!doctype html><a class="nave-sr-only-focusable" href="#m">Skip</a><p class="nave-hidden">x</p><script type="module" src="./main.js"></script>',
          'sub/main.js': 'console.log(1)\n',
        },
        ['src/App.ts'],
      ),
    )
    try {
      const shared = navePlugin()
      const inner = { root: path.join(app.root, 'sub'), dispose: () => {} }
      const first = await buildUsed(inner, { nave: shared })
      const outer = await buildUsed(app, {
        nave: shared,
        build: {
          rolldownOptions: {
            input: [path.join(app.root, 'index.html'), path.join(app.root, 'sub/index.html')],
          },
        },
      })

      expect(first.error).toBeUndefined()
      expect(outer.error).toBeUndefined()
      expect(atomLayerAtoms(outer.css)).toEqual(atoms('flex', 'hidden', 'srOnlyFocusable'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('gives a page of /repo/app2 to the build of /repo, not to the build of /repo/app', () => {
    const [nave, collect] = navePlugin()
    const configs = ['/repo', '/repo/app'].map((root) => ({
      root,
      command: 'build',
      logger: { warn() {} },
    }))
    for (const config of configs) nave.configResolved(config)
    collect.transformIndexHtml.handler('<p class="nave-hidden">x</p>', {
      filename: '/repo/app2/index.html',
    })

    expect(stateFor('/repo', configs[0]!).pages.size).toBe(1)
    expect(stateFor('/repo/app', configs[1]!).pages.size).toBe(0)
  })

  it('keeps the per-module error of a dev server after a build of the same root, sharing one instance', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/Bad.ts': `${IMPORT}export const f = (variant: string) => cx(variant as 'flex')\n`,
      }),
    )
    try {
      const shared = navePlugin()
      const server = await startDev(appConfig(app.root, 'postcss', [shared]))
      try {
        const request = async (): Promise<string> => {
          try {
            await server.transformRequest('/src/Bad.ts')
            return 'no error'
          } catch (error) {
            return (error as Error).message
          }
        }
        const before = await request()
        const built = await buildUsed(app, { nave: shared })
        const after = await request()

        expect(before).toContain('src/Bad.ts:')
        expect(built.error).toContain('src/Bad.ts')
        expect(after).toContain('src/Bad.ts:')
      } finally {
        await server.close()
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it.each(LEGS)(
    'gives each environment its own plugin instance for one root the same CSS as a shared one on Vite %s',
    async (_version, api) => {
      const app = ssrApp("cx('grid')")
      try {
        const shared = await buildEnvironments(app, { api, order: ['ssr', 'client'] })
        const separate = await buildEnvironments(app, {
          api,
          order: ['ssr', 'client'],
          nave: navePlugin(),
        })
        const again = await buildEnvironments(app, {
          api,
          order: ['ssr', 'client'],
          nave: [...navePlugin(), ...navePlugin()],
        })

        expect(atomLayerAtoms(separate.client.css)).toEqual(atomLayerAtoms(shared.client.css))
        expect(again.error).toBeUndefined()
        expect(atomLayerAtoms(again.client.css)).toEqual(atomLayerAtoms(shared.client.css))
      } finally {
        app.dispose()
      }
    },
    60_000,
  )
})

/**
 * One pair of plugin objects for each environment, applied to that environment alone.
 */
const perEnvironment = (): never[] =>
  ['client', 'ssr'].flatMap((name) =>
    navePlugin().map((plugin) => ({
      ...plugin,
      applyToEnvironment: (environment: { name: string }) => environment.name === name,
    })),
  ) as never[]

describe('AC-used-atoms-12 - an instance of the plugin for each environment', () => {
  it.each(LEGS)(
    'unions the sets of the two instances when the server builds first on Vite %s',
    async (_version, api) => {
      const app = ssrApp("cx('grid')")
      try {
        const built = await buildEnvironments(app, {
          api,
          order: ['ssr', 'client'],
          nave: perEnvironment(),
        })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.client.css)).toEqual(atoms('flex', 'gap', 'grid'))
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it.each(LEGS)(
    'fails naming the atom when the client builds first, as with one instance on Vite %s',
    async (_version, api) => {
      const app = ssrApp("cx('grid')")
      try {
        const built = await buildEnvironments(app, {
          api,
          order: ['client', 'ssr'],
          nave: perEnvironment(),
        })

        expect(built.error).toContain('grid')
        expect(built.error).toContain('src/entry-server.ts')
      } finally {
        app.dispose()
      }
    },
    60_000,
  )
})

describe('AC-used-atoms-13 — an atom collected after the CSS was written fails the build', () => {
  it.each(LEGS)(
    'fails naming the atom, the module and both remedies, client first on Vite %s',
    async (_version, api) => {
      const app = ssrApp("cx('grid')")
      try {
        const built = await buildEnvironments(app, { api, order: ['client', 'ssr'] })

        expect(built.error).toContain('grid')
        expect(built.error).toContain('src/entry-server.ts')
        expect(built.error).toContain('keep')
        expect(built.error).toContain('builder.buildApp')
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it.each(LEGS)(
    'is green with keep, and green when the server only uses an atom the client has on Vite %s',
    async (_version, api) => {
      const withKeep = ssrApp("cx('grid')")
      const sameAtom = ssrApp("cx('flex')")
      try {
        const kept = await buildEnvironments(withKeep, {
          api,
          order: ['client', 'ssr'],
          options: { keep: ['grid'] },
        })
        const same = await buildEnvironments(sameAtom, { api, order: ['client', 'ssr'] })

        expect(kept.error).toBeUndefined()
        expect(atomLayerAtoms(kept.client.css)).toContain('grid')
        expect(same.error).toBeUndefined()
      } finally {
        withKeep.dispose()
        sameAtom.dispose()
      }
    },
    60_000,
  )

  it.each(LEGS)(
    'fails the same way for a literal class and no cx call on Vite %s',
    async (_version, api) => {
      const app = ssrApp("'nave-grid'")
      try {
        const built = await buildEnvironments(app, { api, order: ['client', 'ssr'] })

        expect(built.error).toContain('grid')
      } finally {
        app.dispose()
      }
    },
    60_000,
  )
})

/**
 * A client build of `app`, with any extra build settings.
 */
function buildClient(app: ScratchApp, extra: BuildOptions = {}): Promise<Built> {
  return buildUsed(app, extra)
}

/**
 * A server (SSR) build of `app`.
 */
function buildServer(app: ScratchApp): Promise<Built> {
  return buildUsed(app, {
    build: { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false },
  })
}

/**
 * What the handshake file in `app`'s cache directory records.
 */
function fileOf(app: ScratchApp): {
  build: string
  emitted: string[]
  writer: string
  writtenAt: string
} {
  return JSON.parse(readFileSync(path.join(app.root, '.vite', HANDSHAKE_FILE), 'utf8')) as {
    build: string
    emitted: string[]
    writer: string
    writtenAt: string
  }
}

/**
 * The words of the warning a server build prints when it names an atom the last client build's
 * set lacks.
 */
function staleWarning(app: ScratchApp, lines: readonly string[]): string {
  return [
    `${path.join(app.root, '.vite', HANDSHAKE_FILE)} was written by a client build that was already used, so this server build could not be checked against the CSS. These atoms it names are not in that client build's set:`,
    ...lines,
    'They are recorded in that file for a client build that runs next; to have them in the CSS, build the server first, then the client (vite build --ssr, then vite build).',
  ].join('\n')
}

function pluginWarnings(built: { warnings?: readonly string[] }): string[] {
  return (built.warnings ?? []).filter((message) => message.includes('[plugin nave'))
}

function editServer(app: ScratchApp, expression: string): void {
  writeFileSync(
    path.join(app.root, 'src/entry-server.ts'),
    `${IMPORT}export const s = ${expression}\n`,
  )
}

describe('AC-used-atoms-14 — two invocations share their sets through cacheDir', () => {
  it('fails the second invocation, client first, naming the atom and the module', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const first = await buildClient(app)
      const second = await buildServer(app)

      expect(first.error).toBeUndefined()
      expect(second.error).toContain('grid')
      expect(second.error).toContain('src/entry-server.ts')
      expect(second.error).toContain('keep')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('is green in both orders when the server goes first, and the client CSS holds the server’s atom', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const first = await buildServer(app)
      const second = await buildClient(app)

      expect(first.error).toBeUndefined()
      expect(second.error).toBeUndefined()
      expect(atomLayerAtoms(second.css)).toEqual(atoms('flex', 'gap', 'grid'))
      expect(fileOf(app).writer).toBe('client')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('does not pass silently when a server build run alone names an atom the last client build lacks', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await buildServer(app)
      await buildClient(app)
      editServer(app, "cx('block')")
      const alone = await buildServer(app)
      const warnings = pluginWarnings(alone)

      expect(alone.error).toBeUndefined()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(staleWarning(app, ['src/entry-server.ts: names block.']))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('prints nothing when a server build run alone names only atoms the last client build holds', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await buildServer(app)
      await buildClient(app)
      const alone = await buildServer(app)

      expect(alone.error).toBeUndefined()
      expect(pluginWarnings(alone)).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('runs a server-first pipeline three times with no edit: grid every time, no plugin warning', async () => {
    const app = ssrApp("cx('grid')")
    try {
      for (let run = 1; run <= 3; run += 1) {
        const first = await buildServer(app)
        const second = await buildClient(app)

        expect(first.error, `run ${run} server`).toBeUndefined()
        expect(second.error, `run ${run} client`).toBeUndefined()
        expect(atomLayerAtoms(second.css), `run ${run}`).toContain('grid')
        expect(pluginWarnings(first), `run ${run} server`).toEqual([])
        expect(pluginWarnings(second), `run ${run} client`).toEqual([])
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('warns once, on the run that adds block, then is silent, and the CSS holds block from that run', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const warned: string[][] = []
      const clientAtoms: string[][] = []
      for (let run = 1; run <= 3; run += 1) {
        if (run > 1) editServer(app, "[cx('grid'), cx('block')]")
        const first = await buildServer(app)
        const second = await buildClient(app)

        expect(first.error, `run ${run} server`).toBeUndefined()
        expect(second.error, `run ${run} client`).toBeUndefined()
        warned.push([...pluginWarnings(first), ...pluginWarnings(second)])
        clientAtoms.push(atomLayerAtoms(second.css))
      }

      // Runs 2 and 3 hold the block that run 2 added to the server.
      for (const [index, shipped] of clientAtoms.slice(1).entries()) {
        expect(shipped, `run ${index + 2}`).toEqual(atoms('flex', 'gap', 'grid', 'block'))
      }
      expect(warned[0]).toEqual([])
      expect(warned[1]).toHaveLength(1)
      expect(warned[1]![0]).toContain(staleWarning(app, ['src/entry-server.ts: names block.']))
      expect(warned[2]).toEqual([])
    } finally {
      app.dispose()
    }
  }, 120_000)

  describe.each(['postcss', 'lightningcss'] as const)('under css.transformer %s', (transformer) => {
    it('fails a server build on every miss, records its atoms, and passes once the client build has shipped them', async () => {
      const app = ssrApp("cx('grid')")
      try {
        const file = path.join(app.root, '.vite', HANDSHAKE_FILE)
        const remedy = `They are recorded in ${file} for the next client build. List the atoms in keep in navePlugin(), or build the client again, then the server (vite build, then vite build --ssr). To keep this from recurring, build the server first, then the client (vite build --ssr, then vite build).`
        const build = (extra: BuildOptions = {}): Promise<Built> =>
          buildUsed(app, { transformer, ...extra })
        const ssr = { build: { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false } }

        const alone = await build()
        const first = await build(ssr)
        const again = await build(ssr)
        const next = await build()
        const last = await build(ssr)

        expect(atomLayerAtoms(alone.css)).toEqual(atoms('flex', 'gap'))
        for (const failed of [first, again]) {
          expect(failed.error).toContain('src/entry-server.ts: names grid.')
          expect(failed.error!.endsWith(remedy)).toBe(true)
          expect(failed.error).not.toContain('already used')
          expect(failed.error).not.toContain('could not be checked')
        }
        expect(next.error).toBeUndefined()
        expect(atomLayerAtoms(next.css)).toEqual(atoms('flex', 'gap', 'grid'))
        expect(last.error).toBeUndefined()
        expect(pluginWarnings(last)).toEqual([])
      } finally {
        app.dispose()
      }
    }, 120_000)
  })

  it('drops what a failed server build left pending once a server build passes without it', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await buildClient(app)
      const failed = await buildServer(app)
      editServer(app, "cx('flex')")
      const passed = await buildServer(app)
      const next = await buildClient(app)

      expect(failed.error).toContain('grid')
      expect(passed.error).toBeUndefined()
      expect(atomLayerAtoms(next.css)).toEqual(atoms('flex', 'gap'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('does not ship what the server no longer names after the client shipped it', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await buildClient(app)
      await buildServer(app)
      const shipped = await buildClient(app)
      editServer(app, "cx('flex')")
      const passed = await buildServer(app)
      const next = await buildClient(app)

      expect(atomLayerAtoms(shipped.css)).toContain('grid')
      expect(passed.error).toBeUndefined()
      expect(atomLayerAtoms(next.css)).toEqual(atoms('flex', 'gap'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it.each([
    ['grid', "cx('grid')"],
    ['srOnlyFocusable', '\'<a class="nave-sr-only-focusable" href="#main">Skip</a>\''],
  ] as const)(
    'ships the server’s %s in the client CSS on every run of a server-first pipeline',
    async (atom, expression) => {
      const app = ssrApp(expression)
      try {
        for (let run = 1; run <= 3; run += 1) {
          const first = await buildServer(app)
          const second = await buildClient(app)

          expect(first.error, `run ${run} server`).toBeUndefined()
          expect(second.error, `run ${run} client`).toBeUndefined()
          expect(atomLayerAtoms(second.css), `run ${run}`).toEqual(atoms('flex', 'gap', atom))
        }
      } finally {
        app.dispose()
      }
    },
    120_000,
  )

  it('is green on every run of a client-first pipeline whose server needs nothing the client lacks', async () => {
    const app = ssrApp("cx('flex')")
    try {
      for (let run = 1; run <= 3; run += 1) {
        const first = await buildClient(app)
        const second = await buildServer(app)

        expect(first.error, `run ${run} client`).toBeUndefined()
        expect(second.error, `run ${run} server`).toBeUndefined()
        expect(atomLayerAtoms(first.css), `run ${run}`).toEqual(atoms('flex', 'gap'))
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('fails the server of a client-first pipeline once, then the client ships the atom it missed', async () => {
    const app = ssrApp("cx('grid')")
    try {
      // Run 1: the server names grid, which no client build has shipped yet.
      await buildClient(app)
      const missed = await buildServer(app)
      expect(missed.error, 'run 1').toContain('grid')

      // Runs 2 and 3: the client has shipped grid, so the server passes.
      for (let run = 2; run <= 3; run += 1) {
        const first = await buildClient(app)
        const second = await buildServer(app)

        expect(second.error, `run ${run}`).toBeUndefined()
        expect(atomLayerAtoms(first.css), `run ${run}`).toContain('grid')
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('ships a kept atom on every run of a client-first pipeline', async () => {
    const app = ssrApp("cx('flex')")
    try {
      for (let run = 1; run <= 3; run += 1) {
        const first = await buildClient(app, { options: { keep: ['grid'] } })
        const second = await buildServer(app)

        expect(atomLayerAtoms(first.css), `run ${run}`).toEqual(atoms('flex', 'gap', 'grid'))
        expect(second.error, `run ${run}`).toBeUndefined()
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('names the same order in the failure a server build meets and in the stale-file warning', async () => {
    const missApp = ssrApp("cx('grid')")
    const staleApp = ssrApp("cx('grid')")
    try {
      await buildClient(missApp)
      const miss = await buildServer(missApp)
      await buildServer(staleApp)
      await buildClient(staleApp)
      editServer(staleApp, "cx('block')")
      const stale = await buildServer(staleApp)
      const [warning] = pluginWarnings(stale)

      expect(miss.error).toContain('build the server first')
      expect(warning).toContain('build the server first')
      expect(warning).not.toMatch(/build the client first/i)
    } finally {
      missApp.dispose()
      staleApp.dispose()
    }
  }, 120_000)

  it('unions a leftover server set into a lone client build, then replaces the file with its own', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await buildServer(app)
      const built = await buildClient(app)
      const file = fileOf(app)

      expect(atomLayerAtoms(built.css)).toContain('grid')
      expect(file.writer).toBe('client')
      expect(file.emitted).toEqual(atomLayerAtoms(built.css))
      expect(file.emitted).toEqual([...file.emitted].toSorted((a, b) => a.localeCompare(b)))
      expect(Number.isNaN(Date.parse(file.writtenAt))).toBe(false)
      expect(file.build).toBeTruthy()
    } finally {
      app.dispose()
    }
  }, 60_000)
})

/**
 * A server render importing `ssr-lib` and `plain-lib`, neither imported by the client.
 */
function libApp(manifest: 'dependencies' | 'peerDependencies'): ScratchApp {
  const app = makeUsedApp(
    appFiles(
      {
        'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
        'src/entry-server.ts':
          "import { a } from 'ssr-lib'\nimport { b } from 'plain-lib'\nexport const s = [a, b]\n",
      },
      ['src/App.ts'],
    ),
  )
  addPackage(
    app,
    'ssr-lib',
    { 'index.js': `${IMPORT}export const a = cx('flex')\n` },
    manifest === 'dependencies',
  )
  if (manifest === 'peerDependencies') {
    addPackage(app, 'ssr-lib', { 'index.js': `${IMPORT}export const a = cx('flex')\n` }, false)
    const file = path.join(app.root, 'node_modules/ssr-lib/package.json')
    const peer = {
      ...(JSON.parse(readFileSync(file, 'utf8')) as object),
      peerDependencies: { '@navecss/core': '*' },
    }
    writeFileSync(file, JSON.stringify(peer))
  }
  addPackage(app, 'plain-lib', { 'index.js': 'export const b = 1\n' }, false)
  return app
}

function dependencyWarnings(warnings: readonly string[] | undefined): string[] {
  return (warnings ?? []).filter(
    (message) => message.includes('nave:collect') || message.includes('ssr.noExternal'),
  )
}

describe('AC-used-atoms-15 — an untransformed Nave-consuming dependency is warned about', () => {
  const ssr = { ssr: 'src/entry-server.ts', outDir: 'dist-ssr' }

  it.each(['dependencies', 'peerDependencies'] as const)(
    'warns once, naming ssr-lib and ssr.noExternal, when it is declared in %s',
    async (manifest) => {
      const app = libApp(manifest)
      try {
        const built = await buildUsed(app, { build: ssr })
        const warnings = dependencyWarnings(built.warnings)

        expect(built.error).toBeUndefined()
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain('ssr-lib')
        expect(warnings[0]).toContain('ssr.noExternal')
        expect(warnings.join(',')).not.toContain('plain-lib')
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it('prints nothing with ssr.noExternal, with a keepFor entry, or under all', async () => {
    const app = libApp('dependencies')
    try {
      const bundled = await buildUsed(app, {
        build: ssr,
        config: { ssr: { noExternal: ['ssr-lib'] } },
      })
      const listed = await buildUsed(app, {
        build: ssr,
        options: { keepFor: { 'ssr-lib': ['flex'] } },
      })
      const all = await buildUsed(app, { build: ssr, options: { atomic: 'all' } })

      expect(dependencyWarnings(bundled.warnings)).toEqual([])
      expect(dependencyWarnings(listed.warnings)).toEqual([])
      expect(dependencyWarnings(all.warnings)).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)
})
