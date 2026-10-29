/**
 * AC-used-atoms-53 covers: what a server build records for the client build that follows, kept for
 * each server build, a server file whose import the build cannot read, a server import resolved
 * with the server's conditions, and the warning that never appears for a server that takes nothing
 * (a real `vite build` of a scratch app and a dependency).
 */
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ScratchApp } from './helpers/vite-app.ts'

import { recordedSentence } from '../src/vite-server-takes.ts'
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
const MENU_ONLY = "import { Menu } from '@acme/ui'\nexport const render = Menu\n"
const TAKES_CN = "import { cn } from '@acme/ui'\nexport const render = cn('block')\n"
const BUILD_SERVER = { ssr: 'src/entry-server.ts', outDir: 'dist-ssr', cssMinify: false }
const REPEATS = 100
const RECORDED =
  "src/entry-server.ts was read by an earlier server build, not by this one, so what this message says of its imports comes from the record that build left in Vite's cache directory; if the file has changed since, run that server build again to refresh the record, or, if you no longer run that build, delete nave-used-server-takes.json there and run each server build you do."
const RECORDED_TWO =
  "src/entry-server.ts, src/render.ts were read by earlier server builds, not by this one, so what this message says of their imports comes from the records those builds left in Vite's cache directory; if one of those files has changed since, run the server build that read it again to refresh its record, or, if you no longer run that build, delete nave-used-server-takes.json there and run each server build you do."
const X3_WARNING =
  "@acme/ui, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: src/r.cjs loads '@acme/ui' in a way the build cannot read as a take, such as a require() or a # import. Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead."
const HASH_WARNING =
  "@acme/ui, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: src/entry-server.ts loads '@acme/ui' in a way the build cannot read as a take, such as a require() or a # import. Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead."
const X2_WARNING =
  "@acme/ui, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: src/entry-server.ts imports '@acme/ui', which the server loads as node_modules/@acme/ui/node.js, a file no environment of this build transforms. Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead."

/**
 * The package `@acme/ui`: an entry that exports `Menu` and then `extra`, with `files` beside it.
 */
function acme(extra: string, files: Record<string, string> = {}): Record<string, string> {
  return { 'index.js': `export { Menu } from './menu.js'\n${extra}`, 'menu.js': MENU_JS, ...files }
}

const KNOWN = acme("export * from './f.js'\n", { 'f.js': CN })

/**
 * The app: a client that imports Menu, the server `files`, and `ui` installed as a dependency the
 * server leaves external.
 */
function serverApp(
  files: Record<string, string>,
  ui: Record<string, string>,
  client = CLIENT,
): ScratchApp {
  const app = makeUsedApp(appFiles({ 'src/App.ts': client, ...files }, ['src/App.ts']), 'copy')
  addPackage(app, '@acme/ui', ui)
  return app
}

/**
 * What the plugin printed as warnings.
 */
function pluginWarnings(warnings: readonly string[] | undefined): string[] {
  return (warnings ?? []).filter((message) => message.includes('[plugin nave'))
}

