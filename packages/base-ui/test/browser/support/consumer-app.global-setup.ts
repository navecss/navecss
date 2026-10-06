/**
 * Builds the consumer app the PostCSS-free install check opens in a real browser, the
 * way a project that installed the package would have it:
 *
 * - `@navecss/base-ui` and `@navecss/tokens` are PACKED (`pnpm pack`) and extracted into the app's
 *   `node_modules`, so the build reads the files the published tarballs carry, not the workspace;
 * - the app has no PostCSS configuration and no Vite configuration at all: its entry imports the
 *   tokens and then the package's stylesheet, and renders one wrapped Dialog and one wrapped Button;
 * - `vite build` is the real command-line build, run in a directory outside the repository so that
 *   no configuration file above the app is found either.
 *
 * The output lands in `test/browser/fixtures/consumer-app/` (gitignored, regenerated every run),
 * where the config's middleware serves it, and the build's exit code and the app's files are handed
 * to the test.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ConsumerBuild {
  /**
  The files at the app's root, before the build: `node_modules` and `dist` left out.
   */
  readonly appFiles: readonly string[]
  readonly exitCode: number | null
  /**
  The build's combined output, for the failure message.
   */
  readonly output: string
  /**
  Where the page is served from.
   */
  readonly url: string
}

interface GlobalSetupContext {
  provide: (key: 'consumerBuild', value: ConsumerBuild) => void
}

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const TOKENS_DIR = path.resolve(PACKAGE_DIR, '../tokens')
const FIXTURE_DIR = path.join(PACKAGE_DIR, 'test/browser/fixtures/consumer-app')
const URL_BASE = '/__fixtures__/consumer-app/'

const ENTRY = `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@navecss/base-ui/button'
import { Dialog } from '@navecss/base-ui/dialog'
import '@navecss/tokens/css'
import '@navecss/base-ui/styles.css'

createRoot(document.getElementById('root')).render(
  createElement(
    'main',
    null,
    createElement(Button, { id: 'the-button' }, 'Save'),
    createElement(
      Dialog.Root,
      { defaultOpen: true },
      createElement(
        Dialog.Portal,
        null,
        createElement(
          Dialog.Popup,
          { id: 'the-dialog' },
          createElement(Dialog.Title, null, 'Title'),
          createElement(Dialog.Description, null, 'Description'),
          createElement(Dialog.Close, null, 'Close'),
        ),
      ),
    ),
  ),
)
`

const pack = (packageDir: string, into: string): string => {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', into], {
    cwd: packageDir,
    encoding: 'utf8',
  })
  const tarball = output
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => line.endsWith('.tgz'))
  if (tarball === undefined) {
    throw new Error(`pnpm pack of ${packageDir} printed no tarball:\n${output}`)
  }
  return path.resolve(into, path.basename(tarball))
}

const install = (tarball: string, appDir: string, name: string): void => {
  const target = path.join(appDir, 'node_modules', name)
  mkdirSync(target, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', target, '--strip-components=1'])
}

/**
 * The packages a consumer has installed beside ours: the peers (`react`, `react-dom`,
 * `@base-ui/react`), linked to the copies this workspace's tests already use.
 */
const linkPeer = (appDir: string, name: string): void => {
  const require = createRequire(path.join(PACKAGE_DIR, 'package.json'))
  const packageJson = require.resolve(`${name}/package.json`)
  const target = path.join(appDir, 'node_modules', name)
  mkdirSync(path.dirname(target), { recursive: true })
  symlinkSync(path.dirname(packageJson), target, 'dir')
}

/**
Builds the app and hands the build's outcome to the tests.
 */
export function setup({ provide }: GlobalSetupContext): () => void {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-consumer-app-'))
  const appDir = path.join(scratch, 'app')
  mkdirSync(path.join(appDir, 'src'), { recursive: true })

  install(pack(PACKAGE_DIR, scratch), appDir, '@navecss/base-ui')
  install(pack(TOKENS_DIR, scratch), appDir, '@navecss/tokens')
  for (const peer of ['react', 'react-dom', '@base-ui/react']) {
    linkPeer(appDir, peer)
  }

  writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify({ name: 'consumer-app', private: true, type: 'module' }),
  )
  writeFileSync(
    path.join(appDir, 'index.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>consumer app</title><div id="root"></div><script type="module" src="/src/main.js"></script></html>',
  )
  writeFileSync(path.join(appDir, 'src/main.js'), ENTRY)

  const appFiles = readdirSync(appDir).filter((name) => name !== 'node_modules')

  // A consumer's shell has no NODE_ENV the test runner set for itself.
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== 'NODE_ENV'),
  )
  const vite = path.join(
    path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
    'bin/vite.js',
  )
  const build = spawnSync(process.execPath, [vite, 'build', '--base', URL_BASE], {
    cwd: appDir,
    encoding: 'utf8',
    env: environment,
  })

  rmSync(FIXTURE_DIR, { force: true, recursive: true })
  mkdirSync(path.dirname(FIXTURE_DIR), { recursive: true })
  if (build.status === 0) {
    cpSync(path.join(appDir, 'dist'), FIXTURE_DIR, { recursive: true })
  }

  provide('consumerBuild', {
    appFiles,
    exitCode: build.status,
    output: `${build.stdout}${build.stderr}`,
    url: `${URL_BASE}index.html`,
  })
  return () => {
    rmSync(scratch, { force: true, recursive: true })
  }
}
