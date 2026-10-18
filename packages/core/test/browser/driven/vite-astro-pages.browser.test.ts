/// <reference lib="dom" />
/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/**
 * The Astro criteria that need a browser and a built site (AC-astro-27 to -30, -32): islands
 * hydrate styled, a `ClientRouter` navigation keeps styles both ways, server output served by the
 * Node adapter styles a dynamic page, a deferred island and a prerendered page, the
 * screen-reader pair reveals on focus, and an island a navigation keeps stays styled.
 */
import type { Browser, Page } from 'playwright'

import { afterAll, describe, expect, it } from 'vitest'

import type { AstroApp, AstroAppSettings } from '../../helpers/astro-app.ts'
import type { Running } from '../../helpers/astro-serve.ts'

import { makeAstroApp } from '../../helpers/astro-app.ts'
import {
  computedOf,
  hasAttribute,
  isMarked,
  isPresent,
  markPage,
  styleOf,
} from '../../helpers/astro-browser.ts'
import { buildAstro } from '../../helpers/astro-build.ts'
import { BROWSER_KEEP } from '../../helpers/astro-checks.ts'
import { BASE_FILES, NO_RENAME_FILES, SERVER_FILES } from '../../helpers/astro-files.ts'
import { previewStatic, serveServerBuild } from '../../helpers/astro-serve.ts'
import { launchChromium, until } from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()
const cleanups: (() => Promise<void> | void)[] = []

afterAll(async () => {
  for (const cleanup of cleanups.toReversed()) await cleanup()
  await browser.close()
}, 60_000)

const ALL = "{ atomic: 'all' }"

/**
 * Builds the project and serves it: a static one with Astro's `preview()`, a server one with the
 * Node adapter's own entry.
 */
async function serve(settings: AstroAppSettings): Promise<Running & { app: AstroApp }> {
  const app = makeAstroApp(settings)
  cleanups.push(() => {
    app.dispose()
  })
  const built = await buildAstro(app)
  if (built.error !== undefined) throw new Error(built.error)
  const running: Running = settings.server ? await serveServerBuild(app) : await previewStatic(app)
  cleanups.push(() => running.stop())
  return { ...running, app }
}

const STYLED: (readonly [string, string])[] = [
  ['#fm', 'block'],
  ['#t', 'flex'],
  ['#raw', 'textCenter'],
  ['#card', 'breakWord'],
  ['#onlyisland', 'inlineFlex'],
  ['#lazy', 'wFull'],
  ['#s', 'truncate'],
  ['#load', 'grid'],
  ['#idle', 'justifyCenter'],
  ['#media', 'flexWrap'],
  ['#visible', 'itemsEnd'],
]
const SECOND = 180_000

/**
 * Loads `/` and waits until the islands hydrated and the code only the browser runs has acted.
 */
async function loadIndex(url: string): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(`${url}/`)
  await until(
    page,
    async () =>
      (await hasAttribute(page, '#load', 'data-hydrated')) &&
      (await hasAttribute(page, '#idle', 'data-hydrated')) &&
      (await hasAttribute(page, '#media', 'data-hydrated')) &&
      (await hasAttribute(page, '#onlyisland', 'data-hydrated')) &&
      (await styleOf(page, '#lazy', 'width')) !== 'auto' &&
      (await page.evaluate(
        () => document.querySelector('#lazy')?.className.includes('nave-w-full') === true,
      )) &&
      (await page.evaluate(
        () => document.querySelector('#s')?.className.includes('nave-truncate') === true,
      )),
    'the islands to hydrate',
    20_000,
  )
  return page
}

