/**
 * The pieces the workspace fixture is made of: the files it writes, the packages it links, the
 * dependency installed in the store at the top, the probe that logs what the package's PostCSS
 * plugin was given, and the scratch copy of that plugin.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { CORE_ROOT } from './next-app.ts'
import { PACKAGE_ROOT } from './next-process.ts'

export const PROBE_PACKAGE = 'nave-probe'
export const SCRATCH_PACKAGE = 'nave-scratch'

/**
 * What the probe saw when the package's PostCSS plugin finished with one stylesheet.
 */
export interface Probe {
  /**
   * The PostCSS worker's working directory.
   */
  readonly cwd: string
  /**
   * The hand-off variable, parsed, or `undefined` when it was not set.
   */
  readonly handoff: { readonly dir: string; readonly root?: string } | undefined
  /**
   * The package's `dependency` and `dir-dependency` messages: a file, or a directory.
   */
  readonly messages: readonly {
    readonly dir?: string
    readonly file?: string
    readonly type: string
  }[]
}

/**
 * Which of the three states the page is in.
 */
export interface PageState {
  hasBadLib: boolean
  hasExternal: boolean
  hasVariable: boolean
}

/**
 * Writes `files` relative to `dir`, creating directories.
 */
export function writeIn(dir: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(dir, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
}

/**
 * Links `target` as `at`, creating the directory that holds the link.
 */
export function linkAs(at: string, target: string): void {
  mkdirSync(path.dirname(at), { recursive: true })
  symlinkSync(target, at, 'dir')
}

/**
 * A module that calls `cx(<atom>)` once and exports the class it computes.
 */
export function moduleCalling(name: string, atom: string): string {
  return `import { cx } from '@navecss/core/cx'\n\nexport const ${name} = cx('${atom}')\n`
}

/**
 * The page for a state: it always renders `packages/ui`'s class.
 */
export function pageText(state: PageState): string {
  const imports = ["import { look } from '@acme/ui'"]
  const classes = ['look']
  if (state.hasBadLib) {
    imports.push("import { u } from 'bad-lib'")
    classes.push('u')
  }
  if (state.hasExternal) {
    imports.push("import { hidden } from '@ext/x'")
    classes.push('hidden')
  }
  if (state.hasVariable) {
    imports.push("import { cx } from '@navecss/core/cx'")
    classes.push('cx(variant)')
  }
  return [
    ...imports,
    '',
    'export default function Page({ variant }: { variant?: string }) {',
    `  return <div id="t" className={[${classes.join(', ')}].join(' ')} />`,
    '}',
    '',
  ].join('\n')
}

/**
 * The directory in the pnpm store holding the types package `name`, the way the workspace
 * installed it.
 */
function storedTypes(name: string): string {
  const store = path.resolve(PACKAGE_ROOT, '../../node_modules/.pnpm')
  const entry = readdirSync(store).find((candidate) => candidate.startsWith(`@types+${name}@`))
  if (entry === undefined) throw new Error(`@types/${name} is not in the workspace's store`)
  return path.join(store, entry, 'node_modules/@types', name)
}

/**
 * Links what Next.js needs to build TypeScript into the app's `node_modules`.
 */
export function linkTypeScript(modules: string): void {
  const own = (name: string): string => realpathSync(path.join(PACKAGE_ROOT, 'node_modules', name))
  linkAs(path.join(modules, 'typescript'), own('typescript'))
  linkAs(path.join(modules, '@types/node'), own('@types/node'))
  linkAs(path.join(modules, '@types/react'), storedTypes('react'))
}

/**
 * The tsconfig: the app's `@/*` and `@ext/*`, the latter pointing outside the workspace. A `paths`
 * target is relative to the tsconfig, so the directory outside is written as a path from `dir`.
 */
export function tsconfigText(dir: string, outside: string): string {
  const reaching = path.relative(dir, outside).split(path.sep).join('/')
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      paths: { '@/*': ['./*'], '@ext/*': [`${reaching}/*`] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
    exclude: ['node_modules'],
  })
}

/**
 * The PostCSS config listing the plugin (the package's, or the scratch copy of it) and the probe.
 */
