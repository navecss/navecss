/**
 * Builds a scratch Astro project (`astro-app.ts`) with Astro's programmatic `build()` in this
 * process, keeps what the build printed, and reads the stylesheets it wrote: the files under the
 * client output and the `<style>` elements of the pages it prerendered.
 */
import { build as astroBuild } from 'astro'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

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
  } catch (error_) {
    error = error_
  } finally {
    process.stdout.write = out
    process.stderr.write = err
  }
  return { error, text: chunks.join('') }
}

/**
 * The message of an error `build()` rejected with.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Turns Astro's telemetry off for this process.
 */
export function disableTelemetry(): void {
  process.env.ASTRO_TELEMETRY_DISABLED = '1'
}

/**
 * Builds `app` from a clean output directory, with telemetry off.
 */
export async function buildAstro(app: AstroApp): Promise<AstroBuilt> {
  disableTelemetry()
  const dist = path.join(app.root, 'dist')
  rmSync(dist, { force: true, recursive: true })
  const { error, text } = await captured(() => astroBuild({ root: app.root, logLevel: 'info' }))
  const failure = error === undefined ? undefined : messageOf(error)
  const server = app.settings.server === true ? path.join(dist, 'server') : undefined
  return {
    error: failure,
    output: [text, failure ?? '']
      .map((part) => stripVTControlCharacters(part))
      .filter(Boolean)
      .join('\n'),
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
    const names = readdirSync(path.join(directory, relative))
    for (const name of names) {
      const next = path.join(relative, name)
      if (statSync(path.join(directory, next)).isDirectory()) visit(next)
      else found.push(next)
    }
  }
  visit('')
  return found.toSorted((a, b) => a.localeCompare(b))
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
    if (file.endsWith('.html')) sheets.push(...inlineLayerSheets(file, text))
  }
  return sheets
}

/**
 * The `<style>` elements of the page `file` (its HTML is `text`) that hold the atomic layer.
 */
function inlineLayerSheets(file: string, text: string): LayerSheet[] {
  return text
    .matchAll(STYLE_ELEMENT)
    .filter((match) => match[1]!.includes('@layer atomic'))
    .map((match) => ({ name: `${file}#style`, css: match[1]!, page: file }))
    .toArray()
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
    if (!href?.startsWith('/')) continue
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
