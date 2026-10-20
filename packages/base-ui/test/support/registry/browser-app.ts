/**
 * The consumer app the build criterion reads: the package and the tokens linked as a consumer's
 * `node_modules` has them, the Dialog copy's files beside the entry, and the real command-line
 * `vite build` run outside the repository, so that no configuration above the app is found.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
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
import postcss from 'postcss'

import type { BuiltApp } from './browser-paths.ts'
import type { RegistryItem } from './load.ts'

import { PACKAGE_DIR, readStylesheet } from '../stylesheet.ts'
import { FIXTURES, moduleName, writeFolder } from './browser-write.ts'

const TOKENS_DIR = path.resolve(PACKAGE_DIR, '../tokens')

const symlinkInto = (appDir: string, name: string, target: string): void => {
  const link = path.join(appDir, 'node_modules', name)
  mkdirSync(path.dirname(link), { recursive: true })
  symlinkSync(target, link, 'dir')
}

const packageDirectory = (name: string): string => {
  const require = createRequire(path.join(PACKAGE_DIR, 'package.json'))
  return path.dirname(require.resolve(`${name}/package.json`))
}

const ENTRY = `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@navecss/base-ui/button'
import { Dialog } from '@navecss/base-ui/dialog'
import { Dialog as CopyDialog } from './nave/nave-dialog.ts'
import '@navecss/tokens/css'
import '@navecss/base-ui/styles.css'

const dialog = (Namespace, id) =>
  createElement(
    Namespace.Root,
    { defaultOpen: true },
    createElement(
      Namespace.Portal,
      null,
      createElement(
        Namespace.Popup,
        { id },
        createElement(Namespace.Title, null, 'Title'),
        createElement(Namespace.Description, null, 'Description'),
        createElement(Namespace.Close, null, 'Close'),
      ),
    ),
  )

createRoot(document.getElementById('root')).render(
  createElement(
    'main',
    null,
    createElement(Button, { id: 'the-button' }, 'Save'),
    dialog(Dialog, 'the-dialog'),
    dialog(CopyDialog, 'the-copy-dialog'),
  ),
)
`

const INDEX =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>registry app</title><div id="root"></div><script type="module" src="/src/main.js"></script></html>'

const outcome = (
  build: SpawnSyncReturns<string>,
  built: string,
  name: string,
  urlBase: string,
): BuiltApp => {
  const destination = path.join(FIXTURES, `registry-app-${name}`)
  rmSync(destination, { force: true, recursive: true })
  mkdirSync(path.dirname(destination), { recursive: true })
  const cssFiles: string[] = []
  if (build.status === 0) {
    cpSync(built, destination, { recursive: true })
    const assets = readdirSync(path.join(destination, 'assets')).filter((file) =>
      file.endsWith('.css'),
    )
    cssFiles.push(...assets.map((file) => `${urlBase}assets/${file}`))
  }
  return {
    cssFiles,
    exitCode: build.status,
    output: `${build.stdout}${build.stderr}`,
    url: `${urlBase}index.html`,
  }
}

interface AppOptions {
  readonly dialog: RegistryItem
  readonly moduleCss: string
  readonly name: string
}

const lay = (appDir: string, { dialog, moduleCss }: AppOptions): void => {
  mkdirSync(path.join(appDir, 'src'), { recursive: true })
  symlinkInto(appDir, '@navecss/base-ui', PACKAGE_DIR)
  symlinkInto(appDir, '@navecss/tokens', TOKENS_DIR)
  for (const peer of ['react', 'react-dom', '@base-ui/react']) {
    symlinkInto(appDir, peer, packageDirectory(peer))
  }
  writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify({ name: 'registry-app', private: true, type: 'module' }),
  )
  writeFileSync(path.join(appDir, 'index.html'), INDEX)
  writeFileSync(path.join(appDir, 'src/main.js'), ENTRY)
  writeFolder(dialog, path.join(appDir, 'src/nave'), { [moduleName(dialog)]: moduleCss })
}

/**
Builds the app once, with the Dialog copy's module as given, and copies the output to the fixtures.
 */
export const buildApp = (options: AppOptions): BuiltApp => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-registry-app-'))
  try {
    const appDir = path.join(scratch, 'app')
    lay(appDir, options)
    // A consumer's shell has no NODE_ENV the test runner set for itself.
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== 'NODE_ENV'),
    )
    const urlBase = `/__fixtures__/registry-app-${options.name}/`
    const vite = path.join(packageDirectory('vite'), 'bin/vite.js')
    const build = spawnSync(process.execPath, [vite, 'build', '--base', urlBase], {
      cwd: appDir,
      encoding: 'utf8',
      env: environment,
    })
    return outcome(build, path.join(appDir, 'dist'), options.name, urlBase)
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
}

/**
The seven layer names, in Nave's order, from the first statement of the built stylesheet.
 */
export const layerNames = (): string[] => {
  const statement = postcss.parse(readStylesheet()).first
  if (statement?.type !== 'atrule' || statement.name !== 'layer') {
    throw new Error('the built stylesheet does not open with a layer order statement')
  }
  return statement.params.split(',', 50).map((name) => name.trim())
}
