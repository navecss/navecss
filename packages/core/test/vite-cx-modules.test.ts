/**
 * `cxModules` (AC-used-atoms-47 to -49, and the option's own validation) without a build: the
 * collector reading a declared module and its importers, the post-order half's text test that
 * decides which modules are parsed and which sources are resolved, and the option's validation.
 */
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'
import type { TransformContext } from '../src/vite-types.ts'

import { createCollectPlugin } from '../src/vite-collect-plugin.ts'
import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'
import { createExtendSource } from '../src/vite-extend.ts'
import { resolveUsedOptions } from '../src/vite-options.ts'
import { createUsedContext } from '../src/vite-used.ts'
import { navePlugin } from '../src/vite.ts'

const IMPORT = `import { cx } from '${CX_SOURCE}'\n`

/**
 * Reads `code` as a module whose imports of `declared` come from declared modules, itself declared
 * or not.
 */
function read(
  code: string,
  { declared = [], isDeclared = false }: { declared?: string[]; isDeclared?: boolean } = {},
): ModuleReading {
  return readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE, ...declared]),
    declaredSources: new Set(declared),
    isDeclared,
    ownAtoms: new Set(),
    isDependency: false,
  })
}

const byText = (a: string, b: string): number => a.localeCompare(b)

const kinds = (reading: ModuleReading): string[] =>
  reading.problems.map((problem) => problem.kind).toSorted(byText)

describe('AC-used-atoms-47 — a declared module re-exporting Nave’s cx, and every importer form', () => {
  const declaredModules: [string, string][] = [
    ['export-from', `export { cx } from '${CX_SOURCE}'`],
    ['star', `export * from '${CX_SOURCE}'`],
    ['import then export', `${IMPORT}export { cx }`],
    [
      'aliased import, exported as cx',
      `import { cx as c } from '${CX_SOURCE}'\nexport { c as cx }`,
    ],
  ]

  it.each(declaredModules)('reads a declared module that holds %s as no problem', (_name, code) => {
    const reading = read(code, { isDeclared: true })

    expect(reading.problems).toEqual([])
    // The control: the same text outside cxModules is the re-export error of R2(d).
    expect(kinds(read(code))).toEqual(['reexport'])
  })

  it('collects the named, aliased and namespace imports of a declared module', () => {
    const code = [
      "import { cx } from './ui'",
      "import { cx as k } from './ui/index.ts'",
      "import * as U from './ui2'",
      "export const a = [cx('flex'), k('grid'), U.cx('block')]",
      "export const d = (on) => [cx.raw('x'), cx(on && 'gap')]",
    ].join('\n')
    const reading = read(code, { declared: ['./ui', './ui/index.ts', './ui2'] })

    expect(reading.problems).toEqual([])
    expect([...reading.atoms].toSorted(byText)).toEqual(['block', 'flex', 'gap', 'grid'])
  })

  it('judges an importer’s uses as R2 and R3 do', () => {
    const code =
      "import { cx } from './ui'\nimport * as U from './ui2'\nexport const g = (v) => [cx(v), U.cx(v)]"
    const reading = read(code, { declared: ['./ui', './ui2'] })

    expect(kinds(reading)).toEqual(['argument', 'argument'])
  })

  it('does not take a module that names no declared source for one that does', () => {
    const reading = read("import { cx } from './elsewhere'\nexport const a = cx('flex')")

    expect(reading.atoms.size).toBe(0)
  })

  it('judges a declared module’s other uses as R2 does', () => {
    const code = `${IMPORT}export { cx }\nexport const k = (v) => cx(v)`
    const reading = read(code, { isDeclared: true })

    expect(kinds(reading)).toEqual(['argument'])
  })
})

