/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/* eslint-disable unicorn/consistent-function-scoping -- each fixture sits beside the criterion whose rows use it */
/**
 * The used-atoms criteria that are about what a page renders (AC-used-atoms-20 (a) and (b), -25's
 * Chromium clause, -39, -40, -41, -42): a real Chromium against the dev server and against
 * `vite preview` of a build, recording on every animation frame whether a class has its rule.
 */
import type { Browser, Page } from 'playwright'

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build, type InlineConfig, type PluginOption } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

import { atomClassMap } from '../../../src/atoms.ts'
import { devServing } from '../../../src/vite-dev.ts'
import { navePlugin, type NaveViteOptions } from '../../../src/vite.ts'
import { addPackage, appFiles, atomLayerAtoms, makeUsedApp } from '../../helpers/used-atoms-app.ts'
import { IMPORT } from '../../helpers/used-atoms-rows.ts'
import { appConfig, stopDev } from '../../helpers/vite-app.ts'
import {
  atFirstStylesheet,
  consoleOf,
  framesOf,
  launchChromium,
  listenDev,
  previewBuild,
  recordFrames,
  until,
  untilQuietly,
} from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()

afterAll(async () => {
  await browser.close()
}, 60_000)

/**
 * The dev server's config, its dependency cache under `node_modules` where Vite keeps it.
 */
function devConfig(root: string, plugins: PluginOption[]): InlineConfig {
  return {
    ...appConfig(root, 'postcss', plugins),
    cacheDir: path.join(root, 'node_modules', '.vite'),
  }
}

/**
 * Builds the app into `outDir` for `vite preview`, with the options.
 */
async function buildToDisk(
  root: string,
  outDir: string,
  options: NaveViteOptions = {},
): Promise<void> {
  await build({
    ...appConfig(root, 'postcss', [navePlugin(options)]),
    build: { write: true, outDir, cssTarget: ['chrome125'] },
  })
}

const PAGE = (body: string): string =>
  `<!doctype html><html><body>${body}<script type="module" src="/src/main.ts"></script></body></html>`

describe('AC-used-atoms-40 — the first stylesheet response waits for the graph', () => {
  // 38 atoms across 52 components in three levels, and a lazily loaded route holding `grid`.
  const ATOMS = Object.keys(atomClassMap)
    .filter((name) => name !== 'grid')
    .slice(0, 38)
  const files: Record<string, string> = {}
  const component = (name: string, atom: string, imports: string[]): string =>
    [
      IMPORT,
      ...imports.map((child) => `import './${child}.ts'`),
      `const e = document.createElement('div')`,
      `e.className = cx('${atom}')`,
      `document.body.append(e)`,
      '',
    ].join('\n')
  files['src/c0.ts'] = component(
    'c0',
    ATOMS[0]!,
    Array.from({ length: 8 }, (_, index) => `c1_${index}`),
  )
  for (let level1 = 0; level1 < 8; level1 += 1) {
    const children = Array.from(
      { length: level1 < 3 ? 6 : 5 },
      (_, index) => `c2_${level1}_${index}`,
    )
    files[`src/c1_${level1}.ts`] = component(`c1_${level1}`, ATOMS[1 + level1]!, children)
    for (const [index, child] of children.entries()) {
      files[`src/${child}.ts`] = component(child, ATOMS[(9 + level1 * 5 + index) % 38]!, [])
    }
  }
  files['src/route.ts'] =
    `${IMPORT}const e = document.createElement('div')\ne.className = cx('grid')\ndocument.body.append(e)\n`
  files['src/main.ts'] =
    "import './app.css'\nimport './c0.ts'\nsetTimeout(() => import('./route.ts'), 400)\n"
  const classes = [...ATOMS, 'grid'].map((atom) => atomClassMap[atom as keyof typeof atomClassMap])

  async function frames(isHeld: boolean): Promise<Record<string, boolean>> {
    const app = makeUsedApp(appFiles(files))
    const saved = { ...devServing }
    if (!isHeld) devServing.hold = () => Promise.resolve()
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin()]))
      try {
        const page = await browser.newPage()
        await recordFrames(page, classes)
        await page.goto(url)
        await untilQuietly(
          page,
          async () => Object.keys(await framesOf(page)).length >= classes.length,
          'every class to render',
        )
        const seen = await framesOf(page)
        await page.close()
        return seen
      } finally {
        await stopDev(server)
      }
    } finally {
      Object.assign(devServing, saved)
      app.dispose()
    }
  }

  it('has a rule for all 38 classes on the first frame an element carries each, and for the lazy route’s', async () => {
    const seen = await frames(true)

    expect(Object.keys(seen)).toHaveLength(classes.length)
    expect(Object.entries(seen).filter(([, ruled]) => !ruled)).toEqual([])
  }, 120_000)

  it('control: without the hold at least one class has no rule on its first frame', async () => {
    const seen = await frames(false)

    expect(Object.values(seen).filter((ruled) => !ruled).length).toBeGreaterThan(0)
  }, 120_000)
})

