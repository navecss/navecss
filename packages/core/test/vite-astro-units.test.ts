/**
 * The criteria for the parts of the plugin the Astro work changes that a unit drives without a
 * build (AC-astro-10, -12, -21): the lines of the case (b) failure, the warning that names the
 * key that reaches every environment, and the dev server leaving a stylesheet a host serialised
 * into JavaScript unread.
 */
import type { PluginOption } from 'vite'

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { ModuleRecord } from '../src/vite-state.ts'
import type { RenderContext } from '../src/vite-types.ts'
import type { UsedContext } from '../src/vite-used.ts'

import { checkEnvironmentOrder } from '../src/vite-order.ts'
import { warnUnknown } from '../src/vite-server-takes.ts'
import { navePlugin } from '../src/vite.ts'
import { APP_CSS, appFiles, atomLayerAtoms, makeUsedApp } from './helpers/used-atoms-app.ts'
import { appConfig, devCss, startDev, stopDev } from './helpers/vite-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * What the failure is called with: a record per module, each naming its atoms.
 */
function recordOf(file: string, atomNames: string[]): ModuleRecord {
  return {
    atoms: new Set(atomNames),
    problems: [],
    suppressed: [],
    dynamicCalls: [],
    pkg: undefined,
    file,
  }
}

const RECORDS: [string, string[]][] = [
  ['src/z.ts', ['wFull']],
  ['src/a.ts', ['truncate', 'grid']],
  ['node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/dist/x.js', ['flex']],
  ['node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/dist/y.js', ['gap']],
  ['node_modules/b-lib/node_modules/a-lib/i.js', ['block']],
]

/**
 * The message `checkEnvironmentOrder` fails with for `records` read by the client environment,
 * when the first stylesheet came from a client environment (`case (a)`) or a server one (`case (b)`).
 */
function failureOf(records: [string, string[]][], kase: 'a' | 'b'): string {
  let message = ''
  const ctx = {
    environment: { name: 'client', config: { consumer: 'client' } },
    error: (text: string) => {
      message = text
      throw new Error('stop')
    },
  } as unknown as RenderContext
  const modules = new Map(
    records.map(([file, names]) => [`client\0${file}`, recordOf(file, names)]),
  )
  const context = {
    inProcess: true,
    state: {
      emitted: new Set<string>(),
      emittedBy: kase === 'a' ? 'client' : 'prerender',
      firstWriter: kase === 'a' ? 'client' : 'server',
      writers: new Set([kase === 'a' ? 'client' : 'prerender']),
      modules,
      sheets: new Map<string, string>(),
    },
  } as unknown as UsedContext
  try {
    checkEnvironmentOrder(ctx, context)
  } catch {
    // The failure is the message.
  }
  return message
}

const REMEDY_B = [
  'A server build wrote the CSS, and only a build after it read these modules, such as code only the browser runs (an Astro client:only component, or a <script> in an .astro file).',
  'List the atoms in keep in navePlugin(), or have the server render that code too (a hydrated island rather than client:only).',
]
const HEADING = 'The build read atoms after it wrote the CSS, so their rules are missing from it:'
const MISSED = ', which the CSS already written does not hold.'
const PACKAGE_LINE = (name: string): string =>
  `${name} is a dependency the server build left external: add it to resolve.noExternal in your Vite config (on Astro, under vite in astro.config) so the server build reads it.`

describe('AC-astro-10 — the case (b) failure’s line rules, driven over recorded modules', () => {
  const expected = [
    HEADING,
    `node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/dist/x.js: names flex${MISSED}`,
    `node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/dist/y.js: names gap${MISSED}`,
    `node_modules/b-lib/node_modules/a-lib/i.js: names block${MISSED}`,
    `src/a.ts: names grid${MISSED}`,
    `src/a.ts: names truncate${MISSED}`,
    `src/z.ts: names wFull${MISSED}`,
    ...REMEDY_B,
    PACKAGE_LINE('@acme/ui'),
    PACKAGE_LINE('a-lib'),
  ].join('\n')

  it('sorts the module lines whatever order the records arrive in, and prints one package line each', () => {
    expect(failureOf(RECORDS, 'b')).toBe(expected)
    expect(failureOf(RECORDS.toReversed(), 'b')).toBe(expected)
  })

  it('prints no package line when only src/ records are there', () => {
    const lines = failureOf(
      RECORDS.filter(([file]) => file.startsWith('src/')),
      'b',
    ).split('\n')
    expect(lines.some((line) => line.includes('is a dependency'))).toBe(false)
    expect(lines.slice(-2)).toEqual(REMEDY_B)
  })

  it('prints case (a)’s bytes unchanged over the same records, in arrival order, with no package line', () => {
    expect(failureOf(RECORDS, 'a')).toBe(
      [
        HEADING,
        `src/z.ts: names wFull${MISSED}`,
        `src/a.ts: names grid${MISSED}`,
        `src/a.ts: names truncate${MISSED}`,
        `node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/dist/x.js: names flex${MISSED}`,
        `node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/dist/y.js: names gap${MISSED}`,
        `node_modules/b-lib/node_modules/a-lib/i.js: names block${MISSED}`,
        'List the atoms in keep in navePlugin(), or build the server environments first with builder.buildApp in your Vite config.',
      ].join('\n'),
    )
  })
})