describe('AC-used-atoms-48 — what a declared module may not do, and the hidden second hop', () => {
  const rows: [string, string, string[]][] = [
    ['another name', `export { cx as x } from '${CX_SOURCE}'`, ['declared']],
    ['a default', `${IMPORT}export default cx`, ['declared']],
    ['a default, by specifier', `${IMPORT}export { cx as default }`, ['declared']],
    ['a namespace', `export * as n from '${CX_SOURCE}'`, ['declared']],
    ['not Nave’s', "export const cx = (...a) => a.join(' ')", ['declared']],
    ['not Nave’s, a function', 'export function cx() {}', ['declared']],
    ['not Nave’s, a re-export of another module', "export { cx } from './own.js'", ['declared']],
    [
      'a wrapper',
      `import { cx as n } from '${CX_SOURCE}'\nexport const cx = (...a) => n(...a)`,
      ['argument', 'declared'],
    ],
    ['a second hop', "export { cx } from './ui/index.ts'", ['declared']],
    ['a second hop, star', "export * from './ui/index.ts'", ['declared']],
    [
      'a second hop, through an import',
      "import { cx } from './ui/index.ts'\nexport { cx }",
      ['declared'],
    ],
  ]

  it.each(rows)('a declared module with %s is the expected problems', (_name, code, expected) => {
    const reading = read(code, { isDeclared: true, declared: ['./ui/index.ts'] })

    expect(kinds(reading)).toEqual(expected)
  })

  it('does not take an export of something else for a problem', () => {
    const reading = read(`export { cx } from '${CX_SOURCE}'\nexport const other = 1`, {
      isDeclared: true,
    })

    expect(reading.problems).toEqual([])
  })

  it('refuses the re-export of a declared module in an undeclared one, and a dynamic import of it', () => {
    const declared = ['./ui/index.ts']

    expect(kinds(read("export * from './ui/index.ts'", { declared }))).toEqual(['reexport'])
    expect(kinds(read("export { cx } from './ui/index.ts'", { declared }))).toEqual(['reexport'])
    expect(kinds(read("import { cx } from './ui/index.ts'\nexport { cx }", { declared }))).toEqual([
      'reexport',
    ])
    expect(
      kinds(
        read("export const d = import('./ui/index.ts').then((m) => m.cx('flex'))", { declared }),
      ),
    ).toEqual(['reference'])
  })

  it('does not take a re-export of something else from a declared module for a problem', () => {
    const reading = read("export { Button } from './ui/index.ts'", { declared: ['./ui/index.ts'] })

    expect(reading.problems).toEqual([])
  })

  it('refuses a dynamic import of Nave’s cx in a declared module too', () => {
    const reading = read(`export const o = import('${CX_SOURCE}')`, { isDeclared: true })

    expect(kinds(reading)).toEqual(['reference'])
  })
})