describe('AC-used-atoms-39 — a dependency’s calls are read in dev', () => {
  it('has the rule for wFull on the first frame its element exists, on a cold and a warm optimizer cache, and the browser requests core’s cx.js as a module', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/App.ts': `${IMPORT}import { libClass } from 'fake-lib'\ndocument.body.append(Object.assign(document.createElement('div'), { className: [cx('flex'), libClass()].join(' ') }))\n`,
      }),
      'copy',
    )
    addPackage(app, 'fake-lib', {
      'index.js': `${IMPORT}export const libClass = () => cx('wFull')\n`,
    })
    try {
      for (const run of ['cold', 'warm']) {
        const { server, url } = await listenDev(devConfig(app.root, [navePlugin()]))
        try {
          const page = await browser.newPage()
          const requested: string[] = []
          page.on('request', (request) => {
            requested.push(request.url())
          })
          await recordFrames(page, ['nave-w-full'])
          await page.goto(url)
          await until(
            page,
            async () => Object.hasOwn(await framesOf(page), 'nave-w-full'),
            'the element',
          )

          const frames = await framesOf(page)
          expect({ run, ruled: frames['nave-w-full'] }).toEqual({ run, ruled: true })
          expect({
            run,
            requested: requested.some((address) => address.includes('@navecss/core/dist/cx.js')),
          }).toEqual({ run, requested: true })
          await page.close()
        } finally {
          await stopDev(server)
        }
      }
    } finally {
      app.dispose()
    }
  }, 180_000)
})

