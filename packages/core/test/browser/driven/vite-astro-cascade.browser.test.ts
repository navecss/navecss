/**
 * AC-astro-24 and AC-astro-25: the cascade contract on Astro. Without the order statement first in
 * a layout's head the shapes the README names invert in a build, and dev does not show it; with it
 * every shape holds, in the build, in dev and across soft navigations.
 */
import type { Browser } from 'playwright'

import { afterAll, describe, expect, it } from 'vitest'

import type { AstroApp } from '../../helpers/astro-app.ts'
import type { Running } from '../../helpers/astro-serve.ts'

import { makeAstroApp } from '../../helpers/astro-app.ts'
import { isMarked, isPresent, markPage, readSettled, styleOf } from '../../helpers/astro-browser.ts'
import { buildAstro } from '../../helpers/astro-build.ts'
import { BROWSER_KEEP } from '../../helpers/astro-checks.ts'
import { previewStatic, serveDev } from '../../helpers/astro-serve.ts'
import { shapeFiles, SHAPES } from '../../helpers/astro-shapes.ts'
import { launchChromium, until } from '../../helpers/vite-browser.ts'

const browser: Browser = await launchChromium()
const cleanups: (() => Promise<void> | void)[] = []

afterAll(async () => {
  for (const cleanup of cleanups.toReversed()) await cleanup()
  await browser.close()
}, 60_000)

const SECOND = 180_000

/**
 * The shapes' project, built and previewed, or served by the dev server.
 */
async function site(
  hasRemedy: boolean,
  how: 'build' | 'dev',
): Promise<Running & { app: AstroApp }> {
  const app = makeAstroApp({ options: BROWSER_KEEP, files: shapeFiles(hasRemedy) })
  cleanups.push(() => {
    app.dispose()
  })
  if (how === 'build') {
    const built = await buildAstro(app)
    if (built.error !== undefined) throw new Error(built.error)
  }
  const running = how === 'build' ? await previewStatic(app) : await serveDev(app)
  cleanups.push(() => running.stop())
  return { ...running, app }
}

/**
 * What `#c` computes `display` to on the page `route`, once the page has settled.
 */
async function displayOf(url: string, route: string): Promise<string> {
  const page = await browser.newPage()
  try {
    await page.goto(`${url}${route}`)
    await until(
      page,
      () => readSettled(page, () => isPresent(page, '#c')),
      `#c on ${route}`,
      20_000,
    )
    await page.waitForTimeout(300)
    return await readSettled(page, () => styleOf(page, '#c', 'display'))
  } finally {
    await page.close()
  }
}

describe('AC-astro-24 — without the remedy, the shapes the README names invert in the build, and dev does not show it', () => {
  it(
    'computes flex on p1, p2, p6 and p9 in the build, and keeps p8 flex after a soft navigation from p9',
    async () => {
      const built = await site(false, 'build')
      for (const shape of ['p1', 'p2', 'p6', 'p9']) {
        expect(await displayOf(built.url, `/c/${shape}/`), shape).toBe('flex')
      }
      const page = await browser.newPage()
      await page.goto(`${built.url}/c/p9/`)
      await until(page, () => isPresent(page, '#to-p8'), 'the navigation')
      await markPage(page)
      await page.click('#to-p8')
      await until(
        page,
        () => Promise.resolve(new URL(page.url()).pathname === '/c/p8/'),
        'the p8 page',
      )
      expect(await isMarked(page), 'the navigation was soft').toBe(true)
      await page.waitForTimeout(300)
      expect(await styleOf(page, '#c', 'display')).toBe('flex')
      await page.close()
    },
    SECOND,
  )

  it(
    'computes grid on p1, p2 and p9 in dev',
    async () => {
      const dev = await site(false, 'dev')
      for (const shape of ['p1', 'p2', 'p9']) {
        expect(await displayOf(dev.url, `/c/${shape}/`), shape).toBe('grid')
      }
    },
    SECOND,
  )
})

describe('AC-astro-25 — with the remedy, every shape holds in the build, in dev and across soft navigations', () => {
  it(
    'computes grid on all nine pages in the build, and the soft navigations keep it',
    async () => {
      const built = await site(true, 'build')
      for (const shape of SHAPES) {
        expect(await displayOf(built.url, `/c/${shape}/`), shape).toBe('grid')
      }
      const page = await browser.newPage()
      await page.goto(`${built.url}/c/p2/`)
      await until(page, () => isPresent(page, '#to-p1'), 'the navigation')
      await markPage(page)
      for (const [from, to] of [
        ['p2', 'p1'],
        ['p1', 'p8'],
        ['p8', 'p9'],
      ] as const) {
        expect(new URL(page.url()).pathname).toBe(`/c/${from}/`)
        await page.click(`#to-${to}`)
        await until(
          page,
          () => Promise.resolve(new URL(page.url()).pathname === `/c/${to}/`),
          `the ${to} page`,
        )
        expect(await isMarked(page), `the navigation to ${to} was soft`).toBe(true)
        await page.waitForTimeout(300)
        expect(await styleOf(page, '#c', 'display'), `after the navigation to ${to}`).toBe('grid')
      }
      await page.goto(`${built.url}/`)
      await page.close()
    },
    SECOND,
  )

  it(
    'computes grid on all nine pages in dev',
    async () => {
      const dev = await site(true, 'dev')
      for (const shape of SHAPES) {
        expect(await displayOf(dev.url, `/c/${shape}/`), shape).toBe('grid')
      }
    },
    SECOND,
  )
})
