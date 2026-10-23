/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/**
 * What a page shows for a Nave class a CSS Module composes from global (AC-used-atoms-61), in a
 * real Chromium: the built preview and the dev server, under both CSS transformers, on the floor
 * Vite and the newest 8.x, and a dev edit that adds a global composes.
 */
import type { Browser, Page } from 'playwright'
import type { PluginOption } from 'vite'

import vuePlugin from '@vitejs/plugin-vue'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { navePlugin } from '../../../src/vite.ts'
import { appFiles, makeUsedApp } from '../../helpers/used-atoms-app.ts'
import { cssModuleFiles } from '../../helpers/used-atoms-css-modules.ts'
import {
  appConfig,
  stopDev,
  type Transformer,
  VITE_APIS,
  type ViteApi,
} from '../../helpers/vite-app.ts'
import { edit, launchChromium, listenDev, previewBuild, until } from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()

afterAll(async () => {
  await browser.close()
}, 60_000)

const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']
const LEGS = Object.entries(VITE_APIS).flatMap(([version, api]) =>
  TRANSFORMERS.map((transformer) => ({ version, api, transformer })),
)

interface Computed {
  readonly display: string
  readonly columnGap: string
  readonly flexDirection: string
}

/**
 * What the page computes for each of the elements under `#app`, once there are `count` of them.
 */
async function computedOf(page: Page, count: number): Promise<Computed[]> {
  await until(
    page,
    async () => (await page.evaluate(() => document.querySelectorAll('#app > *').length)) >= count,
    'the elements',
  )
  return page.evaluate(() =>
    [...document.querySelectorAll('#app > *')].map((element) => {
      const style = getComputedStyle(element)
      return {
        display: style.display,
        columnGap: style.columnGap,
        flexDirection: style.flexDirection,
      }
    }),
  )
}

/**
 * The flex direction of the first element, or `undefined` while the page is navigating.
 */
async function directionOf(page: Page): Promise<string | undefined> {
  try {
    return await page.evaluate(() => {
      const element = document.querySelector('#app > *')
      return element === null ? undefined : getComputedStyle(element).flexDirection
    })
  } catch {
    return undefined
  }
}

/**
 * Builds the app into `dist` through `api`.
 */
async function buildToDisk(
  root: string,
  leg: { readonly api: ViteApi; readonly transformer: Transformer },
  plugins: PluginOption[] = [],
): Promise<void> {
  await leg.api.build({
    ...appConfig(root, leg.transformer, [...plugins, navePlugin()]),
    build: { write: true, outDir: 'dist', cssTarget: ['chrome125'] },
  })
}

/**
 * Reads the page at `url` once it holds `count` elements.
 */
async function read(url: string, count: number): Promise<Computed[]> {
  const page = await browser.newPage()
  try {
    await page.goto(url)
    return await computedOf(page, count)
  } finally {
    await page.close()
  }
}

describe.each(LEGS)(
  'AC-used-atoms-61 — the elements render the composed atoms ($version, $transformer)',
  (leg) => {
    it('computes flex, grid and inline-flex in the built preview, and a column gap on the second', async () => {
      const app = makeUsedApp(appFiles(cssModuleFiles()))
      try {
        await buildToDisk(app.root, leg)
        const { server, url } = await previewBuild(app.root, 'dist')
        try {
          const [box, myBox, card] = await read(url, 3)

          expect(box!.display).toBe('flex')
          expect(myBox!.display).toBe('grid')
          expect(myBox!.columnGap).not.toBe('0px')
          expect(myBox!.columnGap).not.toBe('normal')
          expect(card!.display).toBe('inline-flex')
        } finally {
          await new Promise((resolve) => server.httpServer.close(resolve))
        }
      } finally {
        app.dispose()
      }
    }, 120_000)

    it('computes the same in the dev server', async () => {
      const app = makeUsedApp(appFiles(cssModuleFiles()))
      const { server, url } = await listenDev(
        {
          ...appConfig(app.root, leg.transformer, [navePlugin()]),
          cacheDir: path.join(app.root, 'node_modules', '.vite'),
        },
        leg.api,
      )
      try {
        const [box, myBox, card] = await read(url, 3)

        expect(box!.display).toBe('flex')
        expect(myBox!.display).toBe('grid')
        expect(myBox!.columnGap).not.toBe('0px')
        expect(myBox!.columnGap).not.toBe('normal')
        expect(card!.display).toBe('inline-flex')
      } finally {
        await stopDev(server)
        app.dispose()
      }
    }, 120_000)

    it('row 3: an edit that adds a global composes grows the served layer, with no restart', async () => {
      const app = makeUsedApp(appFiles(cssModuleFiles()))
      const { server, url } = await listenDev(
        {
          ...appConfig(app.root, leg.transformer, [navePlugin()]),
          cacheDir: path.join(app.root, 'node_modules', '.vite'),
        },
        leg.api,
      )
      try {
        const page = await browser.newPage()
        await page.goto(url)
        const before = await computedOf(page, 3)
        expect(before[0]!.display).toBe('flex')
        expect(before[0]!.flexDirection).toBe('row')
        edit(
          server,
          path.join(app.root, 'src/card.module.css'),
          cssModuleFiles()['src/card.module.css']!.replace(
            '.box { composes: nave-flex from global; }',
            '.box { composes: nave-flex nave-flex-col from global; }',
          ),
        )
        // The edit reloads the page: the module's importer does not accept the update.
        await until(
          page,
          async () => (await directionOf(page)) === 'column',
          'the column direction',
        )
        await page.close()
      } finally {
        await stopDev(server)
        app.dispose()
      }
    }, 120_000)

    it('computes grid for a Vue <style module> that composes it from global, in the build and in dev', async () => {
      const files = {
        'src/Card.vue': `<template><div :class="$style['my-box']" /></template>
<style module>
.my-box { composes: nave-grid from global; }
.sel :global(.nave-block) { color: red; }
</style>
`,
        'src/main.ts': `import './app.css'
import { createApp } from 'vue'
import Card from './Card.vue'
createApp(Card).mount('#app')
`,
      }
      const built = makeUsedApp(appFiles(files))
      try {
        await buildToDisk(built.root, leg, [vuePlugin()])
        const preview = await previewBuild(built.root, 'dist')
        try {
          const [element] = await read(preview.url, 1)

          expect(element!.display).toBe('grid')
        } finally {
          await new Promise((resolve) => preview.server.httpServer.close(resolve))
        }
      } finally {
        built.dispose()
      }
      const app = makeUsedApp(appFiles(files))
      const { server, url } = await listenDev(
        {
          ...appConfig(app.root, leg.transformer, [vuePlugin(), navePlugin()]),
          cacheDir: path.join(app.root, 'node_modules', '.vite'),
        },
        leg.api,
      )
      try {
        const [element] = await read(url, 1)

        expect(element!.display).toBe('grid')
      } finally {
        await stopDev(server)
        app.dispose()
      }
    }, 120_000)
  },
)
