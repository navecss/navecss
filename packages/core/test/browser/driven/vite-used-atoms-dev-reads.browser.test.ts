/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/**
 * What the dev server has read when a stylesheet is answered (AC-used-atoms-40, -41, -42, -53 and
 * -54), in a real Chromium: HTML that is read or edited after the stylesheet was first
 * transformed, a server that warms its files up, and a page that loads a script the stylesheet's
 * own graph does not hold.
 */
import type { Browser, Page } from 'playwright'
import type { PluginOption, ViteDevServer } from 'vite'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { navePlugin, type NaveViteOptions } from '../../../src/vite.ts'
import { APP_CSS, appFiles, makeUsedApp } from '../../helpers/used-atoms-app.ts'
import { IMPORT } from '../../helpers/used-atoms-rows.ts'
import { stopDev, VITE_APIS, type ViteApi } from '../../helpers/vite-app.ts'
import {
  devConfig,
  edit,
  framesOf,
  hasRuleNow,
  launchChromium,
  listenDev,
  recordFrames,
  until,
  warningLogger,
} from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()

afterAll(async () => {
  await browser.close()
}, 60_000)

// What a row here may take is 480 s, and a wait inside one holds out for the same: the row's own
// timeout is the one deadline. A row loads pages from a dev server in a real browser, and on a
// machine running other suites one took longer than the 20 s to 120 s these used to allow.
const ROW_TIMEOUT = 480_000

const PAGE = (body: string): string =>
  `<!doctype html><html><body>${body}<script type="module" src="/src/main.ts"></script></body></html>`

const MAIN = "import './app.css'\n"

/**
 * Every warning the plugin logged, whatever it says: they all start with its call.
 */
function pluginWarnings(warned: readonly string[]): string[] {
  return warned.filter((message) => message.startsWith('navePlugin()'))
}

/**
 * Whether the page holds an element matching `selector`; false while it is navigating.
 */
async function hasElement(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.evaluate((target) => document.querySelector(target) !== null, selector)
  } catch {
    return false
  }
}

/**
 * Whether the dev server has transformed the stylesheet `file` (`src/app.css` unless another is
 * named) of `root` already.
 */
function isSheetTransformed(
  server: Awaited<ReturnType<typeof listenDev>>['server'],
  root: string,
  file = 'src/app.css',
): boolean {
  const module = server.environments.client.moduleGraph.getModuleById(path.join(root, file))
  return Boolean(module?.transformResult)
}

/**
 * Waits until the dev server has transformed the stylesheet, which a warm-up does at start.
 */
async function untilSheetTransformed(
  server: Awaited<ReturnType<typeof listenDev>>['server'],
  root: string,
  file = 'src/app.css',
): Promise<void> {
  const deadline = Date.now() + ROW_TIMEOUT
  while (Date.now() < deadline && !isSheetTransformed(server, root, file)) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  expect(isSheetTransformed(server, root, file)).toBe(true)
}

describe('AC-used-atoms-42 — HTML read after the stylesheet was first transformed', () => {
  const GRID_PAGE = PAGE('<div class="nave-flex"></div><div id="g" class="nave-grid"></div>')

  async function isRuledAfterHtmlEdit(options: NaveViteOptions): Promise<boolean> {
    const app = makeUsedApp(
      appFiles({ 'index.html': PAGE('<div class="nave-flex"></div>'), 'src/main.ts': MAIN }),
    )
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin(options)]))
      try {
        const page = await browser.newPage()
        await page.goto(url)
        await until(page, () => hasRuleNow(page, 'nave-flex'), 'the first page')
        edit(server, path.join(app.root, 'index.html'), GRID_PAGE)
        await until(page, () => hasElement(page, '#g'), 'the reload with the edited page')
        await page.waitForTimeout(3000)
        const isRuled = await hasRuleNow(page, 'nave-grid')
        await page.close()
        return isRuled
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it('an edit of index.html that adds a class gives it a rule once the page has reloaded', async () => {
    expect(await isRuledAfterHtmlEdit({})).toBe(true)
  }, 480_000)

  it('control: with the atom in keep it has one', async () => {
    expect(await isRuledAfterHtmlEdit({ keep: ['grid'] })).toBe(true)
  }, 480_000)

  async function isAboutPageRuled(visits: readonly string[]): Promise<boolean> {
    const app = makeUsedApp(
      appFiles({
        'index.html': PAGE('<div class="nave-flex"></div>'),
        'about.html': PAGE('<div id="g" class="nave-grid"></div>'),
        'src/main.ts': MAIN,
      }),
    )
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin()]))
      try {
        const page = await browser.newPage()
        for (const visit of visits) {
          await page.goto(new URL(visit, url).href)
          await page.waitForTimeout(1000)
        }
        await page.waitForTimeout(2000)
        const isRuled = await hasRuleNow(page, 'nave-grid')
        await page.close()
        return isRuled
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it('the second page of the app, visited after the first, has the rule for its class', async () => {
    expect(await isAboutPageRuled(['/', '/about.html'])).toBe(true)
  }, 480_000)

  it('control: the same page visited first has it', async () => {
    expect(await isAboutPageRuled(['/about.html'])).toBe(true)
  }, 480_000)
})

