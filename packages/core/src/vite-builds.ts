/**
 * One `navePlugin()` call can serve several builds at once (a script that calls `build()` twice
 * with one plugin list, a dev server beside a build), and what a build has read must stay that
 * build's. Each invocation, told apart by the config object the host was handed, gets a pair of
 * plugin halves of its own for each command, made when Vite resolves its config; the two objects
 * the call returns hand every hook to the pair of the invocation it runs for. A hook that names
 * none (a host that gives none) goes to the pair configured last. A page is read by a hook that
 * names no environment, so the page goes to the pair that compiled it, found by the text it was
 * given, or, when none did, to the pairs whose root holds it.
 */
import type { NaveCollectPlugin } from './vite-collect-plugin.ts'
import type { RenderContext, ResolvedConfigLike, TransformContext } from './vite-types.ts'
import type { NaveWorkerPlugin } from './vite-worker-collect.ts'
import type { NavePlugins, NaveVitePlugin } from './vite.ts'

export interface Assembled {
  readonly nave: NaveVitePlugin
  readonly collect: NaveCollectPlugin
}

interface Hosted {
  readonly environment?: {
    readonly config?: { readonly command?: string; readonly inlineConfig?: object }
  }
}

interface Pickers {
  /**
   * The pair for the invocation a hook runs for.
   */
  readonly forHook: (host: Hosted) => Assembled
  /**
   * Notes that the invocation `host` runs for is compiling the HTML page `filename`, whose text
   * is `code`.
   */
  readonly notePage: (filename: string, host: Hosted, code: string) => void
  /**
   * The pair that is reading the HTML page `filename`, whose text is now `html`: the invocation
   * that noted it, or the pairs whose root holds it when none did.
   */
  readonly forPage: (filename: string | undefined, html: string) => Assembled[]
  /**
   * The pair of the invocation configured last.
   */
  readonly latest: () => Assembled
}

/**
 * The page a module id names, when it is an HTML file of a build. A module made from a page (its
 * inline script or style) has a query and is not the page.
 */
function htmlPageOf(id: string): string | undefined {
  return !id.includes('?') && id.toLowerCase().endsWith('.html') ? id : undefined
}

/**
 * The first plugin object, handing each hook to the pair for the build it runs for. A pair is
 * made when Vite resolves a config for a root it has not seen.
 */
function firstHalf(
  pickers: Pickers,
  configure: (config: ResolvedConfigLike) => Assembled,
): NaveVitePlugin {
  // A module worker is built apart from the build that holds it, so the reader it runs finds the
  // pair of the root it reads for.
  const workerPlugin: NaveWorkerPlugin = {
    name: 'nave:collect-worker',
    enforce: 'post',
    transform(this: TransformContext, code, id, meta) {
      const [plugin] = pickers.forHook(this).nave.config()?.worker.plugins() ?? []
      return plugin?.transform.call(this, code, id, meta) ?? Promise.resolve(undefined)
    },
    buildEnd(this: RenderContext, error) {
      const [plugin] = pickers.forHook(this).nave.config()?.worker.plugins() ?? []
      return plugin?.buildEnd.call(this, error) ?? Promise.resolve()
    },
  }
  return {
    name: 'nave',
    config(userConfig, env) {
      const config = pickers.latest().nave.config(userConfig, env)
      return config && { ...config, worker: { plugins: () => [workerPlugin] } }
    },
    configEnvironment: (name, options) => pickers.latest().nave.configEnvironment(name, options),
    configResolved(config: ResolvedConfigLike) {
      configure(config).nave.configResolved(config)
    },
    configureServer(server) {
      pickers.latest().nave.configureServer(server)
    },
    closeBundle() {
      pickers.latest().nave.closeBundle()
    },
    buildApp: {
      order: 'post',
      handler(builder) {
        return pickers.latest().nave.buildApp.handler.call(this, builder)
      },
    },
    transform(code, id) {
      const page = htmlPageOf(id)
      if (page !== undefined) pickers.notePage(page, this, code)
      return pickers.forHook(this).nave.transform.call(this, code, id)
    },
    hotUpdate(options) {
      return pickers.forHook(this).nave.hotUpdate.call(this, options)
    },
    renderChunk(code, chunk) {
      return pickers.forHook(this).nave.renderChunk.call(this, code, chunk)
    },
    generateBundle: {
      order: 'post',
      handler(options, bundle) {
        pickers.forHook(this).nave.generateBundle.handler.call(this, options, bundle)
      },
    },
  }
}