describe('AC-used-atoms-41 — a set that grows reloads the stylesheet, with no page reload', () => {
  // The shape a framework's refresh has: the module defines what renders, the page renders it
  // once, and an update runs the new module's render after every module of the update is in.
  const appModule = (body: string): string =>
    `${IMPORT}export const render = () => { document.querySelector('#t')!.className = ${body} }\nif (import.meta.hot) import.meta.hot.accept((module) => module?.render())\n`

  async function edited(
    isReloading: boolean,
  ): Promise<{ first: boolean | undefined; mark: unknown }> {
    const saved = { ...devServing }
    if (!isReloading) {
      devServing.noteGrowth = () => {}
      devServing.modulesWithGrown = () => Promise.resolve(undefined)
    }
    const app = makeUsedApp(
      appFiles({
        'index.html': PAGE('<div id="t"></div>'),
        'src/App.ts': appModule("cx('flex')"),
        'src/main.ts': "import './app.css'\nimport { render } from './App.ts'\nrender()\n",
      }),
    )
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin()]))
      try {
        const page = await browser.newPage()
        await recordFrames(page, ['nave-block'])
        await page.goto(url)
        await until(
          page,
          () => page.evaluate(() => document.querySelector('#t')?.className === 'nave-flex'),
          'the first render',
        )
        await page.evaluate(() => {
          Object.assign(globalThis, {
            __mark: 1,
          })
        })
        writeFileSync(path.join(app.root, 'src/App.ts'), appModule("cx('flex', 'block')"))
        await untilQuietly(
          page,
          async () => Object.hasOwn(await framesOf(page), 'nave-block'),
          'the new class',
          6000,
        )
        await page.waitForTimeout(isReloading ? 0 : 500)
        const frames = await framesOf(page)
        const seen = frames['nave-block']
        const mark = await page.evaluate(
          () => (globalThis as unknown as { __mark?: number }).__mark,
        )
        const isRule = await page.evaluate(() =>
          [...document.styleSheets].some((sheet) =>
            [...sheet.cssRules].some((rule) => rule.cssText.includes('.nave-block')),
          ),
        )
        await page.close()
        return { first: isReloading ? seen : isRule, mark }
      } finally {
        await stopDev(server)
      }
    } finally {
      Object.assign(devServing, saved)
      app.dispose()
    }
  }

  it.each([1, 2, 3])(
    'run %i: the rule exists on the first frame #t carries nave-block, and window.__mark is still 1',
    async () => {
      const result = await edited(true)

      expect(result.first).toBe(true)
      expect(result.mark).toBe(1)
    },
    90_000,
  )

  it('control: without the stylesheet reload #t has no nave-block rule until a page reload', async () => {
    const result = await edited(false)

    expect(result.first).toBe(false)
  }, 90_000)
})

