/**
 * A scratch Astro project for the Astro criteria: a directory of source files written under
 * `packages/core` (so `astro`, its integrations and `@navecss/tokens` resolve through the
 * workspace's own `node_modules`, and `@navecss/core` is a link to the package under test), built
 * with Astro's programmatic `build()` in this process. Its `astro.config.mjs` is the README's
 * `js` fence and its layout's first `<head>` child is the README's `<style is:inline>` line, so
 * the documented setup is the measured one.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BASE_FILES, layout, PRERENDERED_FILES, SERVER_FILES } from './astro-files.ts'
import { astroConfigFence } from './astro-readme.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * One edit of the scratch copy of the plugin: `from` is replaced by `to` in `file` (a path under
 * `src`), and it must be there.
 */
export interface Patch {
  readonly file: string
  readonly from: string
  readonly to: string
}

/**
 * What the probe plugin does: it records every CSS asset of the build, and may append `css` to
 * the stylesheet that holds the layer in `environment` (when named) and whose name or file name
 * contains `match` (when named).
 */
export interface ProbeSettings {
  readonly tamper?: { readonly css: string; readonly environment?: string; readonly match?: string }
}

export interface AstroAppSettings {
  /**
   * `output: 'server'` with the Node adapter, as the `server` rows build it.
   */
  readonly server?: boolean
  /**
   * Adds a prerendered page to a server project.
   */
  readonly prerendered?: boolean
  /**
   * The text of the argument of `navePlugin(...)`.
   */
  readonly options?: string
  /**
   * An integration added after the React one, as an expression.
   */
  readonly integrations?: string
  /**
   * One key added to Astro's own config, beside the integrations, as text (`build: { ... }`).
   */
  readonly astro?: string
  /**
   * One key added to the fence's `vite` object, as text (`resolve: { noExternal: ['x'] }`).
   */
  readonly vite?: string
  /**
   * Files added over, or replacing, the fixture's own; a `null` removes one.
   */
  readonly files?: Readonly<Record<string, string | null>>
  /**
   * Packages written into the project's `node_modules`.
   */
  readonly packages?: Readonly<Record<string, Readonly<Record<string, string>>>>
  /**
   * Whether the layout also renders `<ClientRouter />` after the order statement.
   */
  readonly clientRouter?: boolean
  /**
   * Lists the asset probe before `navePlugin()`.
   */
  readonly probe?: ProbeSettings
  /**
   * Runs the project on a scratch copy of the plugin's source with these edits, in place of the
   * built package: a control instrument, never shipped.
   */
  readonly scratch?: readonly Patch[]
}

export interface AstroApp {
  readonly root: string
  readonly settings: AstroAppSettings
  dispose(): void
}

const PROBE = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const here = (name) => new URL(name, import.meta.url)
const config = existsSync(here('./probe-config.json'))
  ? JSON.parse(readFileSync(here('./probe-config.json'), 'utf8'))
  : {}
const records = []

export function probe() {
  return {
    name: 'fixture-probe',
    generateBundle: {
      order: 'pre',
      handler(_options, bundle) {
        const environment = this.environment?.name
        for (const entry of Object.values(bundle)) {
          if (entry.type !== 'asset' || !entry.fileName.endsWith('.css')) continue
          const text = typeof entry.source === 'string' ? entry.source : Buffer.from(entry.source).toString()
          const holdsLayer = text.includes('@layer atomic')
          const names = entry.names ?? []
          const originalFileNames = entry.originalFileNames ?? []
          records.push({ environment, fileName: entry.fileName, names, originalFileNames, holdsLayer })
          const tamper = config.tamper
          const aimed =
            tamper !== undefined &&
            holdsLayer &&
            (tamper.environment === undefined || tamper.environment === environment) &&
            (tamper.match === undefined ||
              [entry.fileName, ...names, ...originalFileNames].some((name) => name.includes(tamper.match)))
          if (aimed) entry.source = text + tamper.css
        }
        writeFileSync(here('./probe-records.json'), JSON.stringify(records))
      },
    },
  }
}
`

/**
 * The README's config fence with `value` swapped in for `from`; throws when `from` is not there,
 * so a README edit cannot turn a row into a silent no-op.
 */
function replaceOnce(text: string, from: string, to: string): string {
  if (!text.includes(from))
    throw new Error(`the README's config fence has no ${JSON.stringify(from)}`)
  return text.replace(from, () => to)
}

/**
 * The fixture's `astro.config.mjs`: the README's fence, plus the React integration, and for a
 * server row the Node adapter, plus the options and the one `vite` key a row names.
 */
