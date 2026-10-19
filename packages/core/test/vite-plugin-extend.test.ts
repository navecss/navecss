/**
 * AC-directive-core-37: the Vite plugin watches the `extend` module, so editing it changes the CSS
 * with no restart, in the dev server and under `vite build --watch`; and the plugin refuses an atom
 * that would break out of the rule it is spliced into, the same way the PostCSS adapter does.
 */
import type { BuildOptions } from 'vite'

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import { appConfig, makeApp, type ScratchApp, startDev } from './helpers/vite-app.ts'
import { runHook } from './helpers/vite-hook.ts'

const atomsModule = (margin: string): string =>
  `export default { brand: { declarations: { margin: '${margin}' } } }\n`

const FILES = {
  'index.html': APP_FILES['index.html']!,
  'src/main.js': "import './app.css'",
  'src/app.css': '.a { @nave brand; }\n',
  'atoms.mjs': atomsModule('1px'),
}

// The dev-server rows tell the server about each edit with an event of their own, so its file
// watcher is switched off: the operating system's file events can reach it seconds late while
// other processes write many files, along with a late batch that reports the app's own new files
// as changed, which sends a full reload no edit asked for. The event still re-runs a stylesheet
// only if the plugin registered the module with addWatchFile.
// eslint-disable-next-line unicorn/no-null -- `null` is Vite's own spelling for "no watcher"
const DEV_SERVER = { server: { middlewareMode: true, watch: null } }

// The `vite build --watch` row has the build poll the files it watches, for the same reason: a
// change reported by the operating system can reach the watcher seconds late, while a poll reads
// the file as it is. Vite hands Rolldown the polling settings it finds under `chokidar`, in place
// of any `watcher` key given directly; its type does not list `chokidar`.
const POLLING_WATCH = { chokidar: { usePolling: true, interval: 100 } } as NonNullable<
  BuildOptions['watch']
>

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  // Last registered, first run: a server or watcher closes before the app it watches is removed.
  const pending = cleanups.toReversed()
  cleanups.length = 0
  for (const cleanup of pending) await cleanup()
})

/**
 * Waits until `isMet` is true, for as long as the test may run. The test's own timeout is the
 * bound: `vite build --watch` hears an edit through the operating system's file events, which can
 * arrive many seconds late on a busy machine, and a shorter deadline of its own here would fail a
 * watcher that was only slow. `signal` is the test's, so the wait stops once the test has timed
 * out.
 */
