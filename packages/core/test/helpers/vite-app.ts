/**
 * A scratch Vite app for the Vite plugin's fixtures: a directory of source files written under
 * `packages/core` (so `vue`, `svelte`, `sass` and `@navecss/tokens` resolve through the
 * workspace's own `node_modules`), built with `vite build` and served by the dev server, with the
 * CSS each module produced read back out.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  build as buildOnNewest,
  createBuilder as createBuilderOnNewest,
  createServer as createServerOnNewest,
  type InlineConfig,
  version as newestVersion,
  type PluginOption,
  type ViteDevServer,
} from 'vite'
import * as viteFloor from 'vite-floor'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export type Transformer = 'lightningcss' | 'postcss'

/**
 * A Vite to run a fixture on. The supported range is measured, not declared: the fixtures run on
 * the floor (8.2.1, an alias dependency, `vite-floor`, which Dependabot's version updates skip)
 * and on the newest 8.x at the time of the release (the package's own `vite`, which Dependabot
 * raises). A helper called with no `api` runs on the floor. Types come from the newest Vite and the
 * floor leg is cast to them, so the floor is checked by running the fixtures on it, not by typing
 * them. The Vue and Svelte plugins resolve `vite` by name, so on the floor leg they run linked to
 * the newest Vite: the floor host is 8.2.1, its framework plugins are not.
 */
export interface ViteApi {
  readonly build: typeof buildOnNewest
  readonly createBuilder: typeof createBuilderOnNewest
  readonly createServer: typeof createServerOnNewest
  readonly version: string
}

export const VITE_APIS: Readonly<Record<string, ViteApi>> = {
  '8.2.1': viteFloor as unknown as ViteApi,
  'newest 8.x': {
    build: buildOnNewest,
    createBuilder: createBuilderOnNewest,
    createServer: createServerOnNewest,
    version: newestVersion,
  },
}

/**
 * Browser floor, in the two spellings Vite needs under Lightning CSS (the documented fence).
 */
const FLOOR_TARGETS = ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18']
const FLOOR_LIGHTNING = {
  chrome: 125 << 16,
  edge: 125 << 16,
  firefox: 128 << 16,
  ios_saf: 18 << 16,
  safari: 18 << 16,
}

export interface ScratchApp {
  readonly root: string
  dispose(): void
}

/**
 * Writes `files` (relative path to text) into a fresh directory under `packages/core`.
 */
export function makeApp(files: Readonly<Record<string, string>>): ScratchApp {
  const root = mkdtempSync(path.join(CORE_ROOT, '.nave-vite-app-'))
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return {
    root,
    dispose: () => rmSync(root, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 }),
  }
}

/**
 * The config every fixture shares: no config file, the documented floor under both transformers.
 */
export function appConfig(
  root: string,
  transformer: Transformer,
  plugins: PluginOption[],
  extra: InlineConfig = {},
): InlineConfig {
  return {
    root,
    // Each app keeps its own dependency cache: dev servers started side by side would otherwise
    // share one directory and race to rewrite it.
    cacheDir: path.join(root, '.vite'),
    configFile: false,
    logLevel: 'silent',
    plugins,
    build: { cssTarget: FLOOR_TARGETS, write: false, ...extra.build },
    css: {
      transformer,
      ...(transformer === 'lightningcss' && { lightningcss: { targets: FLOOR_LIGHTNING } }),
      ...extra.css,
    },
    ...(extra.server && { server: extra.server }),
  }
}

interface OutputLike {
  readonly type: string
  readonly fileName: string
  readonly source?: string | Uint8Array
  readonly code?: string
}

/**
 * Everything a `vite build` wrote: each CSS asset's text, and each JavaScript chunk's code (an
 * `?inline` stylesheet lives in one).
 */
export async function buildOutputs(
  config: InlineConfig,
  api: ViteApi = VITE_APIS['8.2.1']!,
): Promise<{
  assets: Record<string, string>
  css: string
  js: string
}> {
  return outputsOf(await api.build(config))
}

/**
 * The CSS, the JavaScript and the assets of a build result (one output or several).
 */
export function outputsOf(result: unknown): {
  assets: Record<string, string>
  css: string
  js: string
} {
  const outputs = (Array.isArray(result) ? result : [result]) as unknown as {
    output: OutputLike[]
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
  return { css, js, assets }
}

const IMPORT_SPECIFIER = /(?:import|from)\s*["'](\/[^"']+)["']/g
const CSS_STRING = /const __vite__css = ("(?:[^"\\]|\\.)*")/
const DEFAULT_STRING = /export default ("(?:[^"\\]|\\.)*")/

/**
 * The CSS a module carries: the stylesheet string Vite's dev client injects, the string an
 * `?inline` import exports, or (for a `?direct` request, which a `<link>` makes) the stylesheet
 * itself.
 */
function cssOfModule(url: string, code: string): string | undefined {
  if (url.includes('?direct')) return code
  const injected = CSS_STRING.exec(code)
  if (injected) return JSON.parse(injected[1]!) as string
  if (!url.includes('?inline')) return undefined
  const inline = DEFAULT_STRING.exec(code)
  return inline ? (JSON.parse(inline[1]!) as string) : undefined
}

/**
 * Serves the app and requests every module reachable from `entry` the way a browser would,
 * returning the CSS each stylesheet module was served with, keyed by its URL.
 */
export async function devCss(
  server: ViteDevServer,
  entry: string,
  extraUrls: readonly string[] = [],
): Promise<Record<string, string>> {
  const seen = new Set<string>()
  const queue = [entry, ...extraUrls]
  const served: Record<string, string> = {}
  while (queue.length > 0) {
    const url = queue.pop()!
    if (seen.has(url)) continue
    seen.add(url)
    const result = await server.transformRequest(url)
    if (!result) continue
    const css = cssOfModule(url, result.code)
    if (css !== undefined) served[url] = css
    for (const match of result.code.matchAll(IMPORT_SPECIFIER)) {
      // `/@id/` and `/@vite/` name virtual modules and Vite's own client, never a stylesheet.
      if (!match[1]!.startsWith('/@')) queue.push(match[1]!)
    }
  }
  return served
}

/**
 * Starts a Vite dev server in middleware mode on `config` through the given Vite API, so a test
 * can request modules from it without binding a port.
 */
export async function startDev(
  config: InlineConfig,
  api: ViteApi = VITE_APIS['8.2.1']!,
): Promise<ViteDevServer> {
  return api.createServer({
    ...config,
    appType: 'custom',
    server: { middlewareMode: true, ...config.server },
  })
}

/**
 * The declarations of the first rule whose selector holds `name`, whitespace collapsed; `undefined`
 * when no rule does.
 */
export function ruleBodyFor(css: string, name: string): string | undefined {
  const match = new RegExp(String.raw`${name}[^{}]*\{([^}]*)\}`).exec(css)
  return match?.[1]?.replaceAll(/\s+/g, ' ').trim()
}

/**
 * Closes a dev server, giving up after `ms` on one whose dependency optimizer is still crawling.
 */
export async function stopDev(server: ViteDevServer, ms = 5000): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const giveUp = new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  try {
    await Promise.race([server.close(), giveUp])
  } finally {
    clearTimeout(timer)
  }
}
