/**
 * The stylesheets the build can still hold: every stylesheet the code imports, and every one an
 * `@import`, or a CSS module's `composes ... from`, reaches from those. The bundler runs PostCSS
 * over each of them on its own, so each leaves its own record, and only the run over the atom
 * layer can tell which of those records are still in the build.
 */
import type { Root } from 'postcss'

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { ResolverFactory } from 'oxc-resolver'
import postcss from 'postcss'

import type { Graph } from './graph-types.ts'

import { digestOf } from './digest.ts'
import { configFileIn } from './resolve.ts'
import { isStylesheetFile } from './source-files.ts'

/**
 * The condition sets a stylesheet's `@import` of a package is resolved under: the `style`
 * condition alone, and with the conditions a script import is resolved under, since a package
 * can order its `exports` either way.
 */
const CONDITION_SETS = [['style'], ['style', 'browser', 'import', 'default']]

/**
 * The URL an `@import` names: `url('x')`, `url(x)` or a quoted string, before any layer, supports
 * or media condition.
 */
const IMPORT_URL = /^\s*(?:url\(\s*(?:(['"])(.*?)\1|([^'")\s]+))\s*\)|(['"])(.*?)\4)/

/**
 * The module a `composes` declaration names after `from`.
 */
const COMPOSES_FROM = /\bfrom\s+(['"])(.+?)\1/

/**
 * Whether a URL names something other than a file to bundle: another origin, a data URL, or a
 * path from the site's root.
 */
function isExternal(url: string): boolean {
  return /^(?:[a-z][\d+.a-z-]*:|\/)/i.test(url)
}

/**
 * The URLs a stylesheet imports or composes from.
 */
function urlsOf(root: Root): string[] {
  const urls: string[] = []
  root.walkAtRules('import', (rule) => {
    const match = IMPORT_URL.exec(rule.params)
    const url = match?.[2] ?? match?.[3] ?? match?.[5]
    if (url !== undefined) urls.push(url)
  })
  root.walkDecls('composes', (declaration) => {
    const url = COMPOSES_FROM.exec(declaration.value)?.[2]
    if (url !== undefined) urls.push(url)
  })
  return urls
}

/**
 * The file a stylesheet URL names: the URL before its query or fragment, without the legacy `~`
 * that marks a package.
 */
export function fileSpecifierOf(url: string): string {
  const file = url.split(/[#?]/, 1)[0] ?? ''
  return file.startsWith('~') ? file.slice(1) : file
}

/**
 * Whether `file` is a file on disk.
 */
function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile()
}

/**
 * Resolves the URLs a stylesheet names to the stylesheets they reach: as a path relative to the
 * stylesheet first, which is what a URL is in CSS, and then as a module, the way the bundlers'
 * CSS loaders read a bare specifier.
 */
function createStylesheetResolver(dir: string): (importer: string, url: string) => string[] {
  const configFile = configFileIn(dir)
  const factories = CONDITION_SETS.map(
    (conditionNames) =>
      new ResolverFactory({
        conditionNames,
        mainFields: ['style', 'main'],
        extensions: ['.css'],
        ...(configFile && { tsconfig: { configFile, references: 'auto' } }),
      }),
  )
  return (importer, url) => {
    const specifier = fileSpecifierOf(url)
    if (specifier === '' || isExternal(specifier)) return []
    const directory = path.dirname(importer)
    const found = new Set<string>()
    const relative = path.resolve(directory, specifier)
    if (isFile(relative)) found.add(relative)
    for (const factory of factories) {
      const resolved = factory.sync(directory, specifier).path
      if (resolved !== undefined) found.add(resolved)
    }
    return [...found].filter((file) => isStylesheetFile(file))
  }
}

const SASS_EXTENSIONS = new Set(['.sass', '.scss'])

/**
 * The stylesheets one stylesheet reaches, read from its text, or `undefined` when it cannot be
 * read as CSS: a Sass file, whose own imports Sass resolves and inlines, or a file the CSS parser
 * refuses.
 */
function reachedFrom(
  file: string,
  css: string,
  resolve: (importer: string, url: string) => string[],
): string[] | undefined {
  if (SASS_EXTENSIONS.has(path.extname(file))) return undefined
  let root: Root
  try {
    root = postcss.parse(css, { from: file })
  } catch {
    return undefined
  }
  return urlsOf(root).flatMap((url) => resolve(file, url))
}

/**
 * The text of a stylesheet, or `undefined` when it cannot be read.
 */
function textOf(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Reads the stylesheets the graph met and every stylesheet they reach, adding each to the graph's
 * stylesheets and its text's digest to the graph's files, so the bundler runs the atom layer
 * again when an `@import` changes. A stylesheet that cannot be read, or read as CSS, goes into the
 * graph's unread stylesheets: what it imports is not known. `running` is the stylesheet the
 * plugin is running over: it is counted, and not read again.
 */
export function readStylesheets(graph: Graph, dir: string, running: string | undefined): void {
  const resolve = createStylesheetResolver(dir)
  const queue = [...graph.stylesheets].filter((file) => file !== running)
  if (running !== undefined) graph.stylesheets.add(running)
  while (queue.length > 0) {
    const file = queue.pop()!
    const css = textOf(file)
    graph.files.set(file, digestOf(css ?? ''))
    const reached = css === undefined ? undefined : reachedFrom(file, css, resolve)
    if (reached === undefined) {
      graph.unreadStylesheets.add(file)
      continue
    }
    const unmet = reached.filter((sheet) => !graph.stylesheets.has(sheet))
    for (const sheet of unmet) graph.stylesheets.add(sheet)
    queue.push(...unmet)
  }
}
