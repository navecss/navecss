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

import { astroConfigFence, orderStatementLine } from './astro-readme.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * The Quick start's stylesheet, then the one rule the fixture's `@nave` use sits in.
 */
const APP_CSS = `@import url('@navecss/core/layers');
@import url('@navecss/core');

.card {
  @nave breakWord;
}
`

/**
 * A React island that sets `data-hydrated` on its root in an effect and applies `atom`.
 */
function island(name: string, atom: string, extra = ''): string {
  return `import { useEffect, useRef } from 'react'
import { cx } from '@navecss/core/cx'
${extra}
export default function ${name}() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.setAttribute('data-hydrated', '')
  }, [])
  return (
    <div ref={root} id="${name.toLowerCase()}" className={cx('${atom}')}>
      ${name}
    </div>
  )
}
`
}

const ONLY_ISLAND = `import { useEffect, useRef } from 'react'
import { cx } from '@navecss/core/cx'

export default function OnlyIsland() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.setAttribute('data-hydrated', '')
    void import('../lib/lazy.ts').then(({ cls }) => {
      document.getElementById('lazy')?.setAttribute('class', cls())
    })
  }, [])
  return (
    <div ref={root} id="onlyisland" className={cx('inlineFlex')}>
      OnlyIsland
    </div>
  )
}
`

const LAZY = `import { cx } from '@navecss/core/cx'

export const cls = () => cx('wFull')
`

/**
 * The layout: the README's order statement first in the head, then an optional extra head child
 * (`<ClientRouter />`), then the stylesheet import.
 */
function layout(head = '', frontmatter = ''): string {
  return `---
import '../styles/app.css'
${frontmatter}---
<html lang="en">
  <head>
    ${orderStatementLine()}
    <meta charset="utf-8" />
    <title>fixture</title>
    ${head}
  </head>
  <body><slot /></body>
</html>
`
}

const INDEX = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
import Load from '../components/Load.tsx'
import Idle from '../components/Idle.tsx'
import Media from '../components/Media.tsx'
import Visible from '../components/Visible.tsx'
import OnlyIsland from '../components/OnlyIsland.tsx'

const fm = cx('block')
---
<Layout>
  <p id="fm" class={fm}>fm</p>
  <div id="t" class={cx('flex')}>t</div>
  <p id="raw" class="nave-text-center">raw</p>
  <div id="card" class="card">card</div>
  <p id="s">s</p>
  <p id="lazy">lazy</p>
  <Load client:load />
  <Idle client:idle />
  <Media client:media="(min-width: 1px)" />
  <div style="height: 3000px"></div>
  <Visible client:visible />
  <OnlyIsland client:only="react" />
  <a id="to-about" href="/about">about</a>
</Layout>
<script>
  import { cx } from '@navecss/core/cx'
  document.getElementById('s')?.setAttribute('class', cx('truncate'))
</script>
`

const ABOUT = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
---
<Layout>
  <div id="r" class={cx('relative')}>r</div>
  <a id="to-index" href="/">index</a>
</Layout>
`

const DYN = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
import Deferred from '../components/Deferred.astro'
---
<Layout>
  <div id="a" class={cx('absolute')}>a</div>
  <Deferred server:defer />
</Layout>
`

const DEFERRED = `---
import { cx } from '@navecss/core/cx'
---
<div id="d" class={cx('minW0') + ' d'}>d</div>
<style>
  .d {
    @nave flexCol;
  }
</style>
`

const PRE = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
export const prerender = true
---
<Layout>
  <div id="p" class={cx('roundedFull')}>p</div>
</Layout>
`

/**
 * `pre.astro` with a global `<style>` of its own, so the stylesheet of the prerendered page is
 * not the one the on-demand pages share and Astro does not rename one to the other.
 */
const PRE_STYLED = `${PRE}<style is:global>
  .pre-only {
    color: inherit;
  }
</style>
`

/**
 * The files every fixture has.
 */
