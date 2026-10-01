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
  for (const cleanup of cleanups.splice(0)) await cleanup()
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
