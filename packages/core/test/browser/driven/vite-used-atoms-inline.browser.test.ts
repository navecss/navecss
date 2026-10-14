/**
 * What a page renders from a build that inlines each `cx()` call (AC-used-atoms-21, -22 and -59),
 * in a real Chromium against `vite preview`: every class string equals the one the build that
 * keeps the run-time functions renders for the same fixture.
 */
import type { Browser } from 'playwright'
import type { PluginOption } from 'vite'

import vuePlugin from '@vitejs/plugin-vue'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin, type NaveViteOptions } from '../../../src/vite.ts'
import { addPackage, appFiles, makeUsedApp } from '../../helpers/used-atoms-app.ts'
import { withoutRewrite } from '../../helpers/used-atoms-unrewritten.ts'
import { appConfig } from '../../helpers/vite-app.ts'
import { launchChromium, previewBuild, until } from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()

afterAll(async () => {
  await browser.close()
}, 60_000)

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIN_LIB = readFileSync(
  path.join(HERE, '../../fixtures/generated/minified-dependencies/min-lib.js.txt'),
  'utf8',
)
const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const OPTIONS: NaveViteOptions = {
  keep: ['grid', 'inlineFlex'],
  keepFor: { 'wide-lib': ['block'] },
}

const CARD = `<script setup lang="ts">
import { cx } from '@navecss/core/cx'
const props = defineProps<{ on: boolean }>()
const v = 'grid'
</script>
<template><div :class="cx('flex', props.on && 'itemsCenter', v)"><span :class="cx.raw('legacy')" /></div></template>
`

/**
 * An app that writes every class string its calls return into `window.__strings`.
 */
function makeFixture(): ReturnType<typeof makeUsedApp> {
  const app = makeUsedApp(
    appFiles(
      {
        'src/Card.vue': CARD,
        'src/main.ts': `import './app.css'
import { createApp } from 'vue'
import Card from './Card.vue'
import { a as minA, b as minB } from 'min-lib'
import { a as wideA, b as wideB } from 'wide-lib'
${IMPORT}
const on = location.search === '?on'
const host = document.createElement('div')
document.body.append(host)
createApp(Card, { on }).mount(host)
const tone = (name: string) => name as 'grid'
;(window as unknown as { __strings: unknown }).__strings = {
  card: host.firstElementChild?.className,
  app: [cx('flex', on && 'grid'), cx('flex', null), cx(), cx.raw('legacy', on && 'x'), cx['raw']('y')],
  min: [minA(true), minA(false), minB()],
  dynamic: [cx.dynamic(tone('grid')), cx.dynamic(tone('flex')), cx.dynamic(tone('inlineFlex')), cx.dynamic(tone('block'))],
  wide: [wideA('block'), wideA('grid'), wideB('block'), wideB('grid')],
}
`,
      },
      ['src/main.ts'],
    ),
  )
  addPackage(app, 'min-lib', { 'index.js': MIN_LIB })
  addPackage(app, 'wide-lib', {
    'index.js': `${IMPORT}export const a = (v) => cx(v)\nexport const b = (t) => cx.dynamic(t)\n`,
  })
  return app
}

/**
 * Builds the app into `outDir` with `nave`, for `vite preview`.
 */
async function buildToDisk(root: string, outDir: string, nave: PluginOption): Promise<void> {
  await build({
    ...appConfig(root, 'postcss', [vuePlugin(), nave]),
    build: { write: true, outDir, cssTarget: ['chrome125'] },
  })
}

/**
 * The JavaScript a build wrote into `outDir`, whole.
 */
function scriptsOf(root: string, outDir: string): string {
  const assets = path.join(root, outDir, 'assets')
  return readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(path.join(assets, name), 'utf8'))
    .join('\n')
}

/**
 * The strings the built page wrote, for the query `search`.
 */
async function stringsOf(root: string, outDir: string, search: string): Promise<unknown> {
  const { server, url } = await previewBuild(root, outDir)
  try {
    const page = await browser.newPage()
    await page.goto(`${url}${search}`)
    await until(
      page,
      async () =>
        (await page.evaluate(
          () => (globalThis as unknown as { __strings?: unknown }).__strings,
        )) !== undefined,
      'the strings',
    )
    const strings = await page.evaluate(
      () => (globalThis as unknown as { __strings: unknown }).__strings,
    )
    await page.close()
    return strings
  } finally {
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
}

describe('AC-used-atoms-21, -22 and -59 — the page renders the strings the run-time calls give', () => {
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  })

  it.each(['?on', '?off'])(
    'every string equals the one the build that keeps cx() renders (%s)',
    async (search) => {
      const app = makeFixture()
      try {
        await buildToDisk(app.root, 'dist-inlined', navePlugin(OPTIONS))
        await buildToDisk(app.root, 'dist-runtime', withoutRewrite(OPTIONS))

        // A guard that the two builds differ, so the comparison below can see a rewrite.
        expect(scriptsOf(app.root, 'dist-inlined')).not.toBe(scriptsOf(app.root, 'dist-runtime'))
        const inlined = await stringsOf(app.root, 'dist-inlined', search)
        const runtime = await stringsOf(app.root, 'dist-runtime', search)

        expect(inlined).toEqual(runtime)
        const strings = inlined as Record<string, unknown>
        expect(strings.dynamic).toEqual(['nave-grid', '', 'nave-inline-flex', 'nave-block'])
        expect(strings.wide).toEqual(['nave-block', 'nave-grid', 'nave-block', 'nave-grid'])
        expect((strings.app as string[]).slice(0, 3)).toEqual([
          search === '?on' ? 'nave-flex nave-grid' : 'nave-flex',
          'nave-flex',
          '',
        ])
        expect(strings.card).toBe(
          search === '?on' ? 'nave-flex nave-items-center nave-grid' : 'nave-flex nave-grid',
        )
      } finally {
        app.dispose()
      }
    },
  )
})
