import type { Plugin } from 'vite'

/**
 * AC-nextjs-used-atoms-21 — `cx.dynamic()` reads the constant that holds its map of kept atoms as
 * an object (Vite) or as that object's JSON text (Next.js's `compiler.define` folds only
 * strings), decoding the text once on first use. The module under test is the one a consumer
 * installs: the packed tarball's `dist/cx.js`, loaded by a Node child process that sets the
 * constant as a global before the module evaluates, so each case gets a fresh module.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KEEP_CONSTANT } from '../src/vite-config-hooks.ts'
import { packCoreTarball } from './helpers/pack-core.ts'
import { appFiles, buildUsed, makeUsedApp } from './helpers/used-atoms-app.ts'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const KEPT = { interactive: 'nave-interactive' }
const CALLS = 1000

/**
 * What the child reports: the joined results of three names, the results of the three falsy
 * arguments, and the number of `JSON.parse` calls made across `CALLS` calls of `cx.dynamic()`.
 */
interface Report {
  readonly joined: string
  readonly falsy: readonly string[]
  readonly parses: number
}

/**
 * The packed `package/` directory, with this package's installed dependencies linked beside it,
 * which is what an install of the tarball provides: `cx.js` imports `@navecss/tokens`.
 */
function installedPackage(): string {
  const directory = path.join(packCoreTarball().directory, 'package')
  const modules = path.join(directory, 'node_modules')
  if (!existsSync(modules)) symlinkSync(path.join(PACKAGE_DIR, 'node_modules'), modules, 'dir')
  return directory
}

/**
 * Loads the packed `cx.js` in a fresh Node process with the constant set to `constant`, an object
 * or a string (left undefined when there is none), then counts `JSON.parse` calls from the first
 * use on.
 */
function runPacked(constant: object | string | undefined): Report {
  const cxUrl = pathToFileURL(path.join(installedPackage(), 'dist/cx.js')).href
  const script = `
    if (${JSON.stringify(constant) ?? 'undefined'} !== undefined) {
      globalThis.__NAVE_KEEP_CLASSES__ = ${JSON.stringify(constant) ?? 'undefined'}
    }
    const { cx } = await import(${JSON.stringify(cxUrl)})
    const parse = JSON.parse
    let parses = 0
    JSON.parse = (...args) => { parses += 1; return parse(...args) }
    const joined = [cx.dynamic('focusRing'), cx.dynamic('interactive'), cx.dynamic('notAnAtom')].join('|')
    for (let i = 1; i < ${CALLS}; i += 1) cx.dynamic('interactive')
    JSON.parse = parse
    const falsy = [cx.dynamic(null), cx.dynamic(undefined), cx.dynamic(false)]
    process.stdout.write(JSON.stringify({ joined, falsy, parses }))
  `
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }),
  ) as Report
}

describe('AC-nextjs-used-atoms-21 — cx.dynamic() reads its map as an object or as its JSON text', () => {
  it('(a) with no constant, maps through every atom', () => {
    const report = runPacked(undefined)
    expect(report.joined).toBe('nave-focus-ring|nave-interactive|')
    expect(report.falsy).toEqual(['', '', ''])
    expect(report.parses).toBe(0)
  })

  it('(b) with the object, reads it and decodes nothing', () => {
    const report = runPacked(KEPT)
    expect(report.joined).toBe('|nave-interactive|')
    expect(report.falsy).toEqual(['', '', ''])
    expect(report.parses).toBe(0)
  })

  it('(c) with the JSON text, reads it and decodes it once over 1,000 calls', () => {
    const report = runPacked(JSON.stringify(KEPT))
    expect(report.joined).toBe('|nave-interactive|')
    expect(report.falsy).toEqual(['', '', ''])
    expect(report.parses).toBe(1)
  })

  it('(d) with JSON text that decodes to a falsy value, decodes it once, not on every call', () => {
    const report = runPacked('0')
    expect(report.joined).toBe('||')
    expect(report.parses).toBe(1)
  })
})

describe('AC-nextjs-used-atoms-21 — Vite folds the map as an object literal, never as its text', () => {
  const MAP_TEXT = '"flex":"nave-flex"'
  const ENTRY = "import { cx } from '@navecss/core/cx'\nglobalThis.__r = cx.dynamic('flex')\n"

  async function builtJs(plugins: Plugin[] = []): Promise<string> {
    const app = makeUsedApp(appFiles({ 'src/App.ts': ENTRY }))
    try {
      const built = await buildUsed(app, { options: { keep: ['flex'] }, after: plugins })
      expect(built.error).toBeUndefined()
      return built.js
    } finally {
      app.dispose()
    }
  }

  it('holds the map as an object literal, and its JSON text appears nowhere', async () => {
    const js = await builtJs()
    expect(js).toContain('{flex:`nave-flex`}')
    expect(js).not.toContain(MAP_TEXT)
    expect(js).not.toContain('JSON.parse')
  }, 60_000)

  it('control: a define that hands over the map as JSON text puts that text in the JS', async () => {
    const asText: Plugin = {
      name: 'scratch-define-map-as-text',
      config: () => ({
        define: { [KEEP_CONSTANT]: JSON.stringify(JSON.stringify({ flex: 'nave-flex' })) },
      }),
    }
    const js = await builtJs([asText])
    expect(js).toContain(MAP_TEXT)
    expect(js).toContain('JSON.parse')
  }, 60_000)
})

/**
 * The source module's `cx.dynamic`, evaluated afresh with the constant set to `constant`.
 */
async function dynamicWith(constant: object | string): Promise<(name: 'interactive') => string> {
  vi.resetModules()
  vi.stubGlobal(KEEP_CONSTANT, constant)
  const { cx } = await import('../src/cx.ts')
  return cx.dynamic
}

describe('AC-nextjs-used-atoms-21 — the source module, in this process', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('reads the object as it is, and decodes nothing', async () => {
    const parse = vi.spyOn(JSON, 'parse')
    expect((await dynamicWith(KEPT))('interactive')).toBe('nave-interactive')
    expect(parse).not.toHaveBeenCalled()
  })

  it('reads the JSON text, and decodes it once however often it is read', async () => {
    const parse = vi.spyOn(JSON, 'parse')
    const dynamic = await dynamicWith(JSON.stringify(KEPT))
    for (let call = 0; call < CALLS; call += 1) {
      expect(dynamic('interactive')).toBe('nave-interactive')
    }
    expect(parse).toHaveBeenCalledTimes(1)
  })
})
