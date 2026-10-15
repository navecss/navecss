/**
 * A plain Vite project built by the `vite build` command from a config file, with the client and a
 * server render in the order a row names: the project the builder rows of the Astro criteria
 * compare Astro with. The plugin is the built package, as a project that installs it gets it.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { ScratchApp } from './vite-app.ts'

import { APP_CSS, appFiles, makeUsedApp } from './used-atoms-app.ts'

export interface PlainViteSettings {
  /**
   * The environments in the order the builder builds them.
   */
  readonly order: readonly ('client' | 'ssr')[]
  /**
   * `build.emitAssets` of the server environment.
   */
  readonly emitAssets?: boolean
  /**
   * `build.ssrEmitAssets`, the older spelling.
   */
  readonly ssrEmitAssets?: boolean
  /**
   * Whether the config names a builder. Without one the client and the server render are built
   * by separate commands.
   */
  readonly hasBuilder?: boolean
  /**
   * The argument of `navePlugin(...)`, as text.
   */
  readonly options?: string
  /**
   * Replaces files of the project.
   */
  readonly files?: Readonly<Record<string, string>>
  /**
   * Packages to write into `node_modules`, by name.
   */
  readonly packages?: Readonly<Record<string, Readonly<Record<string, string>>>>
}

const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * The config file text.
 */
function configText(settings: PlainViteSettings): string {
  const emit = settings.emitAssets === undefined ? '' : `emitAssets: ${settings.emitAssets}, `
  const builder =
    settings.hasBuilder === false
      ? ''
      : `
  environments: {
    ssr: {
      build: { outDir: 'dist-ssr', ${emit}rolldownOptions: { input: 'src/entry-server.tsx' } },
    },
  },
  builder: {
    async buildApp(builder) {
      for (const name of ${JSON.stringify(settings.order)}) await builder.build(builder.environments[name])
    },
  },`
  return `import { navePlugin } from '@navecss/core/vite'

export default {
  plugins: [navePlugin(${settings.options ?? ''})],
  build: {
    cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'],
    cssMinify: false,${settings.ssrEmitAssets ? '\n    ssrEmitAssets: true,' : ''}
  },${builder}
}
`
}

/**
 * Makes the project: the client calls `flex`, the server render calls `grid` and imports the
 * stylesheet.
 */
export function plainViteApp(settings: PlainViteSettings): ScratchApp {
  const app = makeUsedApp({
    ...appFiles(
      {
        'src/main.tsx': `${IMPORT}console.log(cx('flex'))\n`,
        'src/entry-server.tsx': `import './app.css'\n${IMPORT}export const s = cx('grid')\n`,
        'src/app.css': APP_CSS,
      },
      ['src/main.tsx'],
    ),
    'vite.config.mjs': configText(settings),
    ...settings.files,
  })
  return app
}

export interface CliResult {
  readonly code: number | null
  readonly output: string
}

/**
 * Runs `vite build` in the project, with `args` after it.
 */
export function runViteBuild(app: ScratchApp, args: readonly string[] = []): Promise<CliResult> {
  const bin = path.join(
    path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
    'bin',
    'vite.js',
  )
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, 'build', ...args], {
      cwd: app.root,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (code) => {
      resolve({ code, output })
    })
  })
}

/**
 * The CSS files under `directory/assets`, by file name.
 */
export function cssFiles(directory: string): Record<string, string> {
  const assets = path.join(directory, 'assets')
  if (!existsSync(assets)) return {}
  return Object.fromEntries(
    readdirSync(assets)
      .filter((name) => name.endsWith('.css'))
      .map((name) => [name, readFileSync(path.join(assets, name), 'utf8')]),
  )
}
