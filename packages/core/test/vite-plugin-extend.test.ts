/**
 * AC-directive-core-37: the Vite plugin watches the `extend` module, so editing it changes the CSS
 * with no restart, in the dev server and under `vite build --watch`; and the plugin refuses an atom
 * that would break out of the rule it is spliced into, the same way the PostCSS adapter does.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { runHook } from './helpers/vite-hook.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import { appConfig, makeApp, type ScratchApp, startDev } from './helpers/vite-app.ts'

const atomsModule = (margin: string): string =>
  `export default { brand: { declarations: { margin: '${margin}' } } }\n`

const FILES = {
  'index.html': APP_FILES['index.html']!,
  'src/main.js': "import './app.css'",
  'src/app.css': '.a { @nave brand; }\n',
  'atoms.mjs': atomsModule('1px'),
}

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  // Last registered, first run: a server or watcher closes before the app it watches is removed.
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup()
})

async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`timed out waiting for ${what}`)
}

describe('AC-directive-core-37 — the Vite plugin watches the extend module', () => {
  it('the dev server serves the new value after the module changes, with no restart', async () => {
    const app: ScratchApp = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], {
        server: { middlewareMode: true, watch: {} },
      }),
    )
    cleanups.push(() => server.close())

    const first = await server.transformRequest('/src/app.css')
    expect(first?.code).toMatch(/margin:\s*1px/)

    writeFileSync(path.join(app.root, 'atoms.mjs'), atomsModule('2px'))

    await until(async () => {
      const next = await server.transformRequest('/src/app.css')
      return next?.code.includes('margin: 2px') === true
    }, 'the dev server to serve margin: 2px')
  }, 60_000)

  /**
   * Records every payload the dev server sends its client, passing each on as before.
   */
  function spyOnClient(server: Awaited<ReturnType<typeof startDev>>): { type: string }[] {
    const sent: { type: string }[] = []
    const hot = server.environments.client.hot
    const send = hot.send.bind(hot) as (payload: { type: string }) => void
    hot.send = ((payload: { type: string }) => {
      sent.push(payload)
      send(payload)
    }) as never
    return sent
  }

  it('a module that failed on its first load tells the client to reload once it is fixed', async () => {
    const app: ScratchApp = makeApp({ ...FILES, 'atoms.mjs': "throw new Error('not ready')\n" })
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], {
        server: { middlewareMode: true, watch: {} },
      }),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)

    await expect(server.transformRequest('/src/app.css')).rejects.toThrow()
    writeFileSync(path.join(app.root, 'atoms.mjs'), atomsModule('2px'))

    await until(
      () => Promise.resolve(sent.some((payload) => payload.type === 'full-reload')),
      'a full-reload payload for the client',
    )
    const next = await server.transformRequest('/src/app.css')
    expect(next?.code).toContain('margin: 2px')
  }, 60_000)

  it('a stylesheet whose first load failed while another stylesheet already used the module is reloaded once the module is fixed', async () => {
    const app: ScratchApp = makeApp({ ...FILES, 'src/late.css': '.late { @nave brand; }\n' })
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], {
        server: { middlewareMode: true, watch: {} },
      }),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)
    await server.transformRequest('/src/app.css')

    writeFileSync(path.join(app.root, 'atoms.mjs'), "throw new Error('not ready')\n")
    await expect(server.transformRequest('/src/late.css')).rejects.toThrow()
    // Let the dev server finish with the throwing write before the fix lands: its file watcher
    // drops a second change to one file that follows the first too closely.
    await until(() => Promise.resolve(sent.length > 0), 'the dev server to see the throwing module')
    await new Promise((resolve) => setTimeout(resolve, 300))
    // The client that was told to reload asks for the stylesheet again, and it fails again.
    await expect(server.transformRequest('/src/late.css')).rejects.toThrow()
    sent.length = 0
    writeFileSync(path.join(app.root, 'atoms.mjs'), atomsModule('2px'))

    await until(
      () => Promise.resolve(sent.some((payload) => payload.type === 'full-reload')),
      'a full-reload payload for the client',
    )
  }, 60_000)

  it('an edit to a module that loaded fine sends no full reload: Vite’s own update serves it', async () => {
    const app: ScratchApp = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], {
        server: { middlewareMode: true, watch: {} },
      }),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)
    await server.transformRequest('/src/app.css')

    writeFileSync(path.join(app.root, 'atoms.mjs'), atomsModule('2px'))
    await until(async () => {
      const next = await server.transformRequest('/src/app.css')
      return next?.code.includes('margin: 2px') === true
    }, 'the dev server to serve margin: 2px')
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(sent.filter((payload) => payload.type === 'full-reload')).toEqual([])
  }, 60_000)

  it('vite build --watch rebuilds with the new value', async () => {
    const app = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const outDir = path.join(app.root, 'out')
    const { build } = await import('vite')
    const config = appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })])
    const watcher = (await build({
      ...config,
      build: { ...config.build, write: true, outDir, watch: {} },
    })) as unknown as { close(): Promise<void> }
    cleanups.push(() => watcher.close())

    const outputs = (): string => {
      try {
        const assets = path.join(outDir, 'assets')
        return readdirSync(assets)
          .filter((name) => name.endsWith('.css'))
          .map((name) => readFileSync(path.join(assets, name), 'utf8'))
          .join('\n')
      } catch {
        return ''
      }
    }

    await until(() => Promise.resolve(/margin:1px/.test(outputs())), 'the first build to write 1px')
    writeFileSync(path.join(app.root, 'atoms.mjs'), atomsModule('2px'))
    await until(() => Promise.resolve(/margin:2px/.test(outputs())), 'the rebuild to write 2px')

    expect(outputs()).toMatch(/margin:2px/)
  }, 60_000)

  it('registers the module with addWatchFile for a stylesheet that uses a directive', async () => {
    const app = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const run = await runHook({
      code: '.a { @nave brand; }',
      options: { extend: path.join(app.root, 'atoms.mjs') },
    })

    expect(run.watched).toEqual([path.join(app.root, 'atoms.mjs')])
    expect(run.code).toMatch(/margin:\s*1px/)
  })

  it('an extend specifier that names no file fails, naming the specifier and the directory', () => {
    const plugin = navePlugin({ extend: './missing-atoms.mjs' })

    expect(() =>
      plugin.configResolved({
        root: '/some/root',
        command: 'build',
        logger: { warn() {} },
      }),
    ).toThrow('@nave: cannot find extend module "./missing-atoms.mjs" from "/some/root"')
  })
})

describe('the Vite plugin refuses an extend atom that would break out of its rule', () => {
  it.each([
    ['a declaration value with a closing brace', { color: 'red; } body { display: none' }],
    [
      'a declaration value with a semicolon and a second declaration',
      { color: 'red; display: none' },
    ],
  ])('%s', (_name, declarations) => {
    expect(() => navePlugin({ extend: { evil: { declarations } } })).toThrow(
      /does not parse as a single/,
    )
  })

  it('a media condition that opens a second rule', () => {
    const media = { '(x) { } body { color: red } @media (y)': { declarations: { color: 'red' } } }

    expect(() => navePlugin({ extend: { evil: { declarations: {}, media } } })).toThrow(
      /does not parse as a single/,
    )
  })

  it('a module’s atoms are refused after the load, not spliced', async () => {
    const app = makeApp({
      ...FILES,
      'atoms.mjs':
        "export default { evil: { declarations: { color: 'red; } body { display: none' } } }",
    })
    cleanups.push(() => app.dispose())

    await expect(
      runHook({
        code: '.a { @nave evil; }',
        options: { extend: path.join(app.root, 'atoms.mjs') },
      }),
    ).rejects.toThrow(/does not parse as a single/)
  })
})
