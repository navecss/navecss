/**
 * Fixture apps for the used-atoms criteria: a scratch Vite app whose `node_modules/@navecss/core`
 * is the package under test (so `@navecss/core/cx` and the Quick start's two CSS imports resolve
 * as they do for a consumer), built under either CSS transformer, with the atoms the built
 * stylesheet's atomic layer names read back by a parser of the test's own.
 */
import { cpSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, type InlineConfig, type PluginOption } from 'vite'

import type { NaveViteOptions } from '../../src/vite.ts'

import { navePlugin } from '../../src/vite.ts'
import {
  appConfig,
  buildOutputs,
  makeApp,
  outputsOf,
  type ScratchApp,
  type Transformer,
  VITE_APIS,
  type ViteApi,
} from './vite-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const TOKENS_ROOT = path.resolve(CORE_ROOT, '..', 'tokens')

/**
 * The Quick start's stylesheet: the two imports every Vite reader writes.
 */
export const APP_CSS = "@import url('@navecss/core/layers');\n@import url('@navecss/core');\n"

/**
 * The files of a minimal app: `index.html` loading `src/main.ts`, which imports `app.css` and
 * the given modules. A module is classic-JSX capable, so a `.tsx` fixture reaches the same
 * post-order shapes a React app does without a React dependency.
 */
export function appFiles(
  modules: Readonly<Record<string, string>>,
  imports: readonly string[] = Object.keys(modules).filter((name) =>
    /\.(?:[jt]sx?|vue|svelte)$/.test(name),
  ),
): Record<string, string> {
  const importLines = imports.map((name) => `import './${name.replace(/^src\//, '')}'`)
  return {
    'index.html':
      '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
    'src/app.css': APP_CSS,
    'src/main.ts': ["import './app.css'", ...importLines, ''].join('\n'),
    ...modules,
  }
}

/**
 * Puts the package under test into the app's `node_modules/@navecss`. By default `core` is a
 * link, which Vite bundles into a server build whatever the config says. `'copy'` installs it the
 * way a registry install does, a real directory holding the package's manifest and `dist` (and
 * the tokens package it depends on), so a server build bundles it only when the plugin asks.
 */
function installCore(root: string, install: 'copy' | 'link'): void {
  const modules = path.join(root, 'node_modules', '@navecss')
  mkdirSync(modules, { recursive: true })
  if (install === 'link') {
    symlinkSync(CORE_ROOT, path.join(modules, 'core'), 'dir')
    return
  }
  for (const [name, source] of [
    ['core', CORE_ROOT],
    ['tokens', TOKENS_ROOT],
  ] as const) {
    const target = path.join(modules, name)
    mkdirSync(target, { recursive: true })
    cpSync(path.join(source, 'package.json'), path.join(target, 'package.json'))
    cpSync(path.join(source, 'dist'), path.join(target, 'dist'), { recursive: true })
  }
}

/**
 * Makes the app and installs `node_modules/@navecss/core` as the package under test.
 */
export function makeUsedApp(
  files: Readonly<Record<string, string>>,
  install: 'copy' | 'link' = 'link',
): ScratchApp {
  // A manifest of its own, so the package's `sideEffects` list (CSS only) does not govern the
  // fixture's modules and let the bundler drop an import that is there for its effect.
  const app = makeApp({ 'package.json': '{"private":true,"type":"module"}', ...files })
  installCore(app.root, install)
  return app
}

/**
 * Writes a dependency package into the app's `node_modules`.
 */
export function addPackage(
  app: ScratchApp,
  name: string,
  files: Readonly<Record<string, string>>,
  requiresCore = true,
): void {
  const directory = path.join(app.root, 'node_modules', name)
  const manifest = {
    name,
    version: '1.0.0',
    type: 'module',
    main: './index.js',
    ...(requiresCore && { dependencies: { '@navecss/core': '*' } }),
  }
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    writeFileSync(path.join(directory, file), text)
  }
}

export interface Built {
  readonly css: string
  readonly js: string
  readonly assets: Record<string, string>
  /**
   * The message of the error the build failed with, if it did.
   */
  readonly error: string | undefined
  /**
   * The warnings Vite's logger printed during the build.
   */
  readonly warnings?: readonly string[]
}

