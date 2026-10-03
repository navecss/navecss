/**
 * Fixture apps for the used-atoms criteria: a scratch Vite app whose `node_modules/@navecss/core`
 * is the package under test (so `@navecss/core/cx` and the Quick start's two CSS imports resolve
 * as they do for a consumer), built under either CSS transformer, with the atoms the built
 * stylesheet's atomic layer names read back by a parser of the test's own.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, type PluginOption } from 'vite'

import type { NaveViteOptions } from '../../src/vite.ts'
import { atomClassMap } from '../../src/atoms.ts'
import { navePlugin } from '../../src/vite.ts'
import {
  appConfig,
  buildOutputs,
  makeApp,
  type ScratchApp,
  type Transformer,
  VITE_APIS,
  type ViteApi,
} from './vite-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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
 * Makes the app and links `node_modules/@navecss/core` to the package under test.
 */
export function makeUsedApp(files: Readonly<Record<string, string>>): ScratchApp {
  // A manifest of its own, so the package's `sideEffects` list (CSS only) does not govern the
  // fixture's modules and let the bundler drop an import that is there for its effect.
  const app = makeApp({ 'package.json': '{"private":true,"type":"module"}', ...files })
  const modules = path.join(app.root, 'node_modules', '@navecss')
  mkdirSync(modules, { recursive: true })
  symlinkSync(CORE_ROOT, path.join(modules, 'core'), 'dir')
  return app
}

/**
 * Writes a dependency package into the app's `node_modules`.
 */
export function addPackage(
  app: ScratchApp,
  name: string,
  files: Readonly<Record<string, string>>,
  dependsOnCore = true,
): void {
  const directory = path.join(app.root, 'node_modules', name)
  const manifest = {
    name,
    version: '1.0.0',
    type: 'module',
    main: './index.js',
    ...(dependsOnCore && { dependencies: { '@navecss/core': '*' } }),
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
 * Builds `app` with `navePlugin(options)`, resolving to what it wrote or the error it failed with.
 */
export async function buildUsed(app: ScratchApp, settings: BuildOptions = {}): Promise<Built> {
  const { options, transformer = 'postcss', api = VITE_APIS['8.2.1']! } = settings
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
      settings.build ? ({ build: settings.build } as never) : {},
    ),
    customLogger: logger,
    ...settings.config,
  }
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
  const stack = body.search(/\n\s+at /)
  return (stack === -1 ? body : body.slice(0, stack)).trimEnd()
}

/**
 * The text of every `@layer atomic { ... }` block in `css`, found by counting braces.
 */
function atomicBlocks(css: string): string[] {
  const blocks: string[] = []
  const opener = /@layer\s+atomic\s*\{/g
  for (let match = opener.exec(css); match; match = opener.exec(css)) {
    let depth = 1
    let index = match.index + match[0].length
    const start = index
    while (depth > 0 && index < css.length) {
      depth += css[index] === '{' ? 1 : css[index] === '}' ? -1 : 0
      index += 1
    }
    blocks.push(css.slice(start, index - 1))
    opener.lastIndex = index
  }
  return blocks
}

const ATOM_OF_CLASS = new Map(Object.entries(atomClassMap).map(([atom, name]) => [name, atom]))

/**
 * The atoms whose class a rule selector in the atomic layer of `css` names, sorted.
 */
export function atomLayerAtoms(css: string): string[] {
  const names = new Set<string>()
  for (const block of atomicBlocks(css)) {
    for (const match of block.matchAll(/\.(nave-[\w-]+)/g)) {
      const atom = ATOM_OF_CLASS.get(match[1]!)
      if (atom) names.add(atom)
    }
  }
  return [...names].toSorted()
}

/**
 * Sorted, for an `expect(...).toEqual([...])` over a list of atoms.
 */
export function atoms(...names: string[]): string[] {
  return names.toSorted()
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
    readonly builder?: boolean
  } = {},
): Promise<BuiltEnvironments> {
  const {
    options,
    transformer = 'postcss',
    api = VITE_APIS['8.2.1']!,
    order = ['client', 'ssr'],
  } = settings
  const warnings: string[] = []
  const logger = createLogger('silent')
  logger.warn = (message) => {
    warnings.push(message)
  }
  const config = {
    ...appConfig(
      app.root,
      transformer,
      [...(settings.plugins ?? []), settings.nave ?? navePlugin(options)],
      settings.build ? ({ build: settings.build } as never) : {},
    ),
    customLogger: logger,
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
        environments: Record<string, unknown>
        build(environment: unknown): Promise<unknown>
      }) => {
        for (const name of order)
          await collected(name, await builder.build(builder.environments[name]))
      },
    },
    ...settings.config,
  }
  const results: Partial<Record<'client' | 'ssr', Built>> = {}
  const collected = async (name: 'client' | 'ssr', result: unknown): Promise<void> => {
    results[name] = outputsOf(result)
  }
  const empty: Built = { css: '', js: '', assets: {}, error: undefined }
  try {
    const builder = await (
      api as unknown as { createBuilder(config: unknown): Promise<{ buildApp(): Promise<void> }> }
    ).createBuilder(config)
    await builder.buildApp()
    return {
      client: results.client ?? empty,
      ssr: results.ssr ?? empty,
      error: undefined,
      warnings,
    }
  } catch (error) {
    return {
      client: results.client ?? empty,
      ssr: results.ssr ?? empty,
      error: reportOf(error),
      warnings,
    }
  }
}

/**
 * The CSS, JavaScript and assets of one environment's build result.
 */
function outputsOf(result: unknown): Built {
  const outputs = (Array.isArray(result) ? result : [result]) as {
    output: { type: string; fileName: string; source?: string | Uint8Array; code?: string }[]
  }[]
  const decoder = new TextDecoder()
  const assets: Record<string, string> = {}
  let js = ''
  for (const { output } of outputs) {
    for (const entry of output) {
      if (entry.type === 'chunk') js += `${entry.code}\n`
      else if (entry.source !== undefined) {
        assets[entry.fileName] =
          typeof entry.source === 'string' ? entry.source : decoder.decode(entry.source)
      }
    }
  }
  const css = Object.entries(assets)
    .filter(([name]) => name.endsWith('.css'))
    .map(([, text]) => text)
    .join('\n')
  return { css, js, assets, error: undefined }
}

/**
 * A scratch plugin that rewrites the text of every CSS asset in `generateBundle`, ahead of Nave's
 * own check (which is ordered after every other plugin).
 */
export function tamperCss(rewrite: (css: string) => string): PluginOption {
  return {
    name: 'tamper-css',
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (entry.type === 'asset' && entry.fileName.endsWith('.css')) {
          entry.source = rewrite(
            typeof entry.source === 'string'
              ? entry.source
              : new TextDecoder().decode(entry.source),
          )
        }
      }
    },
  }
}