/**
 * The second plugin object, handing each hook to the pair for the build it runs for.
 */
function secondHalf(pickers: Pickers): NaveCollectPlugin {
  return {
    name: 'nave:collect',
    enforce: 'post',
    transform(code, id, meta) {
      return pickers.forHook(this).collect.transform.call(this, code, id, meta)
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, page) {
        for (const build of pickers.forPage(page.filename, html)) {
          build.collect.transformIndexHtml.handler(html, page)
        }
        return
      },
    },
    buildStart() {
      return pickers.forHook(this).collect.buildStart.call(this)
    },
    buildEnd(error) {
      return pickers.forHook(this).collect.buildEnd.call(this, error)
    },
  }
}

/**
 * Whether `file` lies inside the directory `root`, by whole path components: `/repo/app2/a.html`
 * is not inside `/repo/app`.
 */
function isInside(root: string, file: string): boolean {
  const base = root.endsWith('/') ? root : `${root}/`
  return file.startsWith(base)
}

/**
 * The pairs `navePlugin()` has made, by the invocation (and command) they were made for.
 */
function registry(assemble: () => Assembled): {
  readonly configure: (config: ResolvedConfigLike) => Assembled
  readonly pickers: Pickers
} {
  const byInvocation = new WeakMap<object, Map<string, Assembled>>()
  const roots = new Map<Assembled, string>()
  // The pairs compiling each page, oldest first, with the text each was given.
  const pages = new Map<string, Map<Assembled, string>>()
  let latest = assemble()
  const find = (host: Hosted): Assembled | undefined => {
    const config = host.environment?.config
    if (config?.inlineConfig === undefined) return undefined
    return byInvocation.get(config.inlineConfig)?.get(config.command ?? 'build')
  }
  const pickers: Pickers = {
    latest: () => latest,
    forHook: (host) => find(host) ?? latest,
    notePage(filename, host, code) {
      const compiling = pages.get(filename) ?? new Map<Assembled, string>()
      const build = find(host) ?? latest
      // A build that compiles the page again starts at the back of the line.
      compiling.delete(build)
      pages.set(filename, compiling.set(build, code))
    },
    forPage(filename, html) {
      if (filename === undefined) return [latest]
      const compiling = pages.get(filename)
      if (compiling && compiling.size > 0) {
        // Each compile is read once: the one whose text is this page's, else the oldest.
        const owner =
          [...compiling].find(([, code]) => code === html)?.[0] ?? compiling.keys().next().value!
        compiling.delete(owner)
        return [owner]
      }
      const holding = [...roots].filter(([, root]) => isInside(root, filename)).map(([b]) => b)
      return holding.length > 0 ? holding : [latest]
    },
  }
  const configure = (config: ResolvedConfigLike): Assembled => {
    const key = config.inlineConfig ?? config
    const commands = byInvocation.get(key) ?? new Map<string, Assembled>()
    byInvocation.set(key, commands)
    const build = commands.get(config.command) ?? assemble()
    commands.set(config.command, build)
    roots.set(build, config.root)
    latest = build
    return build
  }
  return { pickers, configure }
}

/**
 * The two plugin objects of `navePlugin()`, handing each hook to the pair `assemble` made for the
 * invocation it runs for.
 */
export function shareAcrossBuilds(assemble: () => Assembled): NavePlugins {
  const { pickers, configure } = registry(assemble)
  return [firstHalf(pickers, configure), secondHalf(pickers)]
}
