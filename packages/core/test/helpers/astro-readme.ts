/**
 * Core's README `#### Astro` subsection, read for the tests that pin it, and the lockfile's
 * answer to which Astro and Vite the Astro fixture runs. Node only: `fs` and `path`, no parser.
 * Not a test file and registers no tests.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractFences, type Fence } from '../doc-fences.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const ASTRO_HEADING = '#### Astro'

/**
 * Core's README, as it is on disk.
 */
export function readCoreReadme(): string {
  return readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
}

/**
 * The workspace's `pnpm-lock.yaml`, as it is on disk.
 */
export function readLockfile(): string {
  return readFileSync(path.join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8')
}

/**
 * The code fence still open after `line`, given the one open before it: three or more backticks
 * or tildes open one, and a line of the same character, at least as long and with nothing after
 * it, closes it.
 */
function fenceAfter(open: string | undefined, line: string): string | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line)
  const marker = match?.[1]
  if (open === undefined) return marker
  const isClosing = marker?.startsWith(open) === true && line.slice(match![0].length).trim() === ''
  return isClosing ? undefined : open
}

/**
 * The heading line and everything under it, up to the next heading of the same or a shallower
 * level, without trailing whitespace. A line inside a fence is never a heading. Throws when the
 * heading is missing.
 */
export function readmeSection(heading: string, readme: string = readCoreReadme()): string {
  const level = /^#+/.exec(heading)![0].length
  const lines = readme.split('\n')
  const start = lines.indexOf(heading)
  if (start === -1) throw new Error(`core README has no "${heading}" heading`)
  const ends = new RegExp(`^#{1,${level}} `)
  let open: string | undefined
  let end = lines.length
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]!
    if (open === undefined && ends.test(line)) {
      end = index
      break
    }
    open = fenceAfter(open, line)
  }
  return lines.slice(start, end).join('\n').trimEnd()
}

/**
 * The `#### Astro` subsection: its heading line to the next heading of level 4 or shallower.
 */
export function astroSection(): string {
  return readmeSection(ASTRO_HEADING)
}

/**
 * The first fence of the Astro subsection tagged `lang`.
 */
function astroFence(lang: string): Fence {
  const found = extractFences('README.md', astroSection()).find((fence) => fence.lang === lang)
  if (found === undefined) throw new Error(`the Astro subsection holds no ${lang} fence`)
  return found
}

/**
 * The body of the `js` fence, one newline per line as the README has it.
 */
export function astroConfigFence(): string {
  return astroFence('js').body
}

/**
 * The `<style is:inline>…</style>` line of the `astro` fence, without its indentation.
 */
export function orderStatementLine(): string {
  const line = astroFence('astro')
    .body.split('\n')
    .map((text) => text.trim())
    .find((text) => text.startsWith('<style is:inline>') && text.endsWith('</style>'))
  if (line === undefined) throw new Error('the astro fence holds no <style is:inline> line')
  return line
}

/**
 * One paragraph of the Astro subsection as written, line breaks included, found by how it opens.
 */
export function astroParagraph(opening: string): string {
  const found = astroSection()
    .split('\n\n')
    .find((paragraph) => paragraph.startsWith(opening))
  if (found === undefined)
    throw new Error(`no paragraph of the Astro subsection opens "${opening}"`)
  return found
}

/**
 * A stylesheet's one statement: comments removed, surrounding whitespace trimmed.
 */
export function layersStatementOf(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, '').trim()
}

/**
 * The order statement `@navecss/core/layers` ships.
 */
export function layersStatement(): string {
  return layersStatementOf(readFileSync(path.join(CORE_ROOT, 'src/layers.css'), 'utf8'))
}

/**
 * The sentences of `text`, whitespace folded and split at a period followed by whitespace or
 * the end, that hold "not covered" after "Astro".
 */
export function astroNotCoveredSentences(text: string): string[] {
  return text
    .replaceAll(/\s+/g, ' ')
    .split(/\.(?=\s|$)/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const lower = sentence.toLowerCase()
      return lower.includes('astro') && lower.lastIndexOf('not covered') > lower.indexOf('astro')
    })
}

/**
 * The lines of the block under `header` (an entry at two spaces' indent), up to the next entry
 * at that indent.
 */
function blockOf(lines: readonly string[], header: string): string[] {
  const start = lines.indexOf(header)
  if (start === -1) throw new Error(`pnpm-lock.yaml has no "${header.trim()}"`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line))
  return end === -1 ? rest : rest.slice(0, end)
}

/**
 * The text after `key` on the first line of `block` that starts with it.
 */
function valueAfter(block: readonly string[], key: string): string {
  const line = block.find((text) => text.startsWith(key))
  if (line === undefined) throw new Error(`pnpm-lock.yaml: no "${key.trim()}" where expected`)
  return line.slice(key.length)
}

const withoutPeers = (version: string): string => version.replace(/\(.*$/, '')

/**
 * The Astro version a lockfile resolves for core's `astro` dev dependency, and the Vite version
 * that Astro snapshot resolves `vite` to.
 */
export function versionsFromLockfile(lockfile: string): { astro: string; vite: string } {
  const lines = lockfile.split('\n')
  const core = blockOf(lines, '  packages/core:')
  const astroEntry = core.slice(core.indexOf('      astro:'))
  const resolved = valueAfter(astroEntry, '        version: ')
  const snapshot = blockOf(lines, `  astro@${resolved}:`)
  const dependencies = snapshot.slice(snapshot.indexOf('    dependencies:'))
  return {
    astro: withoutPeers(resolved),
    vite: withoutPeers(valueAfter(dependencies, '      vite: ')),
  }
}

/**
 * The Astro and Vite versions the workspace lockfile resolves for the Astro fixture.
 */
export function fixtureVersions(): { astro: string; vite: string } {
  return versionsFromLockfile(readLockfile())
}