describe('AC-astro-27 — islands hydrate styled, and ClientRouter keeps styles both ways', () => {
  it(
    'styles every element as the all build does, hydrating Visible only when it is seen',
    async () => {
      const used = await serve({ options: BROWSER_KEEP })
      const all = await serve({ options: ALL })
      const page = await loadIndex(used.url)
      const reference = await loadIndex(all.url)
      expect(await hasAttribute(page, '#visible', 'data-hydrated')).toBe(false)
      await page.evaluate(() => document.querySelector('#visible')?.scrollIntoView())
      await reference.evaluate(() => document.querySelector('#visible')?.scrollIntoView())
      await until(page, () => hasAttribute(page, '#visible', 'data-hydrated'), 'Visible to hydrate')
      await until(
        reference,
        () => hasAttribute(reference, '#visible', 'data-hydrated'),
        'Visible to hydrate',
      )
      const styled = await computedOf(page, STYLED)
      expect(styled).toEqual(await computedOf(reference, STYLED))
      expect(styled['#load']!.display).toBe('grid')
      expect(styled['#t']!.display).toBe('flex')
      expect(styled['#onlyisland']!.display).toBe('inline-flex')
      await page.close()
      await reference.close()
    },
    SECOND,
  )

  it(
    'keeps every element styled across a soft navigation to /about and back',
    async () => {
      const used = await serve({ options: BROWSER_KEEP, clientRouter: true })
      const page = await loadIndex(used.url)
      await markPage(page)
      await page.click('#to-about')
      await until(page, () => isPresent(page, '#r'), 'the about page')
      expect(await isMarked(page), 'the navigation was soft').toBe(true)
      expect(await styleOf(page, '#r', 'position')).toBe('relative')
      await page.click('#to-index')
      await until(page, () => hasAttribute(page, '#load', 'data-hydrated'), 'the index page')
      expect(await isMarked(page), 'the navigation back was soft').toBe(true)
      const styled = await computedOf(
        page,
        STYLED.filter(([selector]) => selector !== '#visible'),
      )
      expect(styled['#t']!.display).toBe('flex')
      expect(styled['#load']!.display).toBe('grid')
      expect(styled['#card']!['overflow-wrap']).toBe('break-word')
      await page.close()
    },
    SECOND,
  )
})

describe('AC-astro-28 — server output served by @astrojs/node: a dynamic page, a deferred island and a prerendered page, styled', () => {
  it.each([
    ['the rename shape', {}],
    ['the no-rename shape', NO_RENAME_FILES],
  ])(
    '%s',
    async (_name, files) => {
      const site = await serve({
        server: true,
        prerendered: true,
        options: BROWSER_KEEP,
        files,
      })
      const page = await browser.newPage()
      const dyn = await page.goto(`${site.url}/dyn`)
      expect(dyn?.status()).toBe(200)
      await until(page, () => isPresent(page, '#d'), 'the deferred island', 20_000)
      expect(await styleOf(page, '#a', 'position')).toBe('absolute')
      expect(await styleOf(page, '#d', 'min-width')).toBe('0px')
      expect(await styleOf(page, '#d', 'flex-direction')).toBe('column')
      const pre = await page.goto(`${site.url}/pre`)
      expect(pre?.status()).toBe(200)
      expect(await styleOf(page, '#p', 'border-top-left-radius')).toBe('9999px')
      const index = await page.goto(`${site.url}/`)
      expect(index?.status()).toBe(200)
      expect(await styleOf(page, '#t', 'display')).toBe('flex')
      expect(await styleOf(page, '#fm', 'display')).toBe('block')
      await page.close()
    },
    SECOND,
  )
})

const SKIP_LAYOUT = (classes: string): string =>
  BASE_FILES['src/layouts/Layout.astro']!.replace(
    '<body><slot /></body>',
    () =>
      `<body><a id="skip" href="#main" class="${classes}">Skip</a><main id="main"><slot /></main></body>`,
  )

/**
 * The geometry that tells a hidden skip link from a shown one.
 */
async function geometry(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      ['width', 'height', 'clip-path', 'outline-style', 'outline-width'].map(
        async (property) => [property, await styleOf(page, '#skip', property)] as const,
      ),
    ),
  )
}

