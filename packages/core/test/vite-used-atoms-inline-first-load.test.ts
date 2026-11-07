/**
 * A page whose HTML holds the stylesheet inline gets it from the same response that starts its
 * script, and Vite starts the script's transform without waiting for it. Whichever of the two
 * finishes first, the stylesheet must not be sent to the page twice: a reload on a first load is a
 * page that flashes and runs its scripts again, and a test that loads a page and then marks it
 * sees the mark disappear. The server holds the inline stylesheet, as it holds an imported one,
 * until the modules the page loads have been read. That wait has three steps: what Vite has started
 * for the page's scripts, the client's wait for the requests in flight, and a walk of the modules
 * reachable from the graph's roots. A script is in none of the last two while Vite resolves its
 * path, and in the graph only from the end of its load, so each step has a row that only it can
 * pass, with the steps before it stood in by ones that return at once.
 */
import { describe, expect, it, vi } from 'vitest'

import { devServing } from '../src/vite-dev.ts'
import { navePlugin } from '../src/vite.ts'
import { APP_CSS, appFiles, makeUsedApp } from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { stopDev, VITE_APIS, type ViteApi } from './helpers/vite-app.ts'
import { devConfig, listenDev } from './helpers/vite-browser.ts'

const INLINE_PAGE = `<!doctype html><html><head><style>${APP_CSS}</style></head><body><p class="nave-hidden">h</p><script type="module" src="/src/main.ts"></script></body></html>`

/**
 * Where the script is held: while Vite resolves its path, while it is read from disk (in flight,
 * not in the module graph yet), or once the graph has it.
 */
type HeldAt = 'load' | 'resolve' | 'transform'

interface Page {
  readonly heldAt: HeldAt
  /**
   * The steps of the wait stood in by ones that return at once, as they do when the work they wait
   * for has ended: the one for what Vite has started, and the client's for the requests in flight.
   */
  readonly standIn: readonly ('idle' | 'started')[]
  /**
   * Whether the script is requested, and let reach the hold, before the page is: the order in which
   * a step that stands in for the one before it can be shown to wait, since that step is what
   * would otherwise decide whether the script is known by the time the stylesheet is held.
   */
  readonly isRequestedFirst: boolean
}

/**
 * Two scratch plugins that put the script behind the stylesheet. The first holds `src/main.ts`
 * until the stylesheet of the page has been served, or until `ms` have passed, which is how long a
 * server that makes the stylesheet wait for the script gets to do so. The second, last in the
 * chain, is where the stylesheet is seen to have been served.
 */
function scriptAfterStylesheet(
  heldAt: HeldAt,
  ms: number,
): { readonly entered: Promise<void>; readonly first: object; readonly last: object } {
  const { promise: released, resolve: release } = Promise.withResolvers<void>()
  const { promise: entered, resolve: enter } = Promise.withResolvers<void>()
  // The wait for the stylesheet starts when the script is held, not when the server starts.
  let timer: NodeJS.Timeout | undefined
  const holdAt = (hook: HeldAt, file: string): Promise<void> | undefined => {
    if (hook !== heldAt || !file.endsWith('src/main.ts')) return undefined
    enter()
    timer ??= setTimeout(release, ms)
    return released
  }
  return {
    entered,
    first: {
      name: 'test:script-after-stylesheet',
      enforce: 'pre',
      resolveId: (source: string) => holdAt('resolve', source),
      load: (id: string) => holdAt('load', id),
      transform: (_code: string, id: string) => holdAt('transform', id),
    },
    last: {
      name: 'test:stylesheet-served',
      enforce: 'post',
      transform(_code: string, id: string) {
        if (!id.includes('html-proxy')) return
        clearTimeout(timer)
        release()
      },
    },
  }
}

/**
 * The reloads of the page sent while a browser's requests for it are served: the page, then its
 * script. `keep` holds `grid` only, so `flex`, read from the script, is outside what the
 * stylesheet was first served with unless the stylesheet waited for the script.
 */
async function reloadsOf(page: Page, api: ViteApi): Promise<string[]> {
  const { heldAt, isRequestedFirst, standIn } = page
  const app = makeUsedApp(
    appFiles({
      'index.html': INLINE_PAGE,
      'src/main.ts': `${IMPORT}console.log(cx('flex'))\n`,
    }),
  )
  const { entered, first, last } = scriptAfterStylesheet(heldAt, 1500)
  const { server, url } = await listenDev(
    devConfig(app.root, [first, navePlugin({ keep: ['grid'] }), last] as never),
    api,
  )
  const saved = { ...devServing }
  try {
    if (standIn.includes('idle'))
      server.environments.client.waitForRequestsIdle = () => Promise.resolve()
    if (standIn.includes('started')) devServing.startedRequests = () => Promise.resolve()
    const send = vi.spyOn(server.environments.client.hot, 'send')
    if (isRequestedFirst) {
      const requested = server.environments.client.transformRequest('/src/main.ts')
      // A request that fails before the hold ends the wait with its error; one that is held
      // settles only once the stylesheet is served, so this never ends it early.
      await Promise.race([entered, requested])
    }

    await fetch(url)
    await fetch(`${url}src/main.ts`)
    // The reload, if one is owed, goes out on the next turn of the event loop.
    await new Promise((resolve) => setTimeout(resolve, 200))
    return send.mock.calls
      .filter(([payload]) => JSON.stringify(payload).includes('"type":"full-reload"'))
      .map(() => 'full-reload')
  } finally {
    Object.assign(devServing, saved)
    await stopDev(server)
    app.dispose()
  }
}

describe.each(Object.entries(VITE_APIS))(
  'Vite %s: a page with an inline stylesheet is not reloaded by its first load',
  (_version, api) => {
    it('sends no reload when the script is read after the stylesheet is served', async () => {
      expect(
        await reloadsOf({ heldAt: 'transform', isRequestedFirst: false, standIn: [] }, api),
      ).toEqual([])
    }, 60_000)

    it('sends no reload when only the walk of the graph can wait for the script', async () => {
      expect(
        await reloadsOf(
          { heldAt: 'transform', isRequestedFirst: true, standIn: ['idle', 'started'] },
          api,
        ),
      ).toEqual([])
    }, 60_000)

    it('sends no reload when the script is in flight and not in the module graph yet', async () => {
      expect(
        await reloadsOf({ heldAt: 'load', isRequestedFirst: true, standIn: ['started'] }, api),
      ).toEqual([])
    }, 60_000)

    it('sends no reload when Vite is still resolving the path of the script', async () => {
      expect(
        await reloadsOf({ heldAt: 'resolve', isRequestedFirst: false, standIn: [] }, api),
      ).toEqual([])
    }, 60_000)
  },
)
