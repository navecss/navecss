/**
 * Helpers for the real-build rows that compare the CSS a build ships: the page a row builds, the
 * stylesheets an HTML document links, the atoms a layer names, and the scratch copy of the plugin
 * that leaves one kind of message out.
 */
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NextApp } from './next-app.ts'

import { atomsNamedBy, flattenAtomic } from './atoms-flatten.ts'

const STYLESHEET_LINK = /<link[^>]+href="([^"]+\.css[^"]*)"/g

/**
 * A page whose one `div` wears the atoms `calls` names, as `cx(...)` arguments.
 */
export function pageCalling(calls: string): string {
  return [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Page() {',
    `  return <div id="t" className={cx(${calls})} />`,
    '}',
    '',
  ].join('\n')
}

/**
 * The stylesheets an HTML document links, as written in it, each once.
 */
export function stylesheetHrefs(html: string): string[] {
  return [...new Set(html.matchAll(STYLESHEET_LINK).map((match) => match[1]!))]
}

/**
 * The CSS file name of a link: its path under `<distDir>`, without the query.
 */
export function cssNameOf(href: string): string {
  const withoutQuery = href.split('?', 1)[0]!
  return decodeURIComponent(withoutQuery.replace(/^\/_next\//, ''))
}

/**
 * Whether a CSS file the build linked exists under the app's `.next`.
 */
export function isBuiltFile(app: NextApp, name: string): boolean {
  return existsSync(path.join(app.dir, '.next', name))
}

/**
 * The built-in atoms the `@layer atomic` blocks of `css` hold a rule for, sorted.
 */
export function layerAtoms(css: string): string[] {
  const named = flattenAtomic(css).flatMap((entry) => atomsNamedBy(entry.selector))
  return [...new Set(named)].toSorted((a, b) => a.localeCompare(b))
}

export interface BuiltPage {
  /**
   * The CSS file names the page's prerendered HTML links, sorted.
   */
  readonly names: readonly string[]
  /**
   * Those files, read from disk and concatenated.
   */
  readonly css: string
}

/**
 * What the build wrote for `route` (a statically rendered App Router page): the CSS files its
 * HTML links, by name, and their text.
 */
export function builtPage(app: NextApp, route: string): BuiltPage {
  const file = route === '/' ? 'index' : route.replace('/', '')
  const html = readFileSync(path.join(app.dir, '.next/server/app', `${file}.html`), 'utf8')
  const names = stylesheetHrefs(html)
    .map((href) => cssNameOf(href))
    .toSorted((a, b) => a.localeCompare(b))
  const css = names
    .map((name) => readFileSync(path.join(app.dir, '.next', name), 'utf8'))
    .join('\n')
  return { names, css }
}

export type DroppedMessage = 'both' | 'dependency' | 'dir-dependency'

const SCRATCH_PACKAGE = 'nave-scratch-plugin'

/**
 * Where the scratch plugin logs its runs: outside the app, because a file written in the plugin's
 * own directory would change what the bundler sees of the PostCSS config's imports.
 */
export function scratchLogOf(app: NextApp): string {
  return path.join(tmpdir(), `${path.basename(app.top)}-scratch-runs.jsonl`)
}

/**
 * The text of the scratch plugin: the real plugin, then every message of `dropped` type that the
 * real plugin returned removed from the result. It logs one line for each run over core's
 * `atomic.css`, with the number of messages it removed.
 */
function scratchPluginText(dropped: DroppedMessage, log: string): string {
  return [
    "const fs = require('node:fs')",
    "const real = require('@navecss/prune/postcss')",
    '',
    `const LOG = ${JSON.stringify(log)}`,
    `const DROPPED = ${JSON.stringify(dropped === 'both' ? ['dependency', 'dir-dependency'] : [dropped])}`,
    "const OWN = 'postcss-nave-prune'",
    '',
    'function scratch(options) {',
    '  const plugin = real(options)',
    '  return {',
    '    ...plugin,',
    '    async Once(root, helpers) {',
    '      await plugin.Once(root, helpers)',
    '      const { messages } = helpers.result',
    '      const kept = messages.filter((message) => !(message.plugin === OWN && DROPPED.includes(message.type)))',
    '      const from = helpers.result.opts.from || ""',
    "      if (from.endsWith('atomic.css')) {",
    '        const line = JSON.stringify({ dropped: messages.length - kept.length, from })',
    String.raw`        fs.appendFileSync(LOG, line + '\n')`,
    '      }',
    '      messages.splice(0, messages.length, ...kept)',
    '    },',
    '  }',
    '}',
    'scratch.postcss = true',
    '',
    'module.exports = scratch',
    '',
  ].join('\n')
}

const SCRATCH_CONFIG = [
  "import { withNave } from '@navecss/prune'",
  '',
  'const config = withNave({})',
  '// The hook is dropped: nothing is left to check the record against the code.',
  'config.compiler.runAfterProductionCompile = async () => {}',
  'export default config',
  '',
].join('\n')

/**
 * Turns the app into a scratch copy of the plugin: a PostCSS plugin installed in the app's
 * `node_modules` that runs the real one and returns none of its `dropped` messages (`'both'` is
 * the `dependency` and the `dir-dependency` messages), listed in the
 * PostCSS config in its place, and a `next.config` that wraps the real `withNave()` and then
 * removes the hook it adds to `runAfterProductionCompile`, so no check of the record is left.
 * Everything else (the hand-off, the define, `transpilePackages`) is the real wrapper's.
 */
export function useScratchPlugin(app: NextApp, dropped: DroppedMessage): void {
  const directory = `node_modules/${SCRATCH_PACKAGE}`
  app.write({
    [`${directory}/package.json`]: JSON.stringify({
      name: SCRATCH_PACKAGE,
      version: '1.0.0',
      main: 'index.cjs',
    }),
    [`${directory}/index.cjs`]: scratchPluginText(dropped, scratchLogOf(app)),
    'postcss.config.mjs': `export default { plugins: { '${SCRATCH_PACKAGE}': {} } }\n`,
    'next.config.mjs': SCRATCH_CONFIG,
  })
}

/**
 * The number of messages the scratch plugin removed in each run over `atomic.css`, in order.
 */
export function scratchRuns(app: NextApp): number[] {
  const log = scratchLogOf(app)
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => (JSON.parse(line) as { dropped: number }).dropped)
}