describe('AC-used-atoms-53 - what each server build recorded', () => {
  it('judges the take of the first server build after a second server build ran', async () => {
    const app = serverApp(
      {
        'src/entry-server.ts': TAKES_CN,
        'src/entry-b.ts': MENU_ONLY,
      },
      KNOWN,
    )
    try {
      const options = { keepFor: KEEP_FLEX }
      const first = await buildUsed(app, { options, build: BUILD_SERVER })
      const second = await buildUsed(app, {
        options,
        build: { ssr: 'src/entry-b.ts', outDir: 'dist-ssr-b', cssMinify: false },
      })
      const client = await buildUsed(app, { options })

      expect(first.error).toBeUndefined()
      expect(second.error).toBeUndefined()
      expect(client.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
    } finally {
      app.dispose()
    }
  })

  it('says the take comes from an earlier server build, and is green once that build ran again', async () => {
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, KNOWN)
    try {
      const options = { keepFor: KEEP_FLEX }
      await buildUsed(app, { options, build: BUILD_SERVER })
      writeFileSync(path.join(app.root, 'src/entry-server.ts'), MENU_ONLY)
      const stale = await buildUsed(app, { options })

      expect(stale.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
      expect(stale.error!.split('\n').at(-1)).toBe(RECORDED)
      await buildUsed(app, { options, build: BUILD_SERVER })
      const fresh = await buildUsed(app, { options })

      expect(fresh.error).toBeUndefined()
    } finally {
      app.dispose()
    }
  })

  it('drops a record whose server file no longer exists', async () => {
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, KNOWN)
    try {
      const options = { keepFor: KEEP_FLEX }
      await buildUsed(app, { options, build: BUILD_SERVER })
      unlinkSync(path.join(app.root, 'src/entry-server.ts'))
      writeFileSync(path.join(app.root, 'src/entry-b.ts'), MENU_ONLY)
      const renamed = await buildUsed(app, {
        options,
        build: { ssr: 'src/entry-b.ts', outDir: 'dist-ssr-b', cssMinify: false },
      })
      const client = await buildUsed(app, { options })

      expect(renamed.error).toBeUndefined()
      expect(client.error).toBeUndefined()
    } finally {
      app.dispose()
    }
  })

  it('keeps a record whose server file is named by an absolute path, as on another drive', async () => {
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, KNOWN)
    try {
      const options = { keepFor: KEEP_FLEX }
      await buildUsed(app, { options, build: BUILD_SERVER })
      const record = readdirSync(app.root, { recursive: true, encoding: 'utf8' }).find(
        (file) => path.basename(file) === 'nave-used-server-takes.json',
      )!
      const absolute = path.join(app.root, 'src/entry-server.ts')
      const recordPath = path.join(app.root, record)
      const text = readFileSync(recordPath, 'utf8').replaceAll(
        '"taker": "src/entry-server.ts"',
        () => `"taker": ${JSON.stringify(absolute)}`,
      )
      expect(text).toContain(JSON.stringify(absolute))
      writeFileSync(recordPath, text)
      const client = await buildUsed(app, { options })

      expect(client.error!.split('\n')).toContain(takenLine(`${absolute} (cn)`))
    } finally {
      app.dispose()
    }
  })

  it('does not say it for a take a server build of the same process produced', async () => {
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, KNOWN)
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

      expect(built.error!.split('\n')).toContain(takenLine('src/entry-server.ts (cn)'))
      expect(built.error).not.toContain('earlier server build')
    } finally {
      app.dispose()
    }
  })
})

describe('AC-used-atoms-53 - a server file whose import the build cannot read', () => {
  const files = {
    'src/entry-server.ts': "import { r } from './r.cjs'\nexport const render = r\n",
    'src/r.cjs': "const { cn } = require('@acme/ui')\nexports.r = cn('block')\n",
  }

  it.each([
    ['the client first', ['client', 'ssr']],
    ['the server first', ['ssr', 'client']],
  ] as const)('warns, and does not fail, with %s', async (_, order) => {
    const app = serverApp(files, KNOWN)
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX }, order })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([expect.stringContaining(X3_WARNING)])
    } finally {
      app.dispose()
    }
  })
})

describe('AC-used-atoms-53 - a server import resolved with the server conditions', () => {
  it('warns for a module the client did not read, though the client read another file of the package', async () => {
    const ui = {
      ...acme("export * from './f.js'\n", { 'f.js': CN }),
      'index.js': "export { Menu } from './menu.js'\n",
      'browser.js': "export { Menu } from './menu.js'\n",
      'node.js': "export { Menu } from './menu.js'\nexport * from './f.js'\n",
      'package.json': JSON.stringify({
        name: '@acme/ui',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { browser: './browser.js', default: './node.js' } },
      }),
    }
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, ui)
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([expect.stringContaining(X2_WARNING)])
    } finally {
      app.dispose()
    }
  })
})