describe('AC-used-atoms-42 and -54 — a server that warms the entry up before any page is read', () => {
  const WARMED = { server: { warmup: { clientFiles: ['./src/main.ts'] } } }

  async function warmedPage(isWarm: boolean): Promise<{ isRuled: boolean; warned: string[] }> {
    const app = makeUsedApp(
      appFiles({ 'index.html': PAGE('<div class="nave-flex"></div>'), 'src/main.ts': MAIN }),
    )
    const { logger, warned } = warningLogger()
    try {
      const { server, url } = await listenDev({
        ...devConfig(app.root, [navePlugin()]),
        customLogger: logger,
        ...(isWarm && WARMED),
      })
      try {
        if (isWarm) await untilSheetTransformed(server, app.root)
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const page = await browser.newPage()
        await page.goto(url)
        await page.waitForTimeout(3000)
        const isRuled = await hasRuleNow(page, 'nave-flex')
        await page.close()
        return { isRuled, warned }
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it('the page has the rule for its class and the server printed no markup warning', async () => {
    const { isRuled, warned } = await warmedPage(true)

    expect({ isRuled, warned: pluginWarnings(warned) }).toEqual({ isRuled: true, warned: [] })
  }, 480_000)

  it('control: without the warm-up the same app has the rule and no warning', async () => {
    const { isRuled, warned } = await warmedPage(false)

    expect({ isRuled, warned: pluginWarnings(warned) }).toEqual({ isRuled: true, warned: [] })
  }, 480_000)

  it('AC-used-atoms-54: a backend app under a warm-up logs nothing at start and one warning after the first request for its stylesheet', async () => {
    const app = makeUsedApp({ 'src/app.css': APP_CSS, 'src/main.ts': MAIN })
    const { logger, warned } = warningLogger()
    const plugin = (): number => pluginWarnings(warned).length
    try {
      const { server, url } = await listenDev({
        ...devConfig(app.root, [navePlugin()]),
        customLogger: logger,
        ...WARMED,
      })
      try {
        await untilSheetTransformed(server, app.root)
        await new Promise((resolve) => setTimeout(resolve, 500))
        expect(plugin()).toBe(0)

        const firstSheet = await fetch(new URL('src/app.css', url))
        await firstSheet.text()
        expect(plugin()).toBe(1)

        const secondSheet = await fetch(new URL('src/app.css', url))
        await secondSheet.text()
        const script = await fetch(new URL('src/main.ts', url))
        await script.text()
        expect(plugin()).toBe(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 480_000)
})

describe('AC-used-atoms-54 — a backend under a warm-up is warned when the stylesheet is requested, however the request spells it', () => {
  const SPACED = 'src/my app.css'

  /**
   * How many warnings the plugin had logged at start, and after one request for `request` (a path
   * from the server's address) sent with `headers`.
   */
  async function warningsAround(
    request: (root: string) => string,
    options: { readonly base?: string; readonly headers?: Record<string, string> } = {},
  ): Promise<{ afterRequest: number; atStart: number }> {
    const app = makeUsedApp({
      'src/app.css': APP_CSS,
      [SPACED]: APP_CSS,
      'src/main.ts': "import './app.css'\nimport './my app.css'\n",
    })
    const { logger, warned } = warningLogger()
    try {
      const { server, url } = await listenDev({
        ...devConfig(app.root, [navePlugin()]),
        customLogger: logger,
        ...(options.base && { base: options.base }),
        server: { warmup: { clientFiles: ['./src/main.ts'] } },
      })
      try {
        await untilSheetTransformed(server, app.root)
        await untilSheetTransformed(server, app.root, SPACED)
        await new Promise((resolve) => setTimeout(resolve, 500))
        const atStart = pluginWarnings(warned).length

        const response = await fetch(new URL(request(app.root), url), {
          headers: options.headers ?? {},
        })
        await response.text()
        return { afterRequest: pluginWarnings(warned).length, atStart }
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  it.each([
    ['a path with a space, percent-encoded', () => '/src/my%20app.css', {}],
    ['a path under a base', () => '/app/src/app.css', { base: '/app/' }],
    [
      'a path under a base, asked for as a stylesheet',
      () => '/app/src/app.css',
      { base: '/app/', headers: { Accept: 'text/css' } },
    ],
    ['a path with a timestamp query', () => '/src/app.css?t=123', {}],
    ['a path under /@fs/', (root: string) => `/@fs${root}/src/app.css`, {}],
  ] as const)(
    'logs none at start and one after a request for %s',
    async (_name, request, options) => {
      expect(await warningsAround(request, options)).toEqual({ afterRequest: 1, atStart: 0 })
    },
    480_000,
  )

  it('notes no request whose path does not decode, which Vite refuses, and the server still answers', async () => {
    expect(await warningsAround(() => '/src/app%E0%A4%A.css')).toEqual({
      afterRequest: 0,
      atStart: 0,
    })
  }, 480_000)
})

/**
 * A module that appends an element carrying `cx(atom)` to the body when it runs.
 */
const appends = (id: string, atom: string): string =>
  `${IMPORT}document.body.append(Object.assign(document.createElement('div'), { id: '${id}', className: cx('${atom}') }))\n`

/**
 * The shape a framework's refresh has: the update imports the new module, and the render runs
 * after every module of the update is in.
 */
const appModule = (isEdited: boolean): string =>
  [
    isEdited ? "import { view } from './New.ts'" : '',
    IMPORT,
    'export const render = () => {',
    "  document.querySelector('#t')!.className = cx('flex')",
    isEdited
      ? "  document.body.append(Object.assign(document.createElement('div'), { id: 'n', className: view() }))"
      : '',
    '}',
    'if (import.meta.hot) import.meta.hot.accept((module) => module?.render())',
    '',
  ].join('\n')

describe('AC-used-atoms-41 — the first frame after an update, for a module the update brings in', () => {
  it('an edit that imports a module new to the graph gives its class a rule on the first frame', async () => {
    const app = makeUsedApp(
      appFiles({
        'index.html': PAGE('<div id="t"></div>'),
        'src/App.ts': appModule(false),
        'src/New.ts': `${IMPORT}export const view = () => cx('block')\n`,
        'src/main.ts': "import './app.css'\nimport { render } from './App.ts'\nrender()\n",
      }),
    )
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin()]))
      try {
        const page = await browser.newPage()
        await recordFrames(page, ['nave-block'])
        await page.goto(url)
        await until(page, () => hasRuleNow(page, 'nave-flex'), 'the first render')
        edit(server, path.join(app.root, 'src/App.ts'), appModule(true))
        await until(
          page,
          async () => Object.hasOwn(await framesOf(page), 'nave-block'),
          'the new module’s element',
        )

        const frames = await framesOf(page)
        expect(frames['nave-block']).toBe(true)
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 480_000)
})

/**
 * A scratch plugin for the stylesheet `file`. Every transform of it after its first takes 400 ms,
 * as one of a large project does, so a reload of it comes later than the script that asked for it.
 * The first transform waits until the dev server has been asked for the module `asked`, so what
 * the row sees does not depend on which request the browser sends first.
 */
function slowAfterFirst(file: string, asked: string): PluginOption {
  let count = 0
  let server: ViteDevServer | undefined
  return {
    name: 'slow-stylesheet',
    configureServer(started) {
      server = started
    },
    async transform(_code: string, id: string) {
      if (!id.endsWith(file)) return
      count += 1
      if (count > 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        return
      }
      const deadline = Date.now() + ROW_TIMEOUT
      while (!hasModule(server, asked)) {
        if (Date.now() > deadline) throw new Error(`the dev server was never asked for ${asked}`)
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    },
  }
}

/**
 * Whether the client module graph of `server` holds a module whose id ends with `file`.
 */
function hasModule(server: ViteDevServer | undefined, file: string): boolean {
  const ids = server?.environments.client.moduleGraph.idToModuleMap.keys() ?? []
  return [...ids].some((id) => id.endsWith(file))
}

/**
 * The app of the `<link>` rows: `index.html` names `src/linked.css` in a `<link>` (no module
 * imports it) and carries `nave-hidden`, and `src/main.ts` appends an element carrying
 * `cx('flex')`.
 */
const LINKED_APP = {
  'package.json': '{"private":true,"type":"module"}',
  'index.html':
    '<!doctype html><html><head><link rel="stylesheet" href="/src/linked.css"></head><body><p class="nave-hidden">h</p><script type="module" src="/src/main.ts"></script></body></html>',
  'src/linked.css': APP_CSS,
  'src/main.ts': appends('f', 'flex'),
}

/**
 * Waits until `isDone` is true, and fails naming `what` when the row's time is out.
 */
async function untilServer(isDone: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + ROW_TIMEOUT
  while (!isDone()) {
    if (Date.now() > deadline) throw new Error(`the dev server never reached ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * A scratch plugin that lets the dev server read the module `script` only once the stylesheet
 * `file` has been answered, so the answer cannot hold what the script adds, whichever request
 * the browser sends first. `answer()` is the text of that first answer. List it after
 * `navePlugin()`, so the text it keeps is the one the page is given.
 */
function answeredBeforeScript(
  file: string,
  script: string,
): { answer: () => string | undefined; plugin: PluginOption } {
  let answer: string | undefined
  return {
    answer: () => answer,
    plugin: [
      {
        name: 'script-after-stylesheet',
        enforce: 'pre',
        async transform(_code: string, id: string) {
          if (id.endsWith(script))
            await untilServer(() => answer !== undefined, `the ${file} answer`)
        },
      },
      {
        name: 'stylesheet-answer',
        enforce: 'post',
        transform(code: string, id: string) {
          if (answer === undefined && id.split('?', 1)[0]?.endsWith(file)) answer = code
        },
      },
    ],
  }
}

/**
 * Whether the stylesheet text `css` holds a rule for each of `names`.
 */
function rulesIn(css: string | undefined, names: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(
    names.map((name) => [name, new RegExp(String.raw`\.${name}(?![\w-])`).test(css ?? '')]),
  )
}

/**
 * A scratch plugin that holds Vite's client module until the dev server has read the module
 * `script` and one turn of the event loop has passed, so a reload sent when that read grew the
 * set goes out before the page is listening. List it after `navePlugin()`.
 */
function clientAfterScript(script: string): PluginOption {
  let isScriptRead = false
  return [
    {
      name: 'client-after-script',
      enforce: 'pre',
      async transform(_code: string, id: string) {
        if (!id.endsWith('vite/dist/client/client.mjs')) return
        await untilServer(() => isScriptRead, `the read of ${script}`)
        await new Promise((resolve) => setTimeout(resolve, 0))
      },
    },
    {
      name: 'script-read',
      enforce: 'post',
      transform(_code: string, id: string) {
        if (id.endsWith(script)) isScriptRead = true
      },
    },
  ]
}

/**
 * Whether the `nave-flex` element of `LINKED_APP` gets its rule when the `<link>` was answered
 * before `src/main.ts` was read and the page starts listening only after that read, and whether
 * the page is still the one first loaded (no page reload).
 */
async function scriptClassAfterGrowth(
  options: NaveViteOptions,
): Promise<{ isRuled: boolean; isSamePage: boolean }> {
  const app = makeUsedApp(LINKED_APP)
  const order = answeredBeforeScript('src/linked.css', 'src/main.ts')
  try {
    const { server, url } = await listenDev(
      devConfig(app.root, [navePlugin(options), order.plugin, clientAfterScript('src/main.ts')]),
    )
    try {
      const page = await browser.newPage()
      await page.goto(url)
      await until(page, () => hasElement(page, '#f'), 'the script’s element')
      await page.evaluate(() => {
        document.documentElement.dataset.mark = '1'
      })
      await until(page, () => hasRuleNow(page, 'nave-flex'), 'the rule for nave-flex')
      const isSamePage = await page.evaluate(() => document.documentElement.dataset.mark === '1')
      const isRuled = await hasRuleNow(page, 'nave-flex')
      await page.close()
      return { isRuled, isSamePage }
    } finally {
      await stopDev(server)
    }
  } finally {
    app.dispose()
  }
}

describe('AC-used-atoms-40 — what the first stylesheet response has read', () => {
  it('a second script of the page, which the stylesheet’s own graph does not hold, has had its lazy module read', async () => {
    const app = makeUsedApp(
      appFiles({
        'index.html':
          '<!doctype html><html><body><script type="module" src="/src/main.ts"></script><script type="module" src="/src/widget.ts"></script></body></html>',
        'src/main.ts': MAIN,
        'src/widget.ts': "setTimeout(() => import('./w2.ts'), 300)\n",
        'src/w2.ts': appends('w', 'block'),
      }),
    )
    try {
      const { server, url } = await listenDev(
        devConfig(app.root, [slowAfterFirst('app.css', 'src/widget.ts'), navePlugin()]),
      )
      try {
        const page = await browser.newPage()
        await recordFrames(page, ['nave-block'])
        await page.goto(url)
        await until(
          page,
          async () => Object.hasOwn(await framesOf(page), 'nave-block'),
          'the lazy module’s element',
        )

        const frames = await framesOf(page)
        expect(frames['nave-block']).toBe(true)
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 480_000)

  it('a stylesheet a link names, which no module imports, is answered at once with the classes of the page', async () => {
    const app = makeUsedApp(LINKED_APP)
    const order = answeredBeforeScript('src/linked.css', 'src/main.ts')
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin(), order.plugin]))
      try {
        const page = await browser.newPage()
        await recordFrames(page, ['nave-hidden'])
        await page.goto(url)
        await until(page, () => hasElement(page, '#f'), 'the script’s element')

        expect(await framesOf(page)).toEqual({ 'nave-hidden': true })
        expect(rulesIn(order.answer(), ['nave-hidden', 'nave-flex'])).toEqual({
          'nave-hidden': true,
          'nave-flex': false,
        })
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 480_000)
})

describe('AC-used-atoms-41 — a set that grew before the page was listening', () => {
  it('the class a script adds to that page gets its rule with no page reload, though the set grew before the page was listening', async () => {
    expect(await scriptClassAfterGrowth({})).toEqual({ isRuled: true, isSamePage: true })
  }, 480_000)

  it('control: with the atom in keep it has one', async () => {
    expect(await scriptClassAfterGrowth({ keep: ['flex'] })).toEqual({
      isRuled: true,
      isSamePage: true,
    })
  }, 480_000)
})

/**
 * The app of the inline rows: `index.html` holds the Quick start's imports in a `<style>` and
 * carries `nave-hidden`, `src/main.ts` appends an element carrying `cx('flex')`, and
 * `src/late.ts`, which no module imports, appends one carrying `cx('grid')`.
 */
const INLINE_APP = {
  'package.json': '{"private":true,"type":"module"}',
  'index.html': `<!doctype html><html><head><style>${APP_CSS}</style></head><body><p class="nave-hidden">h</p><script type="module" src="/src/main.ts"></script></body></html>`,
  'src/main.ts': appends('f', 'flex'),
  'src/late.ts': appends('g', 'grid'),
}

/**
 * Whether a stylesheet of the page holds a rule for `name`; false while the page is navigating.
 */
async function isRuledNow(page: Page, name: string): Promise<boolean> {
  try {
    return await hasRuleNow(page, name)
  } catch {
    return false
  }
}

/**
 * Whether the page is no longer the one `dataset.mark` was written to: it is reloading or has.
 */
async function isReloaded(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => document.documentElement.dataset.mark !== '1')
  } catch {
    return true
  }
}

/**
 * Whether the stylesheet of `INLINE_APP` gets the rule for `nave-grid` when the page, already
 * listening for updates, imports `src/late.ts`, and whether the page is still the one first
 * loaded. An inline stylesheet is part of the HTML, so the way to give it the rule is to reload
 * the page, which is read again once it has.
 */
async function lateClassOfInlineStyle(
  options: NaveViteOptions,
  api: ViteApi,
): Promise<{ isRuled: boolean; isSamePage: boolean }> {
  const app = makeUsedApp(INLINE_APP)
  try {
    const { server, url } = await listenDev(devConfig(app.root, [navePlugin(options)]), api)
    try {
      const connected = new Promise<void>((resolve) => {
        server.environments.client.hot.on('vite:client:connect', () => {
          resolve()
        })
      })
      const page = await browser.newPage()
      await page.goto(url)
      await until(page, () => hasElement(page, '#f'), 'the script’s element')
      await connected
      await page.evaluate(() => {
        document.documentElement.dataset.mark = '1'
      })
      await page.addScriptTag({ type: 'module', content: "import '/src/late.ts'" })
      // The element is on this page only if it is not reloaded before the module has run.
      await until(
        page,
        async () => (await hasElement(page, '#g')) || (await isReloaded(page)),
        'the late element or the reload',
      )
      await until(page, () => isRuledNow(page, 'nave-grid'), 'the rule for nave-grid')
      await page.waitForLoadState('load')
      const isRuled = await isRuledNow(page, 'nave-grid')
      const isSamePage = await page.evaluate(() => document.documentElement.dataset.mark === '1')
      await page.close()
      return { isRuled, isSamePage }
    } finally {
      await stopDev(server)
    }
  } finally {
    app.dispose()
  }
}

/**
 * A scratch plugin that answers `/r/<route>` the way a server rendering each route does: the
 * template `index.html` passed through `transformIndexHtml` with the URL asked for, so each route
 * is an HTML page of its own to Vite.
 */
function routeHtml(root: string): PluginOption {
  return {
    name: 'route-html',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const route = request.url
        if (route?.startsWith('/r/') !== true) {
          next()
          return
        }
        const answer = async (): Promise<void> => {
          try {
            const template = readFileSync(path.join(root, 'index.html'), 'utf8')
            response.setHeader('content-type', 'text/html')
            response.end(await server.transformIndexHtml(route, template))
          } catch (error) {
            next(error)
          }
        }
        void answer()
      })
    },
  }
}

interface SettlingApp {
  readonly files: Readonly<Record<string, string>>
  /**
   * The page a first tab shows and is closed on, then the one a second tab opens and stays on.
   */
  readonly first: string
  readonly stays: string
  readonly plugins: (root: string) => PluginOption[]
  /**
   * An edit made once the tab is on `stays`, which the page reloads for.
   */
  readonly edit?: { readonly file: string; readonly text: string }
}

/**
 * Apps in which the dev server has answered an inline stylesheet that no page asks for again by
 * the time the set grows (another page of the app, another route, and the page's own inline
 * stylesheet once an edit moved its imports to a `<link>`), and a page other than `index.html`
 * whose own inline stylesheet is the one the growth outgrows.
 */
const SETTLING_APPS: Readonly<Record<string, SettlingApp>> = {
  'a tab that opened after one on another page of the app': {
    files: { ...INLINE_APP, 'about.html': INLINE_APP['index.html'] },
    first: '/about.html',
    stays: '/',
    plugins: () => [],
  },
  'a page of the app other than index.html, whose own inline stylesheet is the one to reload': {
    files: { ...INLINE_APP, 'about.html': INLINE_APP['index.html'] },
    first: '/about.html',
    stays: '/about.html',
    plugins: () => [],
  },
  'a tab that opened after one on another route of a server that renders each route': {
    files: INLINE_APP,
    first: '/r/a',
    stays: '/r/b',
    plugins: (root) => [routeHtml(root)],
  },
  'a page whose inline stylesheet an edit moved to a link': {
    files: { ...INLINE_APP, 'src/app.css': APP_CSS },
    first: '/',
    stays: '/',
    plugins: () => [],
    edit: {
      file: 'index.html',
      text: '<!doctype html><html><head><link rel="stylesheet" href="/src/app.css"></head><body><p class="nave-hidden">h</p><script type="module" src="/src/main.ts"></script></body></html>',
    },
  },
}

/**
 * Opens `url` in `page` until the page holds the element `#f`. A page the dev server reloads
 * while it opens aborts the navigation and loads anyway.
 */
async function openApp(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url)
  } catch {
    await page.waitForLoadState('load')
  }
  await until(page, () => hasElement(page, '#f'), `the element of ${url}`)
}

/**
 * Whether the `nave-grid` element's rule is there once the page of `settling`, already listening,
 * has imported `src/late.ts`, and how many times the page has loaded since the import, three
 * seconds after the rule was first seen.
 */
async function loadsAfterTheReload(
  settling: SettlingApp,
  api: ViteApi,
): Promise<{ isRuled: boolean; loads: number }> {
  const app = makeUsedApp(settling.files)
  try {
    const plugins = [navePlugin(), ...settling.plugins(app.root)]
    const { server, url } = await listenDev(devConfig(app.root, plugins), api)
    try {
      const connected = (): Promise<void> =>
        new Promise<void>((resolve) => {
          server.environments.client.hot.on('vite:client:connect', () => {
            resolve()
          })
        })
      const firstPage = await browser.newPage()
      await openApp(firstPage, new URL(settling.first, url).href)
      await firstPage.close()
      const page = await browser.newPage()
      const staysConnection = connected()
      await openApp(page, new URL(settling.stays, url).href)
      await staysConnection
      if (settling.edit) {
        const reconnection = connected()
        await page.evaluate(() => {
          document.documentElement.dataset.mark = '1'
        })
        edit(server, path.join(app.root, settling.edit.file), settling.edit.text)
        await until(page, () => isReloaded(page), 'the reload for the edit')
        await until(page, () => hasElement(page, '#f'), 'the element of the edited page')
        await reconnection
      }
      let loads = 0
      page.on('load', () => {
        loads += 1
      })
      await page.addScriptTag({ type: 'module', content: "import '/src/late.ts'" })
      await until(page, () => isRuledNow(page, 'nave-grid'), 'the rule for nave-grid')
      await page.waitForTimeout(3000)
      const isRuled = await isRuledNow(page, 'nave-grid')
      await page.close()
      return { isRuled, loads }
    } finally {
      await stopDev(server)
    }
  } finally {
    app.dispose()
  }
}

describe.each(Object.entries(VITE_APIS))(
  'AC-used-atoms-41 — a stylesheet inlined in index.html, after the set grew (Vite %s)',
  (_name, api) => {
    it('the class a module adds once the page is listening gets its rule, the page having reloaded', async () => {
      expect(await lateClassOfInlineStyle({}, api)).toEqual({ isRuled: true, isSamePage: false })
    }, 480_000)

    it('control: with the atom in keep it has one, and nothing reloads', async () => {
      expect(await lateClassOfInlineStyle({ keep: ['grid'] }, api)).toEqual({
        isRuled: true,
        isSamePage: true,
      })
    }, 480_000)

    it.each(Object.entries(SETTLING_APPS))(
      'in %s, the page reloads for the class and then stays loaded',
      async (_app, settling) => {
        const { isRuled, loads } = await loadsAfterTheReload(settling, api)
        expect(isRuled).toBe(true)
        // One reload for the growth, and at most one more for a stylesheet no page shows; a page
        // that reloads each time it connects loads dozens of times in this window.
        expect(loads).toBeLessThanOrEqual(2)
      },
      480_000,
    )
  },
)