describe('AC-used-atoms-49 — the text test decides what is parsed and what is resolved', () => {
  const ROOT = '/scale-root'
  const DECLARED = `${ROOT}/src/ui/index.ts`
  // What the host's resolver answers: the entries from the project root, and the specifiers
  // that name the declared file or another one from the modules that write them.
  const RESOLUTIONS = new Map<string, string>([
    ['#ds', `${ROOT}/src/ds-entry.ts`],
    ['../ui', DECLARED],
    ['./components/index', `${ROOT}/src/components/index.ts`],
    ['./src/ui/index.ts', DECLARED],
    ['./ui', DECLARED],
    ['./ui/index', DECLARED],
    ['@/ui', DECLARED],
    ['@acme/ds', `${ROOT}/node_modules/@acme/ds/index.js`],
  ])

  interface Fixture {
    readonly context: ReturnType<typeof createUsedContext>
    readonly parsed: string[]
    readonly resolved: { importer: string; source: string }[]
    readonly transform: (code: string, id: string) => Promise<void>
  }

  function fixture(cxModules: readonly string[]): Fixture {
    const context = createUsedContext(
      resolveUsedOptions({ cxModules }),
      createExtendSource(undefined),
    )
    context.root = ROOT
    const plugin = createCollectPlugin(context)
    const parsed: string[] = []
    const resolved: { importer: string; source: string }[] = []
    let current = ''
    const ctx = {
      environment: { name: 'client', config: { consumer: 'client' }, plugins: [] },
      parse: (code: string) => {
        parsed.push(current)
        return parseAst(code)
      },
      resolve: (source: string, importer: string) => {
        resolved.push({ importer, source })
        const id = RESOLUTIONS.get(source)
        return Promise.resolve(id === undefined ? undefined : { id })
      },
      getCombinedSourcemap: () => ({ sources: [], mappings: '' }),
      addWatchFile() {},
    } as unknown as TransformContext
    return {
      context,
      parsed,
      resolved,
      async transform(code, id) {
        current = id
        // eslint-disable-next-line @typescript-eslint/unbound-method -- applied with the host's `this`
        await Reflect.apply(plugin.transform, ctx, [code, id])
      },
    }
  }

  const MODULES = [
    { name: 'a', code: `import { cx } from '${CX_SOURCE}'`, isParsed: true },
    { name: 'b', code: "import { cx } from '../ui'", isParsed: true },
    { name: 'c', code: "import { cx } from '@/ui'", isParsed: true },
    { name: 'd', code: "import { cx } from './ui/index'", isParsed: true },
    { name: 'e', code: "import { cx } from '#ds'", isParsed: true },
    { name: 'f', code: "import { Button } from '@acme/ds'", isParsed: true },
    { name: 'g', code: "import { x } from './components/index'", isParsed: true },
    { name: 'h', code: "import { x } from './uix'", isParsed: false },
    { name: 'i', code: "const s = 'nave-flex'", isParsed: true },
    { name: 'j', code: 'export const y = 1', isParsed: false },
  ]

  it('parses exactly the modules whose text can name Nave’s cx or a declared module', async () => {
    const { parsed, transform } = fixture(['./src/ui/index.ts', '@acme/ds', '#ds'])
    for (const { name, code } of MODULES) await transform(code, `${ROOT}/src/m-${name}.ts`)

    expect(parsed.toSorted(byText)).toEqual(
      MODULES.filter((row) => row.isParsed).map((row) => `${ROOT}/src/m-${row.name}.ts`),
    )
  })

  it('control: with cxModules empty only the Nave and class rows are parsed', async () => {
    const { parsed, transform } = fixture([])
    for (const { name, code } of MODULES) await transform(code, `${ROOT}/src/m-${name}.ts`)

    expect(parsed.toSorted(byText)).toEqual([`${ROOT}/src/m-a.ts`, `${ROOT}/src/m-i.ts`])
  })

  it('resolves only the sources that pass the test, from the module that writes them', async () => {
    const { resolved, transform } = fixture(['./src/ui/index.ts'])
    const importer = `${ROOT}/src/pages/p.ts`
    await transform(
      "import a from './ui'\nimport b from './other'\nimport c from 'react'",
      importer,
    )

    expect(
      resolved.filter((call) => call.importer === importer).map((call) => call.source),
    ).toEqual(['./ui'])
  })

  it('does not take a resolved file that is no declared module for one', async () => {
    const { context, transform } = fixture(['./src/ui/index.ts'])
    // `./components/index` passes the text test (its last segment is `index`) and resolves, but to
    // a file that is not declared, so no `cx` binding comes from it.
    await transform(
      "import { cx } from './components/index'\nexport const a = cx('flex')",
      `${ROOT}/src/n.ts`,
    )

    const atomsRead = (): string[] =>
      context.state.modules
        .values()
        .flatMap((record) => [...record.atoms])
        .toArray()
    expect(atomsRead()).toEqual([])
    // The control: the same module importing the declared file's directory is read.
    await transform("import { cx } from './ui'\nexport const a = cx('flex')", `${ROOT}/src/o.ts`)
    expect(atomsRead()).toEqual(['flex'])
  })
})

describe('cxModules validation (round-6 decision 10)', () => {
  it.each(['atomic: used', 'atomic: all'])('refuses a non-array under %s', (label) => {
    const atomic = label.endsWith('all') ? 'all' : 'used'

    expect(() => navePlugin({ atomic, cxModules: './src/ui/index.ts' as never })).toThrow(
      'navePlugin(): cxModules must be an array of module paths or specifiers.',
    )
  })

  it('refuses a non-string entry, naming its place', () => {
    expect(() => navePlugin({ cxModules: ['./a.ts', 42 as never] })).toThrow(
      'navePlugin(): cxModules[1] must be a string: a module path or a specifier.',
    )
  })

  it('accepts a list shared with the lint, an empty list and an entry that names nothing', () => {
    expect(() => navePlugin({ cxModules: [] })).not.toThrow()
    expect(() => navePlugin({ cxModules: ['./src/missing.ts', '@acme/ui', '#ds'] })).not.toThrow()
  })

  it('refuses the same text with extend as a module path as with extend inline', () => {
    expect(() => navePlugin({ extend: {}, cxModules: 'x' as never })).toThrow(
      'cxModules must be an array',
    )
    expect(() => navePlugin({ extend: './atoms.mjs', cxModules: 'x' as never })).toThrow(
      'cxModules must be an array',
    )
  })
})