export const BASE_FILES: Readonly<Record<string, string>> = {
  // Astro reads the dependencies a project lists to find the packages it must bundle.
  'package.json': JSON.stringify({
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(
      ['astro', '@astrojs/react', '@astrojs/node', 'react', 'react-dom'].map((name) => [name, '*']),
    ),
  }),
  'src/styles/app.css': APP_CSS,
  'src/layouts/Layout.astro': layout(),
  'src/pages/index.astro': INDEX,
  'src/pages/about.astro': ABOUT,
  'src/components/Load.tsx': island('Load', 'grid'),
  'src/components/Idle.tsx': island('Idle', 'justifyCenter'),
  'src/components/Media.tsx': island('Media', 'flexWrap'),
  'src/components/Visible.tsx': island('Visible', 'itemsEnd'),
  'src/components/OnlyIsland.tsx': ONLY_ISLAND,
  'src/lib/lazy.ts': LAZY,
}

/**
 * The files a server row adds. In server output `index.astro` and `about.astro` are on demand;
 * `pre.astro` is added by `prerendered`.
 */
export const SERVER_FILES: Readonly<Record<string, string>> = {
  'src/pages/dyn.astro': DYN,
  'src/components/Deferred.astro': DEFERRED,
}

/**
 * The edit that puts a server project with a prerendered page in the shape where the prerendered
 * page and the on-demand pages link differently named stylesheets.
 */
export const NO_RENAME_FILES: Readonly<Record<string, string>> = {
  'src/pages/pre.astro': PRE_STYLED,
}

/**
 * A layout that imports only the layers and the atoms, so its layer is small enough for Astro to
 * inline, and a page that uses it.
 */
export const LEAN_FILES: Readonly<Record<string, string>> = {
  'src/styles/lean.css':
    "@import url('@navecss/core/layers');\n@import url('@navecss/core/atomic');\n",
  'src/layouts/Lean.astro': `---\nimport '../styles/lean.css'\n---\n<html lang="en"><head>${orderStatementLine()}<meta charset="utf-8" /><title>lean</title></head><body><slot /></body></html>\n`,
  'src/pages/lean.astro': `---\nimport { cx } from '@navecss/core/cx'\nimport Lean from '../layouts/Lean.astro'\n---\n<Lean><p id="lean" class={cx('flex')}>lean</p></Lean>\n`,
}

export const PRERENDERED_FILES: Readonly<Record<string, string>> = {
  'src/pages/pre.astro': PRE,
}

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
    text = replaceOnce(text, "'@navecss/core/vite'", "'./nave-src/vite.ts'")
  if (settings.vite !== undefined)
    text = replaceOnce(text, '  vite: {\n', `  vite: {\n    ${settings.vite},\n`)
  return text
}

/**
 * Writes a project into a fresh directory under `packages/core`.
 */
export function makeAstroApp(settings: AstroAppSettings = {}): AstroApp {
  const root = mkdtempSync(path.join(CORE_ROOT, '.nave-astro-'))
  const files: Record<string, string | null> = {
    ...BASE_FILES,
    ...(settings.server ? SERVER_FILES : {}),
    ...(settings.server && settings.prerendered ? PRERENDERED_FILES : {}),
    'astro.config.mjs': configText(settings),
  }
  if (settings.clientRouter) {
    files['src/layouts/Layout.astro'] = layout(
      '<ClientRouter />',
      "import { ClientRouter } from 'astro:transitions'\n",
    )
  }
  Object.assign(files, settings.files)
  for (const [relative, text] of Object.entries(files)) {
    if (text === null) continue
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  if (settings.probe !== undefined) {
    writeFileSync(path.join(root, 'probe.mjs'), PROBE)
    writeFileSync(path.join(root, 'probe-config.json'), JSON.stringify(settings.probe))
  }
  if (settings.scratch !== undefined) {
    const copy = path.join(root, 'nave-src')
    cpSync(path.join(CORE_ROOT, 'src'), copy, { recursive: true })
    for (const patch of settings.scratch) {
      const file = path.join(copy, patch.file)
      writeFileSync(file, replaceOnce(readFileSync(file, 'utf8'), patch.from, patch.to))
    }
  }
  const modules = path.join(root, 'node_modules')
  mkdirSync(path.join(modules, '@navecss'), { recursive: true })
  symlinkSync(CORE_ROOT, path.join(modules, '@navecss', 'core'), 'dir')
  for (const [name, content] of Object.entries(settings.packages ?? {})) {
    const directory = path.join(modules, name)
    mkdirSync(directory, { recursive: true })
    for (const [relative, text] of Object.entries(content)) {
      const file = path.join(directory, relative)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, text)
    }
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
