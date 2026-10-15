/**
 * Builds a scratch Astro project (`astro-app.ts`) with Astro's programmatic `build()` in this
 * process, keeps what the build printed, and reads the stylesheets it wrote: the files under the
 * client output and the `<style>` elements of the pages it prerendered.
 */
import { build as astroBuild } from 'astro'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import type { AstroApp } from './astro-app.ts'

import { atomLayerAtoms } from './used-atoms-css.ts'

export interface AstroBuilt {
  /**
   * The message `build()` rejected with, if it did.
   */
  readonly error: string | undefined
  /**
   * Everything the build printed, and the error's message after it.
   */
  readonly output: string
  /**
   * The directory the browser's files are in.
   */
  readonly client: string
  /**
   * The directory the server's files are in, for a server project.
   */
  readonly server: string | undefined
}

/**
 * Runs `work` with the process's output streams captured, returning what was written to them.
 */
async function captured(work: () => Promise<void>): Promise<{ error: unknown; text: string }> {
  const chunks: string[] = []
  const out = process.stdout.write.bind(process.stdout)
  const err = process.stderr.write.bind(process.stderr)
  const take = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return true
  }) as typeof process.stdout.write
  process.stdout.write = take
  process.stderr.write = take
  let error: unknown
  try {
    await work()
  } catch (caught) {
    error = caught
  } finally {
    process.stdout.write = out
    process.stderr.write = err
  }
  return { error, text: chunks.join('') }
}

const ANSI = /\u001B\[[\d;]*m/g

/**
 * The message of an error `build()` rejected with.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Builds `app` from a clean output directory, with telemetry off.
 */
export async function buildAstro(app: AstroApp): Promise<AstroBuilt> {
  process.env['ASTRO_TELEMETRY_DISABLED'] = '1'
  const dist = path.join(app.root, 'dist')
  rmSync(dist, { force: true, recursive: true })
  const { error, text } = await captured(() => astroBuild({ root: app.root, logLevel: 'info' }))
  const failure = error === undefined ? undefined : messageOf(error)
  const server = app.settings.server === true ? path.join(dist, 'server') : undefined
  return {
    error: failure,
    output: [text.replaceAll(ANSI, ''), failure?.replaceAll(ANSI, '')].filter(Boolean).join('\n'),
    client: app.settings.server === true ? path.join(dist, 'client') : dist,
    server,
  }
}

/**
 * Every file under `directory`, as paths relative to it, sorted.
 */
export function filesUnder(directory: string): string[] {
  const found: string[] = []
  const visit = (relative: string): void => {
    for (const name of readdirSync(path.join(directory, relative))) {
      const next = path.join(relative, name)
      if (statSync(path.join(directory, next)).isDirectory()) visit(next)
      else found.push(next)
    }
  }
  visit('')
  return found.toSorted()
}

/**
 * A stylesheet holding the atomic layer: a CSS file under the client output, or a `<style>` of a
 * page. `page` is set for the second.
 */
export interface LayerSheet {
  readonly name: string
  readonly css: string
  readonly page?: string
}

const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/g

/**
 * Every stylesheet the build wrote that holds the atomic layer: the CSS files, then the inline
 * styles of prerendered pages.
 */
export function layerSheets(built: AstroBuilt): LayerSheet[] {
  const sheets: LayerSheet[] = []
  for (const file of filesUnder(built.client)) {
    const text = readFileSync(path.join(built.client, file), 'utf8')
    if (file.endsWith('.css') && text.includes('@layer atomic'))
      sheets.push({ name: file, css: text })
    if (file.endsWith('.html')) {
      for (const match of text.matchAll(STYLE_ELEMENT)) {
        if (match[1]!.includes('@layer atomic'))
          sheets.push({ name: `${file}#style`, css: match[1]!, page: file })
      }
    }
  }
  return sheets
}

/**
 * The atoms a stylesheet's atomic layer names, sorted.
 */
export function setOf(sheet: LayerSheet): string[] {
  return atomLayerAtoms(sheet.css)
}

/**
 * A stylesheet a page loads, in document order: a linked file or an inline `<style>`.
 */
export interface PageStyle {
  readonly kind: 'inline' | 'linked'
  /**
   * The file name under the client output, for a linked one.
   */
  readonly name: string
  readonly css: string
}

const STYLE_SOURCE = /<link\b[^>]*\brel="stylesheet"[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/g

/**
 * The stylesheets of `html` in document order, the linked ones read from the client output.
 */
export function stylesOf(built: AstroBuilt, html: string): PageStyle[] {
  const styles: PageStyle[] = []
  for (const match of html.matchAll(STYLE_SOURCE)) {
    const text = match[0]
    if (text.startsWith('<style')) {
      styles.push({
        kind: 'inline',
        name: '',
        css: /<style\b[^>]*>([\s\S]*?)<\/style>/.exec(text)![1]!,
      })
      continue
    }
    const href = /\bhref="([^"]+)"/.exec(text)?.[1]
    if (href === undefined || !href.startsWith('/')) continue
    const file = path.join(built.client, href.slice(1))
    styles.push({ kind: 'linked', name: href.slice(1), css: readFileSync(file, 'utf8') })
  }
  return styles
}

/**
 * The HTML of a page the build prerendered.
 */
export function prerenderedHtml(built: AstroBuilt, route: string): string {
  const relative = route === '/' ? 'index.html' : path.join(route.replace(/^\//, ''), 'index.html')
  return readFileSync(path.join(built.client, relative), 'utf8')
}

export interface Served {
  readonly url: string
  /**
   * The text of `route`, fetched from the server.
   */
  text(route: string): Promise<string>
  stop(): Promise<void>
}

/**
 * Starts the standalone Node server a server build wrote, on a free port, and resolves once it
 * listens.
 */
export async function serveServerBuild(app: AstroApp): Promise<Served> {
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(app.root, 'dist', 'server', 'entry.mjs')], {
    cwd: app.root,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let printed = ''
  child.stdout.on('data', (chunk: Buffer) => {
    printed += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    printed += chunk.toString()
  })
  const url = `http://127.0.0.1:${port}`
  for (let waited = 0; waited < 20_000; waited += 100) {
    if (child.exitCode !== null) throw new Error(`the server exited: ${printed}`)
    try {
      await fetch(url)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  return {
    url,
    text: async (route) => (await fetch(`${url}${route}`)).text(),
    stop: async () => {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    },
  }
}

/**
 * A port nothing listens on.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

/**
 * The stylesheets holding the atomic layer that `routes` load, with the route each came from, in
 * document order. A static project is read from the prerendered pages; a server project is
 * started, and each route is fetched from it.
 */
export async function layerStylesOfRoutes(
  app: AstroApp,
  built: AstroBuilt,
  routes: readonly string[],
): Promise<Record<string, PageStyle[]>> {
  const result: Record<string, PageStyle[]> = {}
  const server = app.settings.server === true ? await serveServerBuild(app) : undefined
  try {
    for (const route of routes) {
      const html = server ? await server.text(route) : prerenderedHtml(built, route)
      result[route] = stylesOf(built, html).filter((style) => style.css.includes('@layer atomic'))
    }
  } finally {
    await server?.stop()
  }
  return result
}
