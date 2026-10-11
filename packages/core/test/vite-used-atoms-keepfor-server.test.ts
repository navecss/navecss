/**
 * AC-used-atoms-53 covers: the untransformed-dependency warning for a package `keepFor` lists, and
 * the reading of a take a server environment makes from it: the server's import of a package it
 * leaves external is judged against the `cx` exports the client graph knows, in one process in
 * either order and in two invocations (a real `vite build` of a scratch app and a dependency).
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { RenderContext } from '../src/vite-types.ts'
import type { UsedContext } from '../src/vite-used.ts'
import type { ScratchApp } from './helpers/vite-app.ts'

import { warnUnknown } from '../src/vite-server-takes.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildEnvironments,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { KEEP_FLEX, takenLine } from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const CN = "export { cx as cn } from '@navecss/core/cx'\n"
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const CLIENT = "import { Menu } from '@acme/ui'\nexport const A = Menu\n"
const WARNING_ONE =
  "@acme/ui, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: src/entry-server.ts imports '@acme/ui/f.js', which no environment of this build transforms. Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead."
const WARNING_TWO =
  "@acme/ui, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: src/entry-server.ts imports '@acme/ui/f.js', which no environment of this build transforms; src/render.ts imports '@acme/ui/g.js', which no environment of this build transforms. Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead."
const ORDERS = [
  ['the client first', ['client', 'ssr']],
  ['the server first', ['ssr', 'client']],
] as const

/**
 * The package `@acme/ui`: an entry that exports `Menu` and then `extra`, with `files` beside it.
 */
function acme(extra: string, files: Record<string, string> = {}): Record<string, string> {
  return { 'index.js': `export { Menu } from './menu.js'\n${extra}`, 'menu.js': MENU_JS, ...files }
}

/**
 * The app: a client that imports `client`, a server entry that is `server`, and `ui` installed
 * as a dependency the server leaves external.
 */
function serverApp(input: {
  client?: string
  server: string
  ui: Record<string, string>
}): ScratchApp {
  const app = makeUsedApp(
    appFiles({ 'src/App.ts': input.client ?? CLIENT, 'src/entry-server.ts': input.server }, [
      'src/App.ts',
    ]),
    'copy',
  )
  addPackage(app, '@acme/ui', input.ui)
  return app
}

/**
 * What the plugin printed as warnings.
 */
function pluginWarnings(warnings: readonly string[]): string[] {
  return warnings.filter((message) => message.includes('[plugin nave'))
}