async function until(
  isMet: () => Promise<boolean>,
  what: string,
  signal: AbortSignal,
): Promise<void> {
  while (!(await isMet())) {
    if (signal.aborted) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Writes `text` to `file` and tells the dev server it changed, as its file watcher would.
 */
function edit(server: Awaited<ReturnType<typeof startDev>>, file: string, text: string): void {
  writeFileSync(file, text)
  server.watcher.emit('change', file)
}

/**
 * Records every payload the dev server sends its client, passing each on as before.
 */
function spyOnClient(server: Awaited<ReturnType<typeof startDev>>): { type: string }[] {
  const sent: { type: string }[] = []
  const hot = server.environments.client.hot
  const send: (payload: { type: string }) => void = hot.send.bind(hot)
  hot.send = (payload: { type: string }) => {
    sent.push(payload)
    send(payload)
  }
  return sent
}

describe('AC-directive-core-37 — the Vite plugin watches the extend module', () => {
  it('the dev server serves the new value after the module changes, with no restart', async ({
    signal,
  }) => {
    const app: ScratchApp = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], DEV_SERVER),
    )
    cleanups.push(() => server.close())

    const first = await server.transformRequest('/src/app.css')
    expect(first?.code).toMatch(/margin:\s*1px/)

    edit(server, path.join(app.root, 'atoms.mjs'), atomsModule('2px'))

    await until(
      async () => {
        const next = await server.transformRequest('/src/app.css')
        return next?.code.includes('margin: 2px') === true
      },
      'the dev server to serve margin: 2px',
      signal,
    )
  }, 60_000)

  it('a module that failed on its first load tells the client to reload once it is fixed', async ({
    signal,
  }) => {
    const app: ScratchApp = makeApp({ ...FILES, 'atoms.mjs': "throw new Error('not ready')\n" })
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], DEV_SERVER),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)

    await expect(server.transformRequest('/src/app.css')).rejects.toThrow()
    edit(server, path.join(app.root, 'atoms.mjs'), atomsModule('2px'))

    await until(
      () => Promise.resolve(sent.some((payload) => payload.type === 'full-reload')),
      'a full-reload payload for the client',
      signal,
    )
    const next = await server.transformRequest('/src/app.css')
    expect(next?.code).toContain('margin: 2px')
  }, 60_000)

  it('a stylesheet whose first load failed while another stylesheet already used the module is reloaded once the module is fixed', async ({
    signal,
  }) => {
    const app: ScratchApp = makeApp({ ...FILES, 'src/late.css': '.late { @nave brand; }\n' })
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], DEV_SERVER),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)
    await server.transformRequest('/src/app.css')

    edit(server, path.join(app.root, 'atoms.mjs'), "throw new Error('not ready')\n")
    await expect(server.transformRequest('/src/late.css')).rejects.toThrow()
    // Let the dev server finish with the throwing edit before the fix lands.
    await until(
      () => Promise.resolve(sent.length > 0),
      'the dev server to see the throwing module',
      signal,
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    // The client that was told to reload asks for the stylesheet again, and it fails again.
    await expect(server.transformRequest('/src/late.css')).rejects.toThrow()
    sent.length = 0
    edit(server, path.join(app.root, 'atoms.mjs'), atomsModule('2px'))

    await until(
      () => Promise.resolve(sent.some((payload) => payload.type === 'full-reload')),
      'a full-reload payload for the client',
      signal,
    )
  }, 60_000)

  it('a stylesheet that failed and was then edited to hold no directive is not reloaded when the module is fixed', async () => {
    const app: ScratchApp = makeApp({ ...FILES, 'atoms.mjs': "throw new Error('not ready')\n" })
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], DEV_SERVER),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)

    await expect(server.transformRequest('/src/app.css')).rejects.toThrow()
    edit(server, path.join(app.root, 'src/app.css'), '.a { color: red; }\n')
    const edited = await server.transformRequest('/src/app.css')
    expect(edited?.code).toContain('color: red')
    await new Promise((resolve) => setTimeout(resolve, 500))
    sent.length = 0
    edit(server, path.join(app.root, 'atoms.mjs'), atomsModule('2px'))
    // A reload, if one is coming, comes within a few seconds; stop looking as soon as one does.
    const deadline = Date.now() + 4000
    while (Date.now() < deadline && sent.every((payload) => payload.type !== 'full-reload')) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    expect(sent.filter((payload) => payload.type === 'full-reload')).toEqual([])
  }, 60_000)

  it('an edit to a module that loaded fine sends no full reload: Vite’s own update serves it', async ({
    signal,
  }) => {
    const app: ScratchApp = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })], DEV_SERVER),
    )
    cleanups.push(() => server.close())
    const sent = spyOnClient(server)
    await server.transformRequest('/src/app.css')

    edit(server, path.join(app.root, 'atoms.mjs'), atomsModule('2px'))
    await until(
      async () => {
        const next = await server.transformRequest('/src/app.css')
        return next?.code.includes('margin: 2px') === true
      },
      'the dev server to serve margin: 2px',
      signal,
    )
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(sent.filter((payload) => payload.type === 'full-reload')).toEqual([])
  }, 60_000)

  it('vite build --watch rebuilds with the new value', async ({ signal }) => {
    const app = makeApp(FILES)
    cleanups.push(() => app.dispose())
    const outDir = path.join(app.root, 'out')
    const { build } = await import('vite')
    const config = appConfig(app.root, 'postcss', [navePlugin({ extend: './atoms.mjs' })])
    const watcher = (await build({
      ...config,
      build: { ...config.build, write: true, outDir, watch: POLLING_WATCH },
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

    await until(
      () => Promise.resolve(outputs().includes('margin:1px')),
      'the first build to write 1px',
      signal,
    )
    writeFileSync(path.join(app.root, 'atoms.mjs'), atomsModule('2px'))
    await until(
      () => Promise.resolve(outputs().includes('margin:2px')),
      'the rebuild to write 2px',
      signal,
    )

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
    const [plugin] = navePlugin({ extend: './missing-atoms.mjs' })

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
