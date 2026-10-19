/// <reference lib="dom" />
/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/**
 * AC-astro-20 and AC-astro-22: `astro dev` serves what `astro build` would emit once the page's
 * scripts have loaded, and the README's dev residual is true: the first paint holds the stylesheet
 * as Vite's CSS step left it.
 */
import type { Browser, Page } from 'playwright'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { AstroApp, AstroAppSettings, Patch } from '../../helpers/astro-app.ts'

import { makeAstroApp } from '../../helpers/astro-app.ts'
import { hasAttribute, isPresent, readSettled } from '../../helpers/astro-browser.ts'
import { ALL_ATOMS, BROWSER_KEEP, eSet, setOfCss } from '../../helpers/astro-checks.ts'
import { serveDev } from '../../helpers/astro-serve.ts'
import { launchChromium, until } from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()
const cleanups: (() => Promise<void> | void)[] = []

afterAll(async () => {
  for (const cleanup of cleanups.toReversed()) await cleanup()
  await browser.close()
}, 60_000)

const SECOND = 180_000

/**
 * The scratch copy whose raw-class match reads a module that holds only a serialised stylesheet.
 */
const READS_SERIALISED_CSS: Patch = {
  file: 'vite-collect-module.ts',
  from: 'if (isSerialisedStylesheet(code)) return false',
  to: '',
}

/**
 * Serves a project with `astro dev`.
 */
async function serve(settings: AstroAppSettings): Promise<{ app: AstroApp; url: string }> {
  const app = makeAstroApp(settings)
  cleanups.push(() => {
    app.dispose()
  })
  const running = await serveDev(app)
  cleanups.push(() => running.stop())
  return { app, url: running.url }
}

/**
 * The text of the style the page holds for `app.css`.
 */
async function stylesheetOf(page: Page): Promise<string> {
  return await readSettled(page, () =>
    page.evaluate(() => {
      const texts: (string | null)[] = []
      document.querySelectorAll<HTMLElement>('style[data-vite-dev-id]').forEach((element) => {
        if (element.dataset.viteDevId?.endsWith('src/styles/app.css'))
          texts.push(element.textContent)
      })
      return texts.join('\n')
    }),
  )
}

/**
 * Loads `route` and waits until the scripts the fixture's pages run have run.
 */
async function load(url: string, route: '/' | '/about'): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(`${url}${route}`)
  const isIndexReady = async (): Promise<boolean> =>
    (await hasAttribute(page, '#load', 'data-hydrated')) &&
    (await hasAttribute(page, '#onlyisland', 'data-hydrated')) &&
    (await page.evaluate(
      () => document.querySelector('#lazy')?.className.includes('nave-w-full') === true,
    )) &&
    (await page.evaluate(
      () => document.querySelector('#s')?.className.includes('nave-truncate') === true,
    ))
  const readiness = route === '/' ? isIndexReady : () => isPresent(page, '#r')
  await until(page, () => readSettled(page, readiness), `the scripts of ${route}`)
  return page
}

/**
 * The set the dev server serves for `app.css` after both pages were read, on a fresh load of `/`.
 */
async function settledSet(url: string): Promise<string[]> {
  const index = await load(url, '/')
  await index.close()
  const about = await load(url, '/about')
  await about.close()
  const page = await load(url, '/')
  await page.waitForTimeout(500)
  const css = await stylesheetOf(page)
  await page.close()
  return setOfCss(css)
}

describe('AC-astro-20 — astro dev serves what astro build would emit, once the page’s scripts have loaded', () => {
  it(
    'serves E once both pages have been read',
    async () => {
      const dev = await serve({ options: BROWSER_KEEP })
      expect(await settledSet(dev.url)).toEqual(eSet())
    },
    SECOND,
  )

  it(
    'control: a copy that reads Astro’s dev CSS module as an application module serves every built-in atom',
    async () => {
      const dev = await serve({ options: BROWSER_KEEP, scratch: [READS_SERIALISED_CSS] })
      expect(await settledSet(dev.url)).toEqual(ALL_ATOMS)
    },
    SECOND,
  )
})

describe('AC-astro-34 — the dev server does not phone home', () => {
  it(
    'starts with telemetry off',
    async () => {
      const log = 'telemetry.log'
      const dev = await serve({
        integrations: `{ name: 'record', hooks: { 'astro:config:setup': async ({ config }) => { (await import('node:fs')).appendFileSync(config.root.pathname.replace(/\\/?$/, '/') + '${log}', \`\${globalThis.process.env.ASTRO_TELEMETRY_DISABLED}\\n\`) } } }`,
      })
      // One line per start. serveDev watches no file, so the server does not restart when its
      // config file changes; a start it made again would have to have telemetry off too.
      const starts = readFileSync(path.join(dev.app.root, log), 'utf8').trim().split('\n')
      expect(starts.length).toBeGreaterThan(0)
      expect(new Set(starts)).toEqual(new Set(['1']))
    },
    SECOND,
  )
})

describe('AC-astro-22 — the README’s dev residual is true: the first paint holds every atom and @nave unexpanded', () => {
  it(
    'holds @nave breakWord and every atom before any script runs, and neither after',
    async () => {
      const dev = await serve({ options: BROWSER_KEEP })
      const about = await load(dev.url, '/about')
      await about.close()
      const response = await fetch(`${dev.url}/`)
      const html = await response.text()
      const first = html
        .matchAll(
          /<style[^>]*data-vite-dev-id="[^"]*src\/styles\/app\.css"[^>]*>([\s\S]*?)<\/style>/g,
        )
        .map((match) => match[1]!)
        .toArray()
        .join('\n')
      expect(first).toContain('@nave breakWord')
      expect(setOfCss(first)).toEqual(ALL_ATOMS)

      const page = await load(dev.url, '/')
      await page.waitForTimeout(500)
      const after = await stylesheetOf(page)
      // The dev stylesheet keeps its comments, which mention the directive; the one in the page does not.
      expect(after).not.toContain('@nave breakWord')
      expect(after).toMatch(/\.card\s*\{[^}]*overflow-wrap:\s*break-word/)
      expect(setOfCss(after)).toEqual(eSet())
      await page.close()
    },
    SECOND,
  )
})
