/**
 * A page whose HTML holds the stylesheet inline gets it from the same response that starts its
 * script, and Vite starts the script's transform without waiting for it. Whichever of the two
 * finishes first, the stylesheet must not be sent to the page twice: a reload on a first load is a
 * page that flashes and runs its scripts again, and a test that loads a page and then marks it
 * sees the mark disappear. The server holds the inline stylesheet, as it holds an imported one,
 * until the modules the page loads have been read.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { APP_CSS, appFiles, makeUsedApp } from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { stopDev, VITE_APIS, type ViteApi } from './helpers/vite-app.ts'
import { devConfig, listenDev } from './helpers/vite-browser.ts'

const INLINE_PAGE = `<!doctype html><html><head><style>${APP_CSS}</style></head><body><p class="nave-hidden">h</p><script type="module" src="/src/main.ts"></script></body></html>`

/**
 * Two scratch plugins that put the script behind the stylesheet. The first holds the transform of
 * `src/main.ts` until the stylesheet of the page has been served, or until `ms` have passed, which
 * is how long a server that makes the stylesheet wait for the script gets to do so. The second,
 * last in the chain, is where the stylesheet is seen to have been served.
 */
function scriptAfterStylesheet(ms: number): { readonly first: object; readonly last: object } {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const timer = setTimeout(release, ms)
  return {
    first: {
      name: 'test:script-after-stylesheet',
      enforce: 'pre',
      async transform(_code: string, id: string) {
        if (id.endsWith('src/main.ts')) await released
        return undefined
      },
    },
    last: {
      name: 'test:stylesheet-served',
      enforce: 'post',
      transform(_code: string, id: string) {
        if (id.includes('html-proxy')) {
          clearTimeout(timer)
          release()
        }
        return undefined
      },
    },
  }
}

/**
 * The reloads of the page sent while a browser's requests for it are served: the page, then its
 * script. `keep` holds `grid` only, so `flex`, read from the script, is outside what the
 * stylesheet was first served with unless the stylesheet waited for the script.
 */
async function reloadsOf(api: ViteApi): Promise<string[]> {
  const app = makeUsedApp(
    appFiles({
      'index.html': INLINE_PAGE,
      'src/main.ts': `${IMPORT}console.log(cx('flex'))\n`,
    }),
  )
  const { first, last } = scriptAfterStylesheet(1500)
  const { server, url } = await listenDev(
    devConfig(app.root, [first, navePlugin({ keep: ['grid'] }), last] as never),
    api,
  )
  try {
    const { hot } = server.environments.client
    const reloads: string[] = []
    const send = hot.send.bind(hot) as (...args: unknown[]) => void
    hot.send = ((...args: unknown[]) => {
      const payload = args[0] as { type?: string } | undefined
      if (payload?.type === 'full-reload') reloads.push('full-reload')
      send(...args)
    }) as never

    await fetch(url)
    await fetch(`${url}src/main.ts`)
    // The reload, if one is owed, goes out on the next turn of the event loop.
    await new Promise((resolve) => setTimeout(resolve, 200))
    return reloads
  } finally {
    await stopDev(server)
    app.dispose()
  }
}

describe.each(Object.entries(VITE_APIS))(
  'Vite %s: a page with an inline stylesheet is not reloaded by its first load',
  (_version, api) => {
    it('sends no reload when the script is read after the stylesheet is served', async () => {
      expect(await reloadsOf(api)).toEqual([])
    }, 60_000)
  },
)