describe('AC-used-atoms-53 - the file the server loads, not the file the client does', () => {
  it('ignores a condition only the dev module runner of a server reads', async () => {
    const ui = {
      ...acme(''),
      'index.js': "export { Menu } from './menu.js'\n",
      'c.js': "export { Menu } from './menu.js'\n",
      'd.js': "export { Menu } from './menu.js'\n",
      'n.js': "export { Menu } from './menu.js'\nexport * from './f.js'\n",
      'f.js': CN,
      'package.json': JSON.stringify({
        name: '@acme/ui',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { custom: './c.js', node: './n.js', default: './d.js' } },
      }),
    }
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, ui)
    try {
      const built = await buildEnvironments(app, {
        options: { keepFor: KEEP_FLEX },
        config: {
          resolve: { conditions: ['custom', 'browser', 'import'] },
          ssr: { resolve: { externalConditions: ['custom'] } },
        },
      })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([
        expect.stringContaining(
          "imports '@acme/ui', which the server loads as node_modules/@acme/ui/n.js, a file no environment of this build transforms",
        ),
      ])
    } finally {
      app.dispose()
    }
  })

  it('resolves with the require conditions for a server bundle in the CommonJS format', async () => {
    const ui = {
      ...acme(''),
      'index.js': "export { Menu } from './menu.js'\n",
      'esm.js': "export { Menu } from './menu.js'\n",
      'cjs.cjs':
        "const { cx } = require('@navecss/core/cx')\nexports.Menu = () => 1\nexports.cn = cx\n",
      'package.json': JSON.stringify({
        name: '@acme/ui',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { import: './esm.js', require: './cjs.cjs', default: './esm.js' } },
      }),
    }
    const app = serverApp({ 'src/entry-server.ts': TAKES_CN }, ui)
    try {
      const built = await buildEnvironments(app, {
        options: { keepFor: KEEP_FLEX },
        config: {
          environments: {
            ssr: {
              build: {
                outDir: 'dist-ssr',
                write: false,
                rolldownOptions: {
                  input: 'src/entry-server.ts',
                  output: { format: 'cjs' },
                },
              },
            },
          },
        },
      })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([
        expect.stringContaining(
          "imports '@acme/ui', which the server loads as node_modules/@acme/ui/cjs.cjs, a file no environment of this build transforms",
        ),
      ])
    } finally {
      app.dispose()
    }
  })

  it('warns, with words that fit, for a package reached through a # import', async () => {
    const app = serverApp(
      {
        'package.json': JSON.stringify({
          private: true,
          type: 'module',
          imports: { '#cn': '@acme/ui' },
        }),
        'src/entry-server.ts': "import { cn } from '#cn'\nexport const render = cn('block')\n",
      },
      KNOWN,
    )
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([expect.stringContaining(HASH_WARNING)])
    } finally {
      app.dispose()
    }
  })
})

describe('AC-used-atoms-53 - a server that takes nothing prints nothing', () => {
  it('prints no warning in 100 builds with the client first', async () => {
    let warned = 0
    for (let build = 0; build < REPEATS; build += 1) {
      const app = serverApp({ 'src/entry-server.ts': MENU_ONLY }, KNOWN)
      try {
        const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

        expect(built.error).toBeUndefined()
        warned += pluginWarnings(built.warnings).length
      } finally {
        app.dispose()
      }
    }

    expect(warned).toBe(0)
  }, 600_000)

  it('treats export * of a module that holds only a default export as no take', async () => {
    const ui = acme('', { 'd.js': `${IMPORT}export default cx\n` })
    const client =
      "import { Menu } from '@acme/ui'\nimport '@acme/ui/d.js'\nexport const A = Menu\n"
    const app = serverApp({ 'src/entry-server.ts': "export * from '@acme/ui/d.js'\n" }, ui, client)
    try {
      const built = await buildEnvironments(app, { options: { keepFor: KEEP_FLEX } })

      expect(built.error).toBeUndefined()
      expect(pluginWarnings(built.warnings)).toEqual([])
      expect(atomLayerAtoms(built.client.css)).toEqual(atoms('flex'))
    } finally {
      app.dispose()
    }
  })

  it('does not count a dependency the server bundles as an application module', async () => {
    const app = serverApp(
      { 'src/entry-server.ts': "import { Pill } from '@other/ui'\nexport const render = Pill\n" },
      KNOWN,
    )
    addPackage(app, '@other/ui', {
      'index.js': "import { cn } from '@acme/ui/f.js'\nexport const Pill = cn('block')\n",
    })
    try {
      const built = await buildEnvironments(app, {
        options: { keepFor: { '@acme/ui': ['flex', 'block'] } },
        config: { ssr: { noExternal: ['@other/ui'] } },
      })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.client.css)).toEqual(atoms('block', 'flex'))
    } finally {
      app.dispose()
    }
  })
})

describe('AC-used-atoms-53 - the sentence for several recorded takers', () => {
  it('speaks of earlier server builds and of the records those builds left', () => {
    expect(recordedSentence(['src/render.ts', 'src/entry-server.ts'])).toBe(RECORDED_TWO)
  })
})
