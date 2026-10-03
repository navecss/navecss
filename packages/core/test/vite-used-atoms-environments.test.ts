/**
 * The used-atoms criteria for environments (AC-used-atoms-12 to -15): the emitted set is the
 * union over every environment built in one process, an atom collected after the CSS was written
 * fails the build, two invocations share their sets through `cacheDir`, and a Nave-consuming
 * dependency no environment transforms is warned about.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { HANDSHAKE_FILE } from '../src/vite-handshake.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildEnvironments,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * An app with a client calling `flex`, a dependency bundled into it calling `gap`, and a server
 * render calling `server`.
 */
function ssrApp(server: string) {
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

describe('AC-used-atoms-12 — every environment in one process, dependencies included', () => {
  it('unions the client, a bundled dependency and the server render, whichever builds first', async () => {
    for (const order of [
      ['ssr', 'client'],
      ['client', 'ssr'],
    ] as const) {
      const app = ssrApp("cx('grid')")
      try {
        const built = await buildEnvironments(app, { order, options: { keep: ['grid'] } })

        expect(built.error, order.join()).toBeUndefined()
        expect(atomLayerAtoms(built.client.css)).toEqual(atoms('flex', 'gap', 'grid'))
      } finally {
        app.dispose()
      }
    }
  }, 60_000)

  it('builds the server first and the client sees the server’s atom without keep', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const built = await buildEnvironments(app, { order: ['ssr', 'client'] })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.client.css)).toEqual(atoms('flex', 'gap', 'grid'))
    } finally {
      app.dispose()
    }
  }, 60_000)

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

  it('gives each environment its own plugin instance for one root the same CSS as a shared one', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const shared = await buildEnvironments(app, { order: ['ssr', 'client'] })
      const separate = await buildEnvironments(app, {
        order: ['ssr', 'client'],
        nave: navePlugin(),
      })
      const again = await buildEnvironments(app, {
        order: ['ssr', 'client'],
        nave: [...navePlugin(), ...navePlugin()],
      })

      expect(atomLayerAtoms(separate.client.css)).toEqual(atomLayerAtoms(shared.client.css))
      expect(again.error).toBeUndefined()
      expect(atomLayerAtoms(again.client.css)).toEqual(atomLayerAtoms(shared.client.css))
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-13 — an atom collected after the CSS was written fails the build', () => {
  it('fails naming the atom, the module and both remedies, client first', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const built = await buildEnvironments(app, { order: ['client', 'ssr'] })

      expect(built.error).toContain('grid')
      expect(built.error).toContain('src/entry-server.ts')
      expect(built.error).toContain('keep')
      expect(built.error).toContain('builder.buildApp')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('is green with keep, and green when the server only uses an atom the client has', async () => {
    const withKeep = ssrApp("cx('grid')")
    const sameAtom = ssrApp("cx('flex')")
    try {
      const kept = await buildEnvironments(withKeep, {
        order: ['client', 'ssr'],
        options: { keep: ['grid'] },
      })
      const same = await buildEnvironments(sameAtom, { order: ['client', 'ssr'] })

      expect(kept.error).toBeUndefined()
      expect(atomLayerAtoms(kept.client.css)).toContain('grid')
      expect(same.error).toBeUndefined()
    } finally {
      withKeep.dispose()
      sameAtom.dispose()
    }
  }, 60_000)

  it('fails the same way for a literal class and no cx call', async () => {
    const app = ssrApp("'nave-grid'")
    try {
      const built = await buildEnvironments(app, { order: ['client', 'ssr'] })

      expect(built.error).toContain('grid')
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-14 — two invocations share their sets through cacheDir', () => {
  const client = (app: ReturnType<typeof ssrApp>, extra = {}) => buildUsed(app, extra)
  const server = (app: ReturnType<typeof ssrApp>) =>
    buildUsed(app, { build: { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false } })
  const fileOf = (
    app: ReturnType<typeof ssrApp>,
  ): { emitted: string[]; writer: string; writtenAt: string; build: string } =>
    JSON.parse(readFileSync(path.join(app.root, '.vite', HANDSHAKE_FILE), 'utf8'))

  it('fails the second invocation, client first, naming the atom and the module', async () => {
    const app = ssrApp("cx('grid')")
    try {
      const first = await client(app)
      const second = await server(app)

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
      const first = await server(app)
      const second = await client(app)

      expect(first.error).toBeUndefined()
      expect(second.error).toBeUndefined()
      expect(atomLayerAtoms(second.css)).toEqual(atoms('flex', 'gap', 'grid'))
      expect(fileOf(app).writer).toBe('client')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('does not pass silently when a server build runs alone after a finished pair', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await server(app)
      await client(app)
      const alone = await server(app)

      expect(alone.error).toBeUndefined()
      const warning = alone.warnings!.find((message) => message.includes('nave-used-atoms.json'))
      expect(warning).toBeDefined()
      expect(warning).toContain('Build the client first')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('unions a leftover server set into a lone client build, then replaces the file with its own', async () => {
    const app = ssrApp("cx('grid')")
    try {
      await server(app)
      const built = await client(app)
      const file = fileOf(app)

      expect(atomLayerAtoms(built.css)).toContain('grid')
      expect(file.writer).toBe('client')
      expect(file.emitted).toEqual(atomLayerAtoms(built.css))
      expect(file.emitted).toEqual([...file.emitted].toSorted())
      expect(Number.isNaN(Date.parse(file.writtenAt))).toBe(false)
      expect(file.build).toBeTruthy()
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-15 — an untransformed Nave-consuming dependency is warned about', () => {
  /**
   * A server render importing `ssr-lib` and `plain-lib`, neither imported by the client.
   */
  function libApp(manifest: 'dependencies' | 'peerDependencies') {
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
  const ssr = { ssr: 'src/entry-server.ts', outDir: 'dist-ssr' }
  const pluginWarnings = (warnings: readonly string[] | undefined): string[] =>
    (warnings ?? []).filter(
      (message) => message.includes('nave:collect') || message.includes('ssr.noExternal'),
    )

  it.each(['dependencies', 'peerDependencies'] as const)(
    'warns once, naming ssr-lib and ssr.noExternal, when it is declared in %s',
    async (manifest) => {
      const app = libApp(manifest)
      try {
        const built = await buildUsed(app, { build: ssr })
        const warnings = pluginWarnings(built.warnings)

        expect(built.error).toBeUndefined()
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain('ssr-lib')
        expect(warnings[0]).toContain('ssr.noExternal')
        expect(warnings.join()).not.toContain('plain-lib')
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

      expect(pluginWarnings(bundled.warnings)).toEqual([])
      expect(pluginWarnings(listed.warnings)).toEqual([])
      expect(pluginWarnings(all.warnings)).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)
})