describe('AC-used-atoms-53 - a take a server environment makes from a listed package it leaves external', () => {
  const known = acme("export * from './f.js'\n", { 'f.js': CN })
  const server = "import { cn } from '@acme/ui'\nexport const render = cn('block')\n"
  const followed =
    "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const render = [Menu, cx('block')]\n"

  it('warns once for a module no environment transforms, and fails once the server reads it', async () => {
    const code =
      "import { Menu } from '@acme/ui'\nimport { cn } from '@acme/ui/f.js'\nexport const render = [Menu, cn('block')]\n"
    const ui = acme('', { 'f.js': CN })
    const app = serverApp({ server: code, ui })
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })
      const warnings = pluginWarnings(built.warnings)

      expect(built.error).toBeUndefined()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(WARNING_ONE)
      expect(warnings[0]).not.toContain('keepFor: {')
      const bundled = await buildEnvironments(app, {
        options: { keepFor: KEEP_FLEX },
        config: { ssr: { noExternal: ['@acme/ui'] } },
      })

      expect(bundled.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('lists several files and modules in the one warning', async () => {
    const ui = acme('', { 'f.js': CN, 'g.js': CN })
    const app = serverApp({
      server:
        "import { cn } from '@acme/ui/f.js'\nimport { more } from './render.ts'\nexport const render = [cn('block'), more]\n",
      ui,
    })
    writeFileSync(
      path.join(app.root, 'src/render.ts'),
      "import { cn } from '@acme/ui/g.js'\nexport const more = cn('grid')\n",
    )
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

      expect(pluginWarnings(built.warnings)).toEqual([expect.stringContaining(WARNING_TWO)])
    } finally {
      app.dispose()
    }
  }, 120_000)

  describe.each(ORDERS)('with %s', (_, order) => {
    it('fails with the line the client would print, naming the server file, and is green once cx comes from Nave', async () => {
      const app = serverApp({ server, ui: known })
      try {
        const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX }, order })

        expect(built.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
        writeFileSync(path.join(app.root, 'src/entry-server.ts'), followed)
        const fixed = await buildEnvironments(app, {
          options: { keepFor: KEEP_FLEX },
          order: ['ssr', 'client'],
        })

        expect(fixed.error).toBeUndefined()
        expect(atomLayerAtoms(fixed.client.css)).toEqual(atoms('block', 'flex'))
      } finally {
        app.dispose()
      }
    }, 120_000)

    it('prints nothing for a server that imports only Menu', async () => {
      const app = serverApp({
        server: "import { Menu } from '@acme/ui'\nexport const render = Menu\n",
        ui: known,
      })
      try {
        const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX }, order })

        expect(built.error).toBeUndefined()
        expect(pluginWarnings(built.warnings)).toEqual([])
      } finally {
        app.dispose()
      }
    }, 120_000)

    it('gives the cxModules line for a readable take of a module that has a clearing specifier', async () => {
      const ui = acme("export { cx } from '@navecss/core/cx'\n")
      const code =
        "import { cx } from '@acme/ui'\nimport { Menu } from '@acme/ui'\nexport const render = [Menu, cx('block')]\n"
      const app = serverApp({ server: code, ui })
      try {
        const first = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX }, order })

        expect(first.error!.split('\n')).toContain(
          "@acme/ui re-exports cx in '@acme/ui'. List it in navePlugin(): cxModules: ['@acme/ui'].",
        )
        const pasted = await buildEnvironments(app, {
          options: { keepFor: KEEP_FLEX, cxModules: ['@acme/ui'] },
          order: ['ssr', 'client'],
        })

        expect(pasted.error).toBeUndefined()
        expect(atomLayerAtoms(pasted.client.css)).toEqual(atoms('block', 'flex'))
      } finally {
        app.dispose()
      }
    }, 120_000)
  })

  it('judges a take of a module that the client read and found no cx export in as nothing', async () => {
    const app = serverApp({
      server: "import { other } from '@acme/ui/other.js'\nexport const render = other\n",
      client:
        "import { Menu } from '@acme/ui'\nimport { other } from '@acme/ui/other.js'\nexport const A = [Menu, other]\n",
      ui: acme('', { 'other.js': 'export const other = 1\n' }),
    })
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([])
    } finally {
      app.dispose()
    }
  }, 120_000)
})

describe('AC-used-atoms-53 - a take a server invocation makes is judged by the client invocation', () => {
  const known = acme("export * from './f.js'\n", { 'f.js': CN })
  const server = "import { cn } from '@acme/ui'\nexport const render = cn('block')\n"
  const BUILD_SERVER = { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false }

  it('fails the client invocation with the line the client would print, the server going first', async () => {
    const app = serverApp({ server, ui: known })
    try {
      const first = await buildUsed(app, { options: { keepFor: KEEP_FLEX }, build: BUILD_SERVER })

      expect(first.error).toBeUndefined()
      expect(pluginWarnings(first.warnings ?? [])).toEqual([])
      const second = await buildUsed(app, { options: { keepFor: KEEP_FLEX } })

      expect(second.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('judges the take one run late when the client goes first', async () => {
    const app = serverApp({ server, ui: known })
    try {
      const client = await buildUsed(app, { options: { keepFor: KEEP_FLEX } })
      const second = await buildUsed(app, { options: { keepFor: KEEP_FLEX }, build: BUILD_SERVER })
      const next = await buildUsed(app, { options: { keepFor: KEEP_FLEX } })

      expect(client.error).toBeUndefined()
      expect(second.error).toBeUndefined()
      expect(next.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
    } finally {
      app.dispose()
    }
  }, 180_000)
})

describe('AC-used-atoms-53 - the warning for a listed package no environment transforms', () => {
  it('is printed once for a package however many times its imports are judged', () => {
    const printed: string[] = []
    const ctx = {
      warn: (message: string) => {
        printed.push(message)
      },
    } as unknown as RenderContext
    const context = { state: { warned: new Set<string>() } } as unknown as UsedContext
    const unknown = [{ specifier: '@acme/ui/f.js', takes: [], taker: 'src/entry-server.ts' }]

    warnUnknown(ctx, context, unknown)
    warnUnknown(ctx, context, unknown)

    expect(printed).toEqual([expect.stringContaining(WARNING_ONE)])
  })
})
