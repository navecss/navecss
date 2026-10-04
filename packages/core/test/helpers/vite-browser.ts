/// <reference lib="dom" />
/**
 * A real Chromium for the used-atoms criteria that are about what a page renders: a dev server
 * (or a preview of a build) listening on a port of its own, a page that records, on every
 * animation frame, which classes an element carries and whether a stylesheet holds a rule for
 * each, and the console the page printed.
 */
import path from 'node:path'
import { type Browser, chromium, type Page } from 'playwright'
import {
  createLogger,
  type InlineConfig,
  type Logger,
  type PluginOption,
  preview,
  type PreviewServer,
  type ViteDevServer,
} from 'vite'

import { appConfig, VITE_APIS, type ViteApi } from './vite-app.ts'

/**
 * The dev server's config, its dependency cache under `node_modules` where Vite keeps it.
 */
export function devConfig(root: string, plugins: PluginOption[]): InlineConfig {
  return {
    ...appConfig(root, 'postcss', plugins),
    cacheDir: path.join(root, 'node_modules', '.vite'),
  }
}

/**
 * A logger that keeps every warning it is given, to hand to a server as its `customLogger`.
 */
export function warningLogger(): { readonly logger: Logger; readonly warned: string[] } {
  const warned: string[] = []
  const logger = createLogger('silent')
  logger.warn = (message) => {
    warned.push(message)
  }
  return { logger, warned }
}

/**
 * Starts the dev server for real, on a free port, resolving to it and its address.
 */
export async function listenDev(
  config: InlineConfig,
  api: ViteApi = VITE_APIS['8.2.1']!,
): Promise<{ readonly server: ViteDevServer; readonly url: string }> {
  const server = await api.createServer({
    ...config,
    server: { host: '127.0.0.1', port: 0, strictPort: false, ...config.server },
  })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('the dev server did not report an address')
  return { server, url }
}

/**
 * Serves the output a `vite build` wrote into `outDir` the way `vite preview` does.
 */
export async function previewBuild(
  root: string,
  outDir: string,
): Promise<{ readonly server: PreviewServer; readonly url: string }> {
  const server = await preview({
    root,
    configFile: false,
    logLevel: 'silent',
    build: { outDir: path.resolve(root, outDir) },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('the preview server did not report an address')
  return { server, url }
}

/**
 *
 */
export async function launchChromium(): Promise<Browser> {
  return chromium.launch()
}

/**
 * A page that records, on every animation frame from before any script runs, for each class in
 * `classes`: the first frame in which an element carried it (`first`) and whether a rule selecting
 * `.<class>` existed in a stylesheet on that frame (`ruled`). Read it back with `framesOf`.
 */
export async function recordFrames(page: Page, classes: readonly string[]): Promise<void> {
  await page.addInitScript((names: string[]) => {
    const seen: Record<string, boolean> = {}
    const recorded = new Set<string>()
    const w = globalThis as unknown as {
      __atSheet?: Record<string, boolean>
      __frames: Record<string, boolean>
    }
    w.__frames = seen
    const hasRule = (rules: CSSRuleList, selector: RegExp): boolean =>
      [...rules].some((rule) => {
        const text = (rule as CSSStyleRule).selectorText
        if (typeof text === 'string' && selector.test(text)) return true
        const inner = (rule as CSSGroupingRule).cssRules
        return inner ? hasRule(inner, selector) : false
      })
    const hasRuleFor = (name: string): boolean =>
      [...document.styleSheets].some((sheet) => {
        try {
          return hasRule(sheet.cssRules, new RegExp(String.raw`\.${name}(?![\w-])`))
        } catch {
          return false
        }
      })
    const tick = (): void => {
      // The first frame in which any stylesheet holds a rule of Nave's: which of the names have
      // theirs then, for an element the page carried from its first byte.
      if (w.__atSheet === undefined && names.some((name) => hasRuleFor(name))) {
        w.__atSheet = Object.fromEntries(names.map((name) => [name, hasRuleFor(name)]))
      }
      for (const name of names) {
        if (recorded.has(name) || document.querySelector(`.${name}`) === null) continue
        recorded.add(name)
        seen[name] = hasRuleFor(name)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, classes as string[])
}

/**
 * What `recordFrames` has seen so far: for each class an element has carried, whether its rule
 * existed on the first frame the element did.
 */
export async function framesOf(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(
    () => (globalThis as unknown as { __frames: Record<string, boolean> }).__frames,
  )
}

/**
 * For each class, whether its rule existed on the first frame any stylesheet held a rule for one
 * of the recorded classes: the answer for an element that was in the page from the start.
 */
export async function atFirstStylesheet(page: Page): Promise<Record<string, boolean> | undefined> {
  return page.evaluate(
    () => (globalThis as unknown as { __atSheet?: Record<string, boolean> }).__atSheet,
  )
}

/**
 * Whether a stylesheet of the page holds a rule that selects `.<name>` right now.
 */
export function hasRuleNow(page: Page, name: string): Promise<boolean> {
  return page.evaluate((target) => {
    const walk = (rules: CSSRuleList): boolean =>
      [...rules].some((rule) => {
        const text = (rule as CSSStyleRule).selectorText
        if (typeof text === 'string' && new RegExp(String.raw`\.${target}(?![\w-])`).test(text)) {
          return true
        }
        const inner = (rule as CSSGroupingRule).cssRules
        return inner ? walk(inner) : false
      })
    return [...document.styleSheets].some((sheet) => {
      try {
        return walk(sheet.cssRules)
      } catch {
        return false
      }
    })
  }, name)
}

/**
 * The text of every console message the page prints, from now on.
 */
export function consoleOf(page: Page): string[] {
  const lines: string[] = []
  page.on('console', (message) => {
    lines.push(message.text())
  })
  return lines
}

/**
 * Waits until `done` is true, polling the page, and fails with `what` after `ms`.
 */
export async function until(
  page: Page,
  isDone: () => Promise<boolean>,
  what: string,
  ms = 8000,
): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await isDone()) return
    await page.waitForTimeout(25)
  }
  throw new Error(`timed out waiting for ${what}`)
}

/**
 * `until`, giving up without an error: for a wait whose outcome the test reads afterwards.
 */
export async function untilQuietly(
  page: Page,
  isDone: () => Promise<boolean>,
  what: string,
  ms = 8000,
): Promise<void> {
  try {
    await until(page, isDone, what, ms)
  } catch {
    // The test reads what the page holds, whether or not the wait ended.
  }
}
