/**
 * Shared readers for the tests that pin the copy shipped with the native `@apply` order: the
 * files they read, the folding the cleared-copy digests rest on, the placeholders no shipped copy
 * may keep, and the reader that pairs a stylesheet shown in a document with the expansion shown
 * under it. Not a test file and registers no tests.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

import type { AtomDefinition } from '../../src/atoms.ts'

import { navePlugin } from '../../src/postcss.ts'

export const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const REPO_ROOT = path.resolve(CORE_ROOT, '../..')
export const ADR_DIR = path.join(REPO_ROOT, 'docs/04-adr')
export const CHANGESET_DIR = path.join(REPO_ROOT, '.changeset')
export const CHANGELOG_PATH = path.join(CORE_ROOT, 'CHANGELOG.md')

/**
 * The day the order moved in: the date the records carry.
 */
export const RELEASE_DATE = '2026-10-18'

/**
 * A file of core, as it is on disk.
 */
export function readCore(relativePath: string): string {
  return readFileSync(path.join(CORE_ROOT, relativePath), 'utf8')
}

/**
 * A file of the repository, as it is on disk.
 */
export function readRepo(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
}

/**
 * The record numbered `number` under `docs/04-adr/`: its file name and its text. A missing record
 * reads as empty, with a name that is no file, so each test that reads it fails on its own
 * instead of the file failing to load.
 */
export function adrRecord(number: string): { readonly file: string; readonly text: string } {
  const files = readdirSync(ADR_DIR).filter((name) => name.startsWith(`${number}-`))
  if (files.length !== 1) return { file: `${number}-missing`, text: '' }
  return { file: files[0]!, text: readFileSync(path.join(ADR_DIR, files[0]!), 'utf8') }
}

/**
 * A run of whitespace is one space: a document re-wraps its prose, and re-wrapping is not a
 * rewording.
 */
export function fold(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}

/**
 * The SHA-256 of the whitespace-folded `text`, in hex.
 */
export function foldedDigest(text: string): string {
  return createHash('sha256').update(fold(text)).digest('hex')
}

/**
 * What no shipped copy keeps: a slot to fill, or a placeholder left unfilled.
 */
export const PLACEHOLDERS = [
  '[[SLOT',
  '<version>',
  '<path>',
  '<commit>',
  '<specifications>',
  '<script>',
  '<file>',
  '<command>',
  '<date>',
] as const

/**
 * Every placeholder `text` still holds.
 */
export function placeholdersIn(text: string): string[] {
  return PLACEHOLDERS.filter((placeholder) => text.includes(placeholder))
}

/**
 * Removes the text between backticks, so the names of atoms and properties written as code are
 * not read as prose.
 */
export function withoutCodeSpans(text: string): string {
  return text.replaceAll(/`[^`]*`/g, '')
}

export interface ExpansionPair {
  readonly output: string
  readonly source: string
}

interface LabelledFence {
  readonly body: string
  readonly label: string
  readonly lang: string
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(\S*)/
const EXPANSION_LABEL = /(?:expands to|compiles to):\s*$/i

/**
 * Every fenced block of `markdown`, with the last line of prose before it (empty right after
 * another fence).
 */
function labelledFences(markdown: string): LabelledFence[] {
  const fences: LabelledFence[] = []
  let open: { body: string[]; label: string; lang: string; marker: string } | undefined
  let prose = ''
  for (const line of markdown.split('\n')) {
    if (open === undefined) {
      const opening = FENCE_OPEN.exec(line)
      if (opening !== null) {
        open = { body: [], label: prose, lang: opening[2]!, marker: opening[1]! }
      } else if (line.trim() !== '') {
        prose = line.trim()
      }
    } else if (line.trim() === open.marker) {
      fences.push({ body: open.body.join('\n'), label: open.label, lang: open.lang })
      open = undefined
      prose = ''
    } else {
      open.body.push(line)
    }
  }
  return fences
}

/**
 * The stylesheets a document shows with the expansion under them: a `css` fence, a line that ends
 * `expands to:` or `Compiles to:`, then the `css` fence that is the expansion.
 */
export function expansionPairs(markdown: string): ExpansionPair[] {
  const fences = labelledFences(markdown)
  return fences.flatMap((fence, index) => {
    const source = fences[index - 1]
    const isPair =
      fence.lang === 'css' && source?.lang === 'css' && EXPANSION_LABEL.test(fence.label)
    return isPair ? [{ source: source.body, output: fence.body }] : []
  })
}

/**
 * The first line of a document, a comment that names a file, is a label for the reader and not
 * part of the CSS the plugin is meant to read.
 */
export function withoutFilenameComment(css: string): string {
  return css.replace(/^\s*\/\*[^*]*\*\/\s*\n/, '')
}

/**
 * What the PostCSS plugin writes for `css`, with the atoms of `extend` beside the built-in ones.
 */
export async function expandedByPlugin(
  css: string,
  extend: Record<string, AtomDefinition> = {},
): Promise<string> {
  const result = await postcss([navePlugin({ extend })]).process(withoutFilenameComment(css), {
    from: undefined,
  })
  return result.css
}

/**
 * The order warnings the PostCSS plugin reports for `css` read from `from`, each as the host
 * frames it: `file:line:column: ` and the text.
 */
export async function framedWarnings(css: string, from: string): Promise<string[]> {
  const result = await postcss([navePlugin()]).process(css, { from })
  return result.warnings().map((w) => `${from}:${w.line}:${w.column}: ${w.text}`)
}