export interface BuildOptions {
  readonly options?: NaveViteOptions
  readonly transformer?: Transformer
  readonly api?: ViteApi
  readonly plugins?: PluginOption[]
  readonly build?: Record<string, unknown>
  /**
   * Extra top-level config merged over the fixture's own (`oxc`, `builder`, `define`).
   */
  readonly config?: Record<string, unknown>
  /**
   * Stands in for `navePlugin(options)`, for a scratch copy of the plugin.
   */
  readonly nave?: PluginOption
  /**
   * Plugins placed after Nave's.
   */
  readonly after?: PluginOption[]
}

/**
 * The config both builders start from, and the warnings its logger collects as a build prints them.
 */
function usedConfig(
  app: ScratchApp,
  settings: BuildOptions,
): { config: InlineConfig; warnings: string[] } {
  const { options, transformer = 'postcss' } = settings
  const warnings: string[] = []
  const logger = createLogger('silent')
  logger.warn = (message) => {
    warnings.push(message)
  }
  const config = {
    ...appConfig(
      app.root,
      transformer,
      [
        ...(settings.plugins ?? []),
        settings.nave ?? navePlugin(options),
        ...(settings.after ?? []),
      ],
      settings.build ? { build: settings.build } : {},
    ),
    customLogger: logger,
  }
  return { config, warnings }
}

/**
 * Builds `app` with `navePlugin(options)`, resolving to what it wrote or the error it failed with.
 */
export async function buildUsed(app: ScratchApp, settings: BuildOptions = {}): Promise<Built> {
  const { api = VITE_APIS['8.2.1']! } = settings
  const { config: shared, warnings } = usedConfig(app, settings)
  const config = { ...shared, ...settings.config }
  try {
    return { ...(await buildOutputs(config, api)), error: undefined, warnings }
  } catch (error) {
    return { css: '', js: '', assets: {}, error: reportOf(error), warnings }
  }
}

/**
 * What the plugin said: the message of the error Rolldown wraps, without its stack and its
 * `[plugin ...]` header.
 */
function reportOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const marker = message.indexOf('RolldownError: ')
  const body = marker === -1 ? message : message.slice(marker + 'RolldownError: '.length)
  const stack = body.search(/\n[ \t]+at /)
  return (stack === -1 ? body : body.slice(0, stack)).trimEnd()
}

export interface BuiltEnvironments {
  readonly client: Built
  readonly ssr: Built
  /**
   * The message of the error the builder failed with, if it did.
   */
  readonly error: string | undefined
  /**
   * The warnings Vite's logger printed during the builds.
   */
  readonly warnings: readonly string[]
}

/**
 * Builds the client and a server render in one process through Vite's builder, in `order`.
 * The server entry is `src/entry-server.ts`.
 */
export async function buildEnvironments(
  app: ScratchApp,
  settings: BuildOptions & {
    readonly order?: readonly ('client' | 'ssr')[]
  } = {},
): Promise<BuiltEnvironments> {
  const { api = VITE_APIS['8.2.1']!, order = ['client', 'ssr'] } = settings
  const { config: shared, warnings } = usedConfig(app, settings)
  const results: Partial<Record<'client' | 'ssr', Built>> = {}
  const collect = (name: 'client' | 'ssr', result: unknown): void => {
    results[name] = { ...outputsOf(result), error: undefined }
  }
  const config = {
    ...shared,
    environments: {
      ssr: {
        build: {
          outDir: 'dist-ssr',
          write: false,
          rolldownOptions: { input: 'src/entry-server.ts' },
        },
      },
    },
    builder: {
      buildApp: async (builder: {
        build(environment: unknown): Promise<unknown>
        environments: Record<string, unknown>
      }) => {
        for (const name of order) collect(name, await builder.build(builder.environments[name]))
      },
    },
    ...settings.config,
  }
  const empty: Built = { css: '', js: '', assets: {}, error: undefined }
  const settled = (error: string | undefined): BuiltEnvironments => ({
    client: results.client ?? empty,
    ssr: results.ssr ?? empty,
    error,
    warnings,
  })
  try {
    const builder = await (
      api as unknown as { createBuilder(config: unknown): Promise<{ buildApp(): Promise<void> }> }
    ).createBuilder(config)
    await builder.buildApp()
    return settled(undefined)
  } catch (error) {
    return settled(reportOf(error))
  }
}

export { atomLayerAtoms, atoms, tamperCss } from './used-atoms-css.ts'
