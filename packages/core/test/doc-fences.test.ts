/**
 * AC-directive-core-29: every fenced block in the three docs that imports
 * from `@navecss/core` or runs `navecss-core` names a real subpath, a real
 * export of that subpath's own source file, and (for the bin) a real
 * subcommand and flag. Reads core's live `package.json` and `tsup.config.ts`
 * at test time — unlike AC-27's pinned baseline, this AC is about what is
 * true NOW, at whatever commit this runs at.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  type BinInvocation,
  checkBinInvocation,
  checkCoreImport,
  type CoreImport,
  extractBinInvocations,
  extractCoreImports,
  extractFences,
  loadEntryMap,
} from './doc-fences.ts'
import { assertScalesLinearly } from './helpers/perf-scaling.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_ROOT = path.resolve(HERE, '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const DOC_PATHS = [
  path.join(REPO_ROOT, 'README.md'),
  path.join(CORE_ROOT, 'README.md'),
  path.join(CORE_ROOT, 'CONSUMER-ATOMS.md'),
]

function readRealSource(relPath: string): string {
  return readFileSync(path.join(CORE_ROOT, relPath), 'utf8')
}

interface CoreManifest {
  readonly exports: Record<string, unknown>
}

function realExportsMap(): Record<string, unknown> {
  const manifest = JSON.parse(
    readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8'),
  ) as CoreManifest
  return manifest.exports
}

function realEntryMap(): Record<string, string> {
  return loadEntryMap(readFileSync(path.join(CORE_ROOT, 'tsup.config.ts'), 'utf8'))
}

describe('AC-directive-core-29 — every documented config fence names a real subpath and export', () => {
  const fences = DOC_PATHS.flatMap((file) =>
    extractFences(path.relative(REPO_ROOT, file), readFileSync(file, 'utf8')),
  )
  const coreImports = fences.flatMap((f) =>
    extractCoreImports(f.body).map((imp) => ({ doc: f.doc, imp })),
  )
  const binInvocations = fences.flatMap((f) =>
    extractBinInvocations(f.body).map((inv) => ({ doc: f.doc, inv })),
  )

  it('collects at least one core-import fence and one bin-invocation fence (a non-empty corpus)', () => {
    expect(coreImports.length).toBeGreaterThan(0)
    expect(binInvocations.length).toBeGreaterThan(0)
  })

  it.each(
    coreImports.map(({ doc, imp }): [string, CoreImport] => [`${doc}: ${imp.specifier}`, imp]),
  )('%s names a real subpath and real export(s)', (_label, imp) => {
    expect(checkCoreImport(imp, realExportsMap(), realEntryMap(), readRealSource)).toEqual([])
  })

  it.each(
    binInvocations.map(({ doc, inv }): [string, BinInvocation] => [
      `${doc}: navecss-core ${inv.subcommand}`,
      inv,
    ]),
  )('%s names a real subcommand and real flag(s)', (_label, inv) => {
    expect(checkBinInvocation(inv)).toEqual([])
  })

  it('the fence set includes the Vite plugin’s fence', () => {
    const viteImports = coreImports.filter(({ imp }) => imp.specifier === '@navecss/core/vite')

    expect(viteImports.length).toBeGreaterThan(0)
  })

  it('reds on a fence importing a misspelled name from the Vite subpath (control)', () => {
    const imp: CoreImport = {
      names: [{ isDefault: false, isType: false, name: 'navePlugn' }],
      specifier: '@navecss/core/vite',
    }
    expect(checkCoreImport(imp, realExportsMap(), realEntryMap(), readRealSource)).toEqual([
      '@navecss/core/vite exports no "navePlugn"',
    ])
  })

  it("reds on a fence importing a subpath that is not a key of core's exports (control)", () => {
    const imp: CoreImport = {
      names: [{ isDefault: false, isType: false, name: 'navePlugin' }],
      specifier: '@navecss/core/webpack',
    }
    expect(checkCoreImport(imp, realExportsMap(), realEntryMap(), readRealSource)).toEqual([
      "@navecss/core/webpack is not a key of core's exports",
    ])
  })

  it('reds on a fence importing a misspelled name from a real subpath (control)', () => {
    const imp: CoreImport = {
      names: [{ isDefault: false, isType: false, name: 'navePlugn' }],
      specifier: '@navecss/core/postcss',
    }
    expect(checkCoreImport(imp, realExportsMap(), realEntryMap(), readRealSource)).toEqual([
      '@navecss/core/postcss exports no "navePlugn"',
    ])
  })

  it('the fence set includes the Lightning CSS adapter’s fence and the no-bundler fences', () => {
    const lightning = coreImports.filter(
      ({ imp }) => imp.specifier === '@navecss/core/lightningcss',
    )
    const expand = binInvocations.filter(({ inv }) => inv.subcommand === 'expand')

    expect(lightning.length).toBeGreaterThan(0)
    expect(expand.length).toBeGreaterThan(0)
  })

  it('reds on a fence importing a misspelled name from the Lightning CSS subpath (control)', () => {
    const imp: CoreImport = {
      names: [{ isDefault: false, isType: false, name: 'navePlugn' }],
      specifier: '@navecss/core/lightningcss',
    }
    expect(checkCoreImport(imp, realExportsMap(), realEntryMap(), readRealSource)).toEqual([
      '@navecss/core/lightningcss exports no "navePlugn"',
    ])
  })

  it('reds on a fence running a subcommand the bin does not have (control)', () => {
    expect(checkBinInvocation({ flags: ['out'], subcommand: 'bundle' })).toEqual([
      'navecss-core has no subcommand "bundle"',
    ])
  })

  it('reds on a fence running expand with a flag it does not accept (control)', () => {
    expect(
      checkBinInvocation({ flags: ['source', 'out', 'inline'], subcommand: 'expand' }),
    ).toEqual(['navecss-core expand accepts no --inline'])
  })

  it('passes a fence running expand with every flag it accepts', () => {
    expect(
      checkBinInvocation({ flags: ['source', 'out', 'extend', 'watch'], subcommand: 'expand' }),
    ).toEqual([])
  })

  it('reds on a fence running a real subcommand with a flag it does not accept (control)', () => {
    expect(checkBinInvocation({ flags: ['out'], subcommand: 'check' })).toEqual([
      'navecss-core check accepts no --out',
    ])
  })
})

describe('extractFences and extractCoreImports cover every fence and import shape a doc can carry', () => {
  it('reads a fence whose info string carries more than the bare language', () => {
    const text = '```ts title="a"\nimport { navePlugn } from "@navecss/core/postcss"\n```\n'

    const fences = extractFences('x', text)

    expect(fences.flatMap((f) => extractCoreImports(f.body))).toHaveLength(1)
  })

  it('reads a ~~~ fence the same as a ``` one', () => {
    const text = '~~~ts\nimport { navePlugn } from "@navecss/core/postcss"\n~~~\n'

    const fences = extractFences('x', text)

    expect(fences.flatMap((f) => extractCoreImports(f.body))).toHaveLength(1)
  })

  // A generous per-row timeout, well above the runner's own default: `assertScalesLinearly`
  // can run its subject up to 21 times, and a slow shared runner's per-call time can be an
  // order of magnitude past a fast local machine's. The ratio assertion inside decides pass or fail.
  it('stays roughly linear on an opener followed by a long unterminated run of word characters', async () => {
    await assertScalesLinearly((n) => {
      const text = '```' + 'a'.repeat(n)
      const start = performance.now()
      extractFences('x', text)
      return performance.now() - start
    }, 2500)
  }, 45_000)

  it('stays roughly linear on many openers that are never closed', async () => {
    await assertScalesLinearly((n) => {
      const text = '```a\n'.repeat(n)
      const start = performance.now()
      extractFences('x', text)
      return performance.now() - start
    }, 5000)
  }, 45_000)

  it('stays roughly linear on one long run of backticks that is never closed', async () => {
    await assertScalesLinearly((n) => {
      const text = '`'.repeat(n)
      const start = performance.now()
      extractFences('x', text)
      return performance.now() - start
    }, 5000)
  }, 45_000)

  it('extracts a dynamic import() of a core subpath', () => {
    const imports = extractCoreImports("await import('@navecss/core/postcss')")

    expect(imports).toEqual([{ names: [], specifier: '@navecss/core/postcss' }])
  })

  it('extracts a string-keyed plugin entry in a postcss config object', () => {
    const imports = extractCoreImports(
      "module.exports = { plugins: { '@navecss/core/postcsss': {} } }",
    )

    expect(imports).toEqual([{ names: [], specifier: '@navecss/core/postcsss' }])
  })
})
