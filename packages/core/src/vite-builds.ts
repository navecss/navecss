/**
 * One `navePlugin()` call can serve several builds at once (a script that calls `build()` twice
 * with one plugin list), and what a build has read must stay that build's. Each project root gets
 * a pair of plugin halves of its own, made when Vite resolves its config; the two objects the call
 * returns hand every hook to the pair of the root it runs for. A hook that names no root (a host
 * that gives none) goes to the pair of the build configured last.
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
  readonly environment?: { readonly config?: { readonly root?: string } }
}

interface Pickers {
  /**
   * The pair for the build a hook runs for.
   */
  readonly forHook: (host: Hosted) => Assembled
  /**
   * The pair for the build whose root holds the page `filename`.
   */
  readonly forPage: (filename: string | undefined) => Assembled
  /**
   * The pair of the build configured last.
   */
  readonly latest: () => Assembled
}

/**
 * The first plugin object, handing each hook to the pair for the build it runs for. A pair is
 * made when Vite resolves a config for a root it has not seen.
 */
function firstHalf(
  pickers: Pickers,
  builds: Map<string, Assembled>,
  assemble: () => Assembled,
  setLatest: (build: Assembled) => void,
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
    config() {
      const config = pickers.latest().nave.config()
      return config && { ...config, worker: { plugins: () => [workerPlugin] } }
    },
    configEnvironment: (name, options) => pickers.latest().nave.configEnvironment(name, options),
    configResolved(config: ResolvedConfigLike) {
      const build = builds.get(config.root) ?? assemble()
      builds.set(config.root, build)
      setLatest(build)
      build.nave.configResolved(config)
    },
    transform(code, id) {
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
        return pickers.forPage(page.filename).collect.transformIndexHtml.handler(html, page)
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
 * The two plugin objects of `navePlugin()`, handing each hook to the pair `assemble` made for the
 * root it runs for.
 */
export function shareAcrossBuilds(assemble: () => Assembled): NavePlugins {
  const builds = new Map<string, Assembled>()
  let latest = assemble()
  const pickers: Pickers = {
    latest: () => latest,
    forHook(host) {
      const root = host.environment?.config?.root
      return (root === undefined ? undefined : builds.get(root)) ?? latest
    },
    forPage(filename) {
      // The longest root that is a prefix of the page's path.
      const roots = builds
        .keys()
        .filter((root) => filename?.startsWith(root))
        .toArray()
        .toSorted((a, b) => b.length - a.length)
      return (roots[0] === undefined ? undefined : builds.get(roots[0])) ?? latest
    },
  }
  return [
    firstHalf(pickers, builds, assemble, (build) => {
      latest = build
    }),
    secondHalf(pickers),
  ]
}
