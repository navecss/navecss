/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/**
 * What the dev server has read when a stylesheet is answered (AC-used-atoms-40, -41, -42, -53 and
 * -54), in a real Chromium: HTML that is read or edited after the stylesheet was first
 * transformed, a server that warms its files up, and a page that loads a script the stylesheet's
 * own graph does not hold.
 */
import type { Browser, Page } from 'playwright'
import type { PluginOption } from 'vite'

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { navePlugin, type NaveViteOptions } from '../../../src/vite.ts'
import { APP_CSS, appFiles, makeUsedApp } from '../../helpers/used-atoms-app.ts'
import { IMPORT } from '../../helpers/used-atoms-rows.ts'
import { stopDev } from '../../helpers/vite-app.ts'
import {
  devConfig,
  framesOf,
  hasRuleNow,
  launchChromium,
  listenDev,
  recordFrames,
  until,
  untilQuietly,
  warningLogger,
} from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()

afterAll(async () => {
  await browser.close()
}, 60_000)

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
async function isSheetTransformed(
  server: Awaited<ReturnType<typeof listenDev>>['server'],
  root: string,
  file = 'src/app.css',
): Promise<boolean> {
  const module = server.environments.client.moduleGraph.getModuleById(path.join(root, file))
  return module?.transformResult != null
}

/**
 * Waits until the dev server has transformed the stylesheet, which a warm-up does at start.
 */
async function untilSheetTransformed(
  server: Awaited<ReturnType<typeof listenDev>>['server'],
  root: string,
  file = 'src/app.css',
): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline && !(await isSheetTransformed(server, root, file))) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  expect(await isSheetTransformed(server, root, file)).toBe(true)
}

describe('AC-used-atoms-42 — HTML read after the stylesheet was first transformed', () => {
  const GRID_PAGE = PAGE('<div class="nave-flex"></div><div id="g" class="nave-grid"></div>')

  async function afterHtmlEdit(options: NaveViteOptions): Promise<boolean> {
    const app = makeUsedApp(
      appFiles({ 'index.html': PAGE('<div class="nave-flex"></div>'), 'src/main.ts': MAIN }),
    )
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin(options)]))
      try {
        const page = await browser.newPage()
        await page.goto(url)
        await until(page, () => hasRuleNow(page, 'nave-flex'), 'the first page')
        writeFileSync(path.join(app.root, 'index.html'), GRID_PAGE)
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
    expect(await afterHtmlEdit({})).toBe(true)
  }, 120_000)

  it('control: with the atom in keep it has one', async () => {
    expect(await afterHtmlEdit({ keep: ['grid'] })).toBe(true)
  }, 120_000)

  async function aboutPageRuled(visits: readonly string[]): Promise<boolean> {
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
    expect(await aboutPageRuled(['/', '/about.html'])).toBe(true)
  }, 120_000)

  it('control: the same page visited first has it', async () => {
    expect(await aboutPageRuled(['/about.html'])).toBe(true)
  }, 120_000)
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
  }, 120_000)

  it('control: without the warm-up the same app has the rule and no warning', async () => {
    const { isRuled, warned } = await warmedPage(false)

    expect({ isRuled, warned: pluginWarnings(warned) }).toEqual({ isRuled: true, warned: [] })
  }, 120_000)

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

        await (await fetch(new URL('src/app.css', url))).text()
        expect(plugin()).toBe(1)

        await (await fetch(new URL('src/app.css', url))).text()
        await (await fetch(new URL('src/main.ts', url))).text()
        expect(plugin()).toBe(1)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)
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
    120_000,
  )

  it('notes no request whose path does not decode, which Vite refuses, and the server still answers', async () => {
    expect(await warningsAround(() => '/src/app%E0%A4%A.css')).toEqual({
      afterRequest: 0,
      atStart: 0,
    })
  }, 120_000)
})

/**
 * A module that appends an element carrying `cx(atom)` to the body when it runs.
 */
const appends = (id: string, atom: string): string =>
  `${IMPORT}document.body.append(Object.assign(document.createElement('div'), { id: '${id}', className: cx('${atom}') }))\n`

describe('AC-used-atoms-41 — the first frame after an update, for a module the update brings in', () => {
  // The shape a framework's refresh has: the update imports the new module, and the render runs
  // after every module of the update is in.
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
        writeFileSync(path.join(app.root, 'src/App.ts'), appModule(true))
        await untilQuietly(
          page,
          async () => Object.hasOwn(await framesOf(page), 'nave-block'),
          'the new module’s element',
          6000,
        )

        expect((await framesOf(page))['nave-block']).toBe(true)
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)
})

/**
 * A scratch plugin that makes every transform of the stylesheet after its first take 400 ms, as
 * one of a large project does, so a reload of it comes later than the script that asked for it.
 */
function slowAfterFirst(file: string): PluginOption {
  let count = 0
  return {
    name: 'slow-stylesheet',
    async transform(_code: string, id: string) {
      if (!id.endsWith(file)) return
      count += 1
      if (count > 1) await new Promise((resolve) => setTimeout(resolve, 400))
    },
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
        devConfig(app.root, [slowAfterFirst('app.css'), navePlugin()]),
      )
      try {
        const page = await browser.newPage()
        await recordFrames(page, ['nave-block'])
        await page.goto(url)
        await untilQuietly(
          page,
          async () => Object.hasOwn(await framesOf(page), 'nave-block'),
          'the lazy module’s element',
          6000,
        )

        expect((await framesOf(page))['nave-block']).toBe(true)
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('a stylesheet a link names, which no module imports, is answered with the classes of the page at once, and the class a script adds follows', async () => {
    const app = makeUsedApp({
      'package.json': '{"private":true,"type":"module"}',
      'index.html':
        '<!doctype html><html><head><link rel="stylesheet" href="/src/linked.css"></head><body><p class="nave-hidden">h</p><script type="module" src="/src/main.ts"></script></body></html>',
      'src/linked.css': APP_CSS,
      'src/main.ts': appends('f', 'flex'),
    })
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin()]))
      try {
        const page = await browser.newPage()
        await recordFrames(page, ['nave-hidden', 'nave-flex'])
        await page.goto(url)
        await until(
          page,
          async () => Object.hasOwn(await framesOf(page), 'nave-flex'),
          'the script’s element',
        )
        await page.waitForTimeout(3000)

        expect(await framesOf(page)).toEqual({ 'nave-hidden': true, 'nave-flex': true })
        expect(await hasRuleNow(page, 'nave-flex')).toBe(true)
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)
})