describe('AC-used-atoms-20 (a) and (b) — the same class strings in dev and in the build', () => {
  const GRID_LINE =
    '[nave] cx.dynamic("grid") applied no class: "grid" is not kept, so the build does not ship it either. Add "grid" to keep in navePlugin(), or, when a dependency makes the call, to its list in keepFor.'
  const LEGACY_LINE =
    '[nave] cx.dynamic("legacy-card") applied no class: "legacy-card" is not a Nave atom.'
  const OPTIONS: NaveViteOptions = { keep: ['flex'], keepFor: { 'dyn-lib': ['block'] } }

  function makeFixture(): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(
      appFiles({
        'src/main.ts': [
          "import './app.css'",
          "import { cx } from '@navecss/core/cx'",
          "import { tone } from 'dyn-lib'",
          "(window as unknown as { __r: string[] }).__r = [tone('grid'), tone('flex'), tone('block'), cx.dynamic('grid'), cx.dynamic('flex'), cx.dynamic('block')]",
          "cx.dynamic('legacy-card' as never)",
          'cx.dynamic(null)',
          '',
        ].join('\n'),
      }),
      'copy',
    )
    addPackage(app, 'dyn-lib', {
      'index.js': `${IMPORT}export const tone = (t) => cx.dynamic(t)\n`,
    })
    return app
  }
  const result = (page: Page): Promise<string[]> =>
    page.evaluate(() => (globalThis as unknown as { __r: string[] }).__r)

  it('(a) dev: one map whoever calls, one console line per grid call, the other text for a non-atom, none for a falsy value', async () => {
    const app = makeFixture()
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin(OPTIONS)]))
      try {
        const page = await browser.newPage()
        const lines = consoleOf(page)
        await page.goto(url)
        await until(page, async () => (await result(page)) !== undefined, 'the result')

        expect(await result(page)).toEqual([
          '',
          'nave-flex',
          'nave-block',
          '',
          'nave-flex',
          'nave-block',
        ])
        expect(lines.filter((line) => line === GRID_LINE)).toHaveLength(2)
        expect(lines.filter((line) => line === LEGACY_LINE)).toHaveLength(1)
        expect(lines.filter((line) => line.startsWith('[nave]'))).toHaveLength(3)
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('(a) after keep changes to grid and the dev server restarts, the page follows the new list', async () => {
    const app = makeFixture()
    try {
      const strings = async (options: NaveViteOptions): Promise<string[]> => {
        const { server, url } = await listenDev(devConfig(app.root, [navePlugin(options)]))
        try {
          const page = await browser.newPage()
          await page.goto(url)
          await until(page, async () => (await result(page)) !== undefined, 'the result')
          const seen = await result(page)
          await page.close()
          return seen
        } finally {
          await stopDev(server)
        }
      }

      expect(await strings(OPTIONS)).toEqual([
        '',
        'nave-flex',
        'nave-block',
        '',
        'nave-flex',
        'nave-block',
      ])
      expect(await strings({ keep: ['grid'], keepFor: { 'dyn-lib': ['block'] } })).toEqual([
        'nave-grid',
        '',
        'nave-block',
        'nave-grid',
        '',
        'nave-block',
      ])
    } finally {
      app.dispose()
    }
  }, 180_000)

  it('(b) the build and its preview give the same strings, and carry no dev text', async () => {
    const app = makeFixture()
    try {
      await buildToDisk(app.root, 'dist', OPTIONS)
      const { server, url } = await previewBuild(app.root, 'dist')
      try {
        const page = await browser.newPage()
        const lines = consoleOf(page)
        await page.goto(url)
        await until(page, async () => (await result(page)) !== undefined, 'the result')

        expect(await result(page)).toEqual([
          '',
          'nave-flex',
          'nave-block',
          '',
          'nave-flex',
          'nave-block',
        ])
        expect(lines.filter((line) => line.startsWith('[nave]'))).toEqual([])
        const assets = path.join(app.root, 'dist', 'assets')
        const js = readdirSync(assets).filter((name) => name.endsWith('.js'))
        for (const name of js) {
          const text = readFileSync(path.join(assets, name), 'utf8')
          expect(text).not.toContain(GRID_LINE)
          expect(text).not.toContain(LEGACY_LINE)
          expect(text).not.toContain('__NAVE_KEEP_CLASSES__')
        }
        await page.close()
      } finally {
        await new Promise((resolve) => server.httpServer.close(resolve))
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('control: under all, dev maps through every atom and prints no plugin line', async () => {
    const app = makeFixture()
    try {
      const { server, url } = await listenDev(devConfig(app.root, [navePlugin({ atomic: 'all' })]))
      try {
        const page = await browser.newPage()
        const lines = consoleOf(page)
        await page.goto(url)
        await until(page, async () => (await result(page)) !== undefined, 'the result')

        expect(await result(page)).toEqual([
          'nave-grid',
          'nave-flex',
          'nave-block',
          'nave-grid',
          'nave-flex',
          'nave-block',
        ])
        expect(lines.filter((line) => line.startsWith('[nave]'))).toEqual([])
        await page.close()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)
})

describe('AC-used-atoms-42 — what dev shows as the build will, in a real engine', () => {
  const MAIN = [
    "import './app.css'",
    "import { cx } from '@navecss/core/cx'",
    "import { kf } from 'kf-lib'",
    "const add = (id: string, className: string): void => { document.body.append(Object.assign(document.createElement('div'), { id, className })) }",
    "add('a', cx('flex'))",
    "add('kf', kf('inlineFlex'))",
    "fetch('/data.json').then((r) => r.json()).then((className: string) => add('data', className))",
    '',
  ].join('\n')

  function makeFixture(): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(
      appFiles({
        'index.html': PAGE('<a class="nave-sr-only-focusable" href="#main">Skip</a>'),
        'src/main.ts': MAIN,
        'public/data.json': '"nave-truncate"',
      }),
    )
    addPackage(app, 'kf-lib', { 'index.js': `${IMPORT}export const kf = (v) => cx(v)\n` })
    return app
  }

  const computed = (page: Page, id: string, property: string): Promise<string> =>
    page.evaluate(
      ([target, name]) =>
        getComputedStyle(document.querySelector(`#${target}`)!).getPropertyValue(name!),
      [id, property],
    )

  async function measure(
    url: string,
    isSkipRuleChecked: boolean,
  ): Promise<{ kf: string; skip: boolean | undefined; truncate: string }> {
    const page = await browser.newPage()
    await recordFrames(page, ['nave-sr-only-focusable', 'nave-truncate'])
    await page.goto(url)
    await until(
      page,
      () => page.evaluate(() => document.querySelector('#data') !== null),
      'the data class',
    )
    await page.waitForTimeout(200)
    const atSheet = await atFirstStylesheet(page)
    const seen = atSheet?.['nave-sr-only-focusable']
    const result = {
      truncate: await computed(page, 'data', 'text-overflow'),
      kf: await computed(page, 'kf', 'display'),
      skip: isSkipRuleChecked ? seen : undefined,
    }
    await page.close()
    return result
  }

  it.each([
    ['without keep', { keepFor: { 'kf-lib': ['block'] } }, 'clip', 'block'],
    [
      'with truncate in keep and inlineFlex in the package’s list',
      { keep: ['truncate'], keepFor: { 'kf-lib': ['block', 'inlineFlex'] } },
      'ellipsis',
      'inline-flex',
    ],
  ] as const)(
    '%s: dev and the preview compute the same, and the skip link has its rule in dev on the first frame',
    async (_name, options, truncate, display) => {
      const app = makeFixture()
      try {
        const { server, url } = await listenDev(devConfig(app.root, [navePlugin(options)]))
        let dev
        try {
          dev = await measure(url, true)
        } finally {
          await stopDev(server)
        }
        await buildToDisk(app.root, 'dist', options)
        const preview = await previewBuild(app.root, 'dist')
        let built
        try {
          built = await measure(preview.url, false)
        } finally {
          await new Promise((resolve) => preview.server.httpServer.close(resolve))
        }

        expect(dev.skip).toBe(true)
        expect(dev.truncate).toBe(truncate)
        expect(built.truncate).toBe(truncate)
        expect(dev.kf).toBe(display)
        expect(built.kf).toBe(display)
      } finally {
        app.dispose()
      }
    },
    180_000,
  )
})

describe('AC-used-atoms-25 — the pruned layer computes what the full layer does, in Chromium', () => {
  it('gives a focus-ring button and a skip link the same outline, width and clip-path after Tab as the all build', async () => {
    const app = makeUsedApp(
      appFiles({
        'index.html': PAGE(
          '<a class="nave-sr-only-focusable" href="#main">Skip</a><button id="b" class="nave-focus-ring">b</button>',
        ),
        'src/main.ts': "import './app.css'\n",
      }),
    )
    const after = async (outDir: string, options: NaveViteOptions): Promise<string[]> => {
      await buildToDisk(app.root, outDir, options)
      const { server, url } = await previewBuild(app.root, outDir)
      try {
        const page = await browser.newPage()
        await page.goto(url)
        const rows: string[] = []
        for (const target of ['a', 'button']) {
          await page.keyboard.press('Tab')
          rows.push(
            await page.evaluate((selector) => {
              const style = getComputedStyle(document.querySelector(selector)!)
              return [style.outlineStyle, style.outlineWidth, style.width, style.clipPath].join('|')
            }, target),
          )
        }
        await page.close()
        return rows
      } finally {
        await new Promise((resolve) => server.httpServer.close(resolve))
      }
    }
    try {
      const used = await after('dist-used', {})
      const all = await after('dist-all', { atomic: 'all' })

      expect(used).toEqual(all)
      expect(used[1]!.split('|', 1)[0]).not.toBe('none')
      const sheet = path.join(app.root, 'dist-used', 'assets', cssOf(app.root, 'dist-used'))
      const shipped = atomLayerAtoms(readFileSync(sheet, 'utf8'))
      expect(shipped).toEqual(['focusRing', 'srOnlyFocusable'])
    } finally {
      app.dispose()
    }
  }, 180_000)
})

/**
 * The name of the CSS file a build wrote into `outDir`.
 */
function cssOf(root: string, outDir: string): string {
  return readdirSync(path.join(root, outDir, 'assets')).find((name) => name.endsWith('.css'))!
}