describe('AC-astro-29 and AC-astro-30 — a skip link in an .astro layout is revealed on focus as in the all build', () => {
  it.each([
    ['L1, the lone nave-sr-only-focusable', 'nave-sr-only-focusable'],
    ['L2, the two-class idiom', 'nave-sr-only nave-sr-only-focusable'],
  ])(
    '%s',
    async (_name, classes) => {
      const files = { 'src/layouts/Layout.astro': SKIP_LAYOUT(classes) }
      const used = await serve({ options: BROWSER_KEEP, files })
      const all = await serve({ options: ALL, files })
      const page = await browser.newPage()
      const reference = await browser.newPage()
      await page.goto(`${used.url}/about`)
      await reference.goto(`${all.url}/about`)
      const hidden = await geometry(page)
      expect(hidden).toEqual(await geometry(reference))
      expect(hidden.width).toBe('1px')
      await page.keyboard.press('Tab')
      await reference.keyboard.press('Tab')
      const shown = await geometry(page)
      expect(shown).toEqual(await geometry(reference))
      expect(shown['clip-path']).toBe('none')
      expect(shown['outline-style']).not.toBe('none')
      await page.close()
      await reference.close()
    },
    SECOND,
  )

  it(
    'a server:defer-only atom is styled once the island arrives, with no prerendered page',
    async () => {
      const site = await serve({ server: true, options: BROWSER_KEEP })
      const page = await browser.newPage()
      await page.goto(`${site.url}/dyn`)
      await until(page, () => isPresent(page, '#d'), 'the deferred island', 20_000)
      expect(await styleOf(page, '#d', 'min-width')).toBe('0px')
      await page.close()
    },
    SECOND,
  )
})

const KEEP_ISLAND = `import { useState } from 'react'
import { cx } from '@navecss/core/cx'

export default function Keep() {
  const [open, setOpen] = useState(false)
  return (
    <button id="keep" type="button" className={open ? cx('gap', 'noWrap') : cx('gap')} onClick={() => setOpen(true)}>
      {open ? 'open' : 'closed'}
    </button>
  )
}
`
const WITH_KEEP = (source: string): string =>
  source
    .replace(
      "import Layout from '../layouts/Layout.astro'",
      "import Layout from '../layouts/Layout.astro'\nimport Keep from '../components/Keep.tsx'",
    )
    .replace(
      '</Layout>',
      '  <Keep client:load transition:persist="k" />\n  <a id="to-other" href="/other">other</a>\n</Layout>',
    )

describe('AC-astro-32 — an island transition:persist keeps across a ClientRouter navigation stays styled, both directions', () => {
  it(
    'keeps the gap and noWrap styles from /pre to /dyn and back, and from /dyn to /pre',
    async () => {
      const files = {
        ...NO_RENAME_FILES,
        'src/components/Keep.tsx': KEEP_ISLAND,
        'src/pages/pre.astro': WITH_KEEP(NO_RENAME_FILES['src/pages/pre.astro']!).replace(
          '/other',
          '/dyn',
        ),
        'src/pages/dyn.astro': WITH_KEEP(SERVER_FILES['src/pages/dyn.astro']!).replace(
          '/other',
          '/pre',
        ),
      }
      const site = await serve({
        server: true,
        prerendered: true,
        options: BROWSER_KEEP,
        clientRouter: true,
        files,
      })
      for (const [start, other] of [
        ['/pre', '/dyn'],
        ['/dyn', '/pre'],
      ] as const) {
        const page = await browser.newPage()
        await page.goto(`${site.url}${start}`)
        await until(page, () => hasAttribute(page, '#keep', 'type'), 'the island')
        await page.click('#keep')
        await until(
          page,
          async () => (await page.textContent('#keep')) === 'open',
          'the island to open',
        )
        await markPage(page)
        await page.evaluate(() => {
          // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a property of `window` holds the node: the check is that a navigation keeps this very object
          ;(globalThis as unknown as { __node?: Element | null }).__node =
            document.querySelector('#keep')
        })
        for (const to of [other, start]) {
          await page.click('#to-other')
          await until(
            page,
            () => Promise.resolve(new URL(page.url()).pathname === to),
            `navigation to ${to}`,
          )
          await until(page, () => isPresent(page, '#keep'), 'the island')
          expect(await isMarked(page), 'the navigation was soft').toBe(true)
          expect(
            await page.evaluate(
              () =>
                (globalThis as unknown as { __node?: Element | null }).__node ===
                document.querySelector('#keep'),
            ),
            'the island’s node is the same object',
          ).toBe(true)
          expect(await styleOf(page, '#keep', 'gap')).toBe('16px')
          expect(await styleOf(page, '#keep', 'white-space')).toBe('nowrap')
        }
        await page.close()
      }
    },
    SECOND * 2,
  )
})