const TAKE_CASE_A =
  "@acme/ui, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: src/entry-server.ts imports '@acme/ui/g.js', and the build cannot tell which file the server loads for it. Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead."
const TAKE_CASE_B = TAKE_CASE_A.replace(
  'Add @acme/ui to ssr.noExternal in your Vite config so the build reads the package',
  'Add @acme/ui to resolve.noExternal in your Vite config (on Astro, under vite in astro.config) so the build reads the package',
)

/**
 * The warning `warnUnknown` prints for one unjudged import of `@acme/ui`.
 */
function takeWarning(firstWriter: 'client' | 'server' | undefined): string[] {
  const printed: string[] = []
  const ctx = {
    warn: (message: string) => {
      printed.push(message)
    },
  } as unknown as RenderContext
  const context = { state: { warned: new Set<string>(), firstWriter } } as unknown as UsedContext
  warnUnknown(ctx, context, [
    { specifier: '@acme/ui/g.js', takes: [], taker: 'src/entry-server.ts' },
  ])
  return printed
}

describe('AC-astro-12 — in case (b) the keepFor take warning names resolve.noExternal', () => {
  it('prints the delivery base’s text in case (a), and only the remedy clause differs in case (b)', () => {
    expect(takeWarning(undefined)).toEqual([TAKE_CASE_A])
    expect(takeWarning('client')).toEqual([TAKE_CASE_A])
    expect(takeWarning('server')).toEqual([TAKE_CASE_B])
    expect(TAKE_CASE_B).toContain(
      'Add @acme/ui to resolve.noExternal in your Vite config (on Astro, under vite in astro.config) so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead.',
    )
  })
})

const DEV_CSS_ID = '\0virtual:host-css:page'
const ASTRO_DEV_CSS_ID = '\0virtual:astro:dev-css:/src/pages/index.astro'

/**
 * A plugin that serves the virtual modules `modules` (specifier to module text), each under a
 * resolved id of its own.
 */
function virtualModules(modules: Record<string, { code: string; id: string }>): PluginOption {
  return {
    name: 'fixture-virtual',
    resolveId: (source) => modules[source]?.id,
    load: (id) => Object.values(modules).find((module) => module.id === id)?.code,
  }
}

/**
 * The atoms the stylesheet the dev server serves keeps, for an app that imports the given virtual
 * modules.
 */
async function servedAtoms(
  modules: Record<string, { code: string; id: string }>,
): Promise<string[]> {
  const imports = Object.keys(modules).map((name) => `import '${name}'`)
  const app = makeUsedApp(
    appFiles({
      'index.html':
        '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>',
      'src/app.css': APP_CSS,
    }),
  )
  try {
    writeMain(app.root, imports)
    const server = await startDev({
      ...appConfig(app.root, 'postcss', [virtualModules(modules), navePlugin()]),
      cacheDir: path.join(app.root, 'node_modules', '.vite'),
    })
    try {
      await server.transformIndexHtml(
        '/index.html',
        readFileSync(path.join(app.root, 'index.html'), 'utf8'),
      )
      const served = await devCss(server, '/src/main.ts')
      const css = Object.entries(served).find(([url]) => url.startsWith('/src/app.css'))?.[1] ?? ''
      return atomLayerAtoms(css)
    } finally {
      await stopDev(server)
    }
  } finally {
    app.dispose()
  }
}

/**
 * Rewrites the app's entry to import the stylesheet and the given lines.
 */
function writeMain(root: string, imports: string[]): void {
  writeFileSync(path.join(root, 'src/main.ts'), ['import "./app.css"', ...imports, ''].join('\n'))
}

const CSS_MODULE = (id: string): { code: string; id: string } => ({
  id,
  code: `export const css = new Set([{ content: ".nave-grid{display:grid}" }])\n`,
})
/**
 * Whether a text holds an id a host serialises its stylesheet under.
 */
function hasHostId(text: string): boolean {
  return text.includes('virtual:astro') || text.includes('astro:dev-css')
}

const ORDINARY = { id: '\0virtual:ordinary', code: 'export const c = "nave-flex"\n' }

describe('AC-astro-21 — a stylesheet a host serialised into JavaScript is left unread, by a general test', () => {
  it.each([
    ['a host’s own id', DEV_CSS_ID],
    ['Astro’s dev CSS id', ASTRO_DEV_CSS_ID],
  ])('reads flex and not grid under %s', async (_name, id) => {
    expect(
      await servedAtoms({ 'virtual:host-css': CSS_MODULE(id), 'virtual:ordinary': ORDINARY }),
    ).toEqual(['flex'])
  })

  it('reads a module that holds a serialised stylesheet and also ordinary code naming a class', async () => {
    const mixed = {
      id: DEV_CSS_ID,
      code: `export const css = new Set([{ content: ".nave-grid{display:grid}" }])\nexport const c = "nave-flex"\n`,
    }
    expect(await servedAtoms({ 'virtual:host-css': mixed })).toContain('flex')
  })

  it('has neither host id in the built package, and the check finds an id in a file holding it', () => {
    const files = readdirSync(path.join(CORE_ROOT, 'dist')).filter((name) => name.endsWith('.js'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(path.join(CORE_ROOT, 'dist', file), 'utf8')
      expect(hasHostId(text), file).toBe(false)
    }
    expect(hasHostId(`const id = '${ASTRO_DEV_CSS_ID}'`)).toBe(true)
  })
})