export function postcssConfig(plugin: string): string {
  return `export default { plugins: { '${plugin}': {}, '${PROBE_PACKAGE}': {} } }\n`
}

/**
 * The probe package, written into `node_modules`: it appends one JSON line to `log` for each
 * stylesheet the package's plugin left messages on, after every plugin has run.
 */
export function writeProbe(modules: string, log: string): void {
  const source = [
    "const { appendFileSync } = require('node:fs')",
    '',
    'const probe = () => ({',
    "  postcssPlugin: 'nave-probe',",
    '  OnceExit(_root, { result }) {',
    "    const own = (message) => message.plugin === 'postcss-nave-prune'",
    '    const messages = result.messages.filter(own)',
    '    if (messages.length === 0) return',
    '    const handoff = process.env.NAVECSS_PRUNE',
    '    const seen = { cwd: process.cwd(), handoff: handoff ? JSON.parse(handoff) : undefined, messages }',
    String.raw`    appendFileSync(${JSON.stringify(log)}, JSON.stringify(seen) + '\n')`,
    '  },',
    '})',
    'probe.postcss = true',
    'module.exports = probe',
    '',
  ].join('\n')
  writeIn(modules, {
    [`${PROBE_PACKAGE}/package.json`]: JSON.stringify({
      name: PROBE_PACKAGE,
      version: '1.0.0',
      main: 'index.js',
    }),
    [`${PROBE_PACKAGE}/index.js`]: source,
  })
}

/**
 * What the probe logged, oldest first.
 */
export function readProbes(log: string): Probe[] {
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Probe)
}

/**
 * Installs `bad-lib` the way pnpm does: in the store at the top, with its dependency beside it,
 * and linked into the app's `node_modules`. Its code holds three calls nothing can read, on lines 3,
 * 5 and 7.
 */
export function installBadLib(top: string, modules: string): void {
  const store = path.join(top, 'node_modules/.pnpm/bad-lib@1.0.0/node_modules')
  writeIn(store, {
    'bad-lib/package.json': JSON.stringify({
      name: 'bad-lib',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'bad-lib/index.js': [
      "import { cx } from '@navecss/core/cx'",
      '',
      'export const t = (v) => cx(v)',
      '',
      "export const u = cx('interactve')",
      '',
      'export const w = [1].map(cx)',
      '',
    ].join('\n'),
  })
  linkAs(path.join(store, '@navecss/core'), CORE_ROOT)
  linkAs(
    path.join(modules, 'bad-lib'),
    '../../../node_modules/.pnpm/bad-lib@1.0.0/node_modules/bad-lib',
  )
}

/**
 * Writes a copy of the package's `dist` JavaScript as the package `nave-scratch`, with the text
 * `from` in `file` replaced by `to`. Throws when `from` is not in `file`, so a change to the
 * source cannot turn the copy into an unchanged one without a word.
 */
export function writeScratchPlugin(
  modules: string,
  patch: { readonly file: string; readonly from: string; readonly to: string },
): void {
  const { file, from, to } = patch
  const copy = path.join(modules, SCRATCH_PACKAGE)
  const dist = path.join(PACKAGE_ROOT, 'dist')
  mkdirSync(path.join(copy, 'dist'), { recursive: true })
  for (const name of readdirSync(dist)) {
    if (!name.endsWith('.js')) continue
    const text = readFileSync(path.join(dist, name), 'utf8')
    if (name === file && !text.includes(from)) throw new Error(`${file} does not hold ${from}`)
    writeFileSync(
      path.join(copy, 'dist', name),
      name === file ? text.replace(from, () => to) : text,
    )
  }
  writeFileSync(
    path.join(copy, 'package.json'),
    JSON.stringify({
      name: SCRATCH_PACKAGE,
      version: '1.0.0',
      type: 'module',
      exports: { './postcss': './dist/postcss.js' },
    }),
  )
  // The copy finds its dependencies where the package's own `dist` finds them.
  if (!existsSync(path.join(copy, 'node_modules'))) {
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(copy, 'node_modules'), 'dir')
  }
}