export function configText(settings: AstroAppSettings): string {
  let text = astroConfigFence()
  text = replaceOnce(
    text,
    'import { navePlugin }',
    `import react from '@astrojs/react'\n${settings.server ? "import node from '@astrojs/node'\n" : ''}import { navePlugin }`,
  )
  const added = [
    '  integrations: [react()],',
    ...(settings.server ? ["  output: 'server',", "  adapter: node({ mode: 'standalone' }),"] : []),
  ]
  text = replaceOnce(text, 'defineConfig({\n', `defineConfig({\n${added.join('\n')}\n`)
  if (settings.integrations !== undefined)
    text = replaceOnce(
      text,
      'integrations: [react()]',
      `integrations: [react(), ${settings.integrations}]`,
    )
  if (settings.astro !== undefined)
    text = replaceOnce(
      text,
      '  integrations: [react()],\n',
      `  integrations: [react()],\n  ${settings.astro},\n`,
    )
  if (settings.options !== undefined)
    text = replaceOnce(text, 'navePlugin()', `navePlugin(${settings.options})`)
  if (settings.probe !== undefined) {
    text = replaceOnce(text, 'plugins: [', 'plugins: [probe(), ')
    text = replaceOnce(
      text,
      'import { navePlugin }',
      "import { probe } from './probe.mjs'\nimport { navePlugin }",
    )
  }
  if (settings.scratch !== undefined)
    text = replaceOnce(text, "'@navecss/core/vite'", "'./nave-core/src/vite.ts'")
  if (settings.vite !== undefined)
    text = replaceOnce(text, '  vite: {\n', `  vite: {\n    ${settings.vite},\n`)
  return text
}

/**
 * The files of the project: the fixture's, what the settings add, and the config.
 */
function projectFiles(settings: AstroAppSettings): Record<string, string | null> {
  const files: Record<string, string | null> = {
    ...BASE_FILES,
    ...(settings.server && SERVER_FILES),
    ...(settings.server && settings.prerendered && PRERENDERED_FILES),
    'astro.config.mjs': configText(settings),
  }
  if (settings.clientRouter) {
    files['src/layouts/Layout.astro'] = layout(
      '<ClientRouter />',
      "import { ClientRouter } from 'astro:transitions'\n",
    )
  }
  return { ...files, ...settings.files }
}

/**
 * Writes `files` under `directory`, creating the directories between; a `null` is skipped.
 */
function writeFiles(directory: string, files: Readonly<Record<string, string | null>>): void {
  for (const [relative, text] of Object.entries(files)) {
    if (text === null) continue
    const file = path.join(directory, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
}

/**
 * Writes the scratch copy of the plugin's package into `core` and applies `patches` to its source.
 */
function writeScratchCore(core: string, patches: readonly Patch[]): void {
  mkdirSync(core, { recursive: true })
  cpSync(path.join(CORE_ROOT, 'package.json'), path.join(core, 'package.json'))
  cpSync(path.join(CORE_ROOT, 'dist'), path.join(core, 'dist'), { recursive: true })
  cpSync(path.join(CORE_ROOT, 'src'), path.join(core, 'src'), { recursive: true })
  for (const patch of patches) {
    const file = path.join(core, 'src', patch.file)
    writeFileSync(file, replaceOnce(readFileSync(file, 'utf8'), patch.from, patch.to))
  }
}

/**
 * Writes a project into a fresh directory under `packages/core`.
 */
export function makeAstroApp(settings: AstroAppSettings = {}): AstroApp {
  const root = mkdtempSync(path.join(CORE_ROOT, '.nave-astro-'))
  writeFiles(root, projectFiles(settings))
  if (settings.probe !== undefined) {
    writeFileSync(path.join(root, 'probe.mjs'), PROBE)
    writeFileSync(path.join(root, 'probe-config.json'), JSON.stringify(settings.probe))
  }
  // The scratch copy is a whole package of its own, so the plugin in it knows its own `src` and
  // `dist` as Nave's and the project's `@navecss/core` is that copy.
  let core = CORE_ROOT
  if (settings.scratch !== undefined) {
    core = path.join(root, 'nave-core')
    writeScratchCore(core, settings.scratch)
  }
  const modules = path.join(root, 'node_modules')
  mkdirSync(path.join(modules, '@navecss'), { recursive: true })
  symlinkSync(core, path.join(modules, '@navecss', 'core'), 'dir')
  const packages = Object.entries(settings.packages ?? {})
  for (const [name, content] of packages) {
    writeFiles(path.join(modules, name), content)
  }
  return {
    root,
    settings,
    dispose: () => rmSync(root, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 }),
  }
}

/**
 * What the probe recorded for each CSS asset of the build, in the order it saw them.
 */
export interface ProbeRecord {
  readonly environment: string
  readonly fileName: string
  readonly names: readonly string[]
  readonly originalFileNames: readonly string[]
  readonly holdsLayer: boolean
}

/**
 * The probe's records for `app`.
 */
export function probeRecords(app: AstroApp): ProbeRecord[] {
  return JSON.parse(
    readFileSync(path.join(app.root, 'probe-records.json'), 'utf8'),
  ) as ProbeRecord[]
}
