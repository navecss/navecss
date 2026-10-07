/* eslint-disable unicorn/consistent-function-scoping -- a helper reads through the fixture of the criterion whose rows use it */
/**
 * `cxModules` (AC-used-atoms-47 to -49, and the option's own validation) without a build: the
 * collector reading a declared module and its importers, the post-order half's text test that
 * decides which modules are parsed and which sources are resolved, and the option's validation.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'
import type { TransformContext } from '../src/vite-types.ts'

import { createCollectPlugin } from '../src/vite-collect-plugin.ts'
import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'
import {
  declaredModulesFor,
  isAboutListed,
  isRelative,
  recognisedKey,
} from '../src/vite-cx-modules.ts'
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

describe('AC-used-atoms-47 - a namespace import of a declared module is read for its other exports', () => {
  const NS = "import * as U from './ui'\n"
  const reads: [string, string, string[]][] = [
    ['a member', `${NS}export const h = U.Button`, []],
    ['a member beside a call', `${NS}export const i = [U.cx('flex'), U.Button]`, ['flex']],
    ['a string key', `${NS}export const j = U['Button']`, []],
    ['a template key', `${NS}export const j = U[\`Button\`]`, []],
    ['a destructuring', `${NS}const { Button } = U\nexport const k = Button`, []],
    [
      'a destructuring of several keys, one renamed',
      `${NS}const { Button, Card: C } = U\nexport const k = [Button, C]`,
      [],
    ],
    ['a destructuring by assignment', `${NS}let B\n;({ Button: B } = U)\nexport const k = B`, []],
    [
      'a destructuring in a parameter default',
      `${NS}export const a = ({ Button } = U) => Button`,
      [],
    ],
  ]

  it.each(reads)('%s is no use of cx and no problem', (_name, code, atoms) => {
    const reading = read(code, { declared: ['./ui'] })

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(atoms)
  })

  const refused: [string, string][] = [
    ['passed', `${NS}export const l = f(U)`],
    ['spread', `${NS}export const m = ({ ...U })`],
    ['read by a computed key', `${NS}export const n = (k) => U[k]`],
    ['destructured by cx', `${NS}const { cx: c } = U\nexport const o = c`],
    [
      'destructured with a rest element',
      `${NS}const { Button, ...rest } = U\nexport const p = [Button, rest]`,
    ],
    ['assigned', `${NS}export const q = U`],
    ['destructured by cx in an assignment', `${NS}let c\n;({ cx: c } = U)\nexport const o = c`],
    [
      'destructured with a rest element in an assignment',
      `${NS}let r\n;({ ...r } = U)\nexport const p = r`,
    ],
    ['assigned to a plain name', `${NS}let w\nw = U\nexport const q = w`],
    [
      'destructured by an assignment whose value is kept',
      `${NS}let B\nconst r = ({ Button: B } = U)\nexport const h = [B, r.cx('grid')]`,
    ],
    [
      'destructured by an assignment whose value is exported',
      `${NS}let B\nexport const r = ({ Button: B } = U)\nexport const h = B`,
    ],
    [
      'destructured by an assignment whose value is returned',
      `${NS}let B\nexport const pick = () => ({ Button: B } = U)\nexport const h = B`,
    ],
  ]

  it.each(refused)('%s is one problem in the importer', (_name, code) => {
    expect(kinds(read(code, { declared: ['./ui'] }))).toEqual(['reference'])
  })

  it('control: the namespace of Nave’s own module holds nothing but cx, so any other member is a problem', () => {
    const code = `import * as N from '${CX_SOURCE}'\nexport const b = N.Button`

    expect(kinds(read(code))).toEqual(['reference'])
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

  const stars: [string, string, string[]][] = [
    ['a star from a module that may export its own cx', "export * from './helpers'", ['declared']],
    ['a star re-exported as cx', "export * as cx from './other'", ['declared']],
    ['a star from a module that is itself a Nave barrel', "export * from './inner'", ['declared']],
    ['a star from a module with no cx', "export * from './parts'", ['declared']],
    ['a star re-exported under another name', "export * as n from './other'", []],
    [
      'Nave’s explicit re-export beside a star',
      `export { cx } from '${CX_SOURCE}'\nexport * from './parts'`,
      [],
    ],
    [
      'Nave’s star beside another star',
      `export * from '${CX_SOURCE}'\nexport * from './parts'`,
      [],
    ],
    [
      'Nave’s cx exported from an import, beside a star',
      `${IMPORT}export { cx }\nexport * from './parts'`,
      [],
    ],
    ['two stars, one problem', "export * from './a'\nexport * from './b'", ['declared']],
    [
      'Nave’s explicit re-export beside a star of a listed module',
      `export { cx } from '${CX_SOURCE}'\nexport * from './ui/index.ts'`,
      [],
    ],
    [
      'Nave’s star beside a star of a listed module',
      `export * from '${CX_SOURCE}'\nexport * from './ui/index.ts'`,
      [],
    ],
    [
      'Nave’s cx exported from an import, beside a star of a listed module',
      `${IMPORT}export { cx }\nexport * from './ui/index.ts'`,
      [],
    ],
    ['a star of a listed module alone', "export * from './ui/index.ts'", ['declared']],
  ]

  it.each(stars)('%s is the expected problems', (_name, code, expected) => {
    expect(kinds(read(code, { isDeclared: true, declared: ['./ui/index.ts'] }))).toEqual(expected)
  })

  it('positions the star problem at the first star statement', () => {
    const code = "export const first = 1\nexport * from './a'\nexport * from './b'"
    const reading = read(code, { isDeclared: true })

    expect(reading.problems.map((problem) => problem.offset)).toEqual([code.indexOf('export *')])
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
  // The files the host's resolver can find, and the specifiers it answers whatever the importer.
  // A relative specifier is resolved from the module that writes it, as the host's resolver does,
  // so the same text names different files in different directories.
  const FILES = new Set([
    `${ROOT}/node_modules/@acme/ds/index.js`,
    `${ROOT}/src/components/index.ts`,
    `${ROOT}/src/ds-entry.ts`,
    `${ROOT}/src/feature/ui.ts`,
    `${ROOT}/ui/index.ts`,
    DECLARED,
  ])
  const ANSWERS = new Map<string, string>([
    ['#ds', `${ROOT}/src/ds-entry.ts`],
    ['#internal/ui', DECLARED],
    ['#scoped', DECLARED],
    ['@/ui', DECLARED],
    ['@acme/ds', `${ROOT}/node_modules/@acme/ds/index.js`],
  ])

  /**
   * The id the host's resolver gives `source` written in `importer`: the file with the query kept,
   * as Vite's ids are, or nothing.
   */
  function answerFor(source: string, importer: string): string | undefined {
    const answer = ANSWERS.get(source)
    if (answer !== undefined || !source.startsWith('.')) return answer
    const [bare = '', ...query] = source.split('?')
    const base = path.posix.resolve(path.posix.dirname(importer), bare)
    const found = [base, `${base}.ts`, `${base}/index.ts`].find((file) => FILES.has(file))
    return found === undefined
      ? undefined
      : `${found}${query.length > 0 ? `?${query.join('?')}` : ''}`
  }

  interface Fixture {
    readonly context: ReturnType<typeof createUsedContext>
    readonly parsed: string[]
    readonly resolved: { importer: string; source: string }[]
    readonly transform: (code: string, id: string) => Promise<void>
  }

  function fixture(
    cxModules: readonly string[],
    fromModules: Readonly<Record<string, string>> = {},
  ): Fixture {
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
        // An answer only a module can get: the project root's own question has none.
        const own = importer.endsWith('/index.html') ? undefined : fromModules[source]
        const id = own ?? answerFor(source, importer)
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
    // A directory specifier that writes no name reads as `index`, and a declared file is `index.ts`.
    { name: 'k', code: "import { cx } from '.'", isParsed: true },
    { name: 'l', code: "import { cx } from '..'", isParsed: true },
    { name: 'm', code: "import { cx } from './'", isParsed: true },
    { name: 'n', code: "import { cx } from '../'", isParsed: true },
    // The last segment is read without a trailing slash, a query or a hash, but a leading `#`
    // begins a subpath import.
    { name: 'o', code: "import { cx } from '../ui/'", isParsed: true },
    { name: 'p', code: "import { cx } from './ui?v=1'", isParsed: true },
    { name: 'q', code: "import { cx } from '#internal/ui'", isParsed: true },
    { name: 'r', code: "import { cx } from './ui.ts#top'", isParsed: true },
    // An apostrophe elsewhere in the text cannot hide a specifier: quotes are not paired.
    { name: 's', code: "const s = \"it's\"; import { cx } from './ui'", isParsed: true },
    { name: 't', code: "/* it's */ import { cx } from './ui'", isParsed: true },
    { name: 'u', code: "import { x } from './uix?v=1'", isParsed: false },
    // A directory specifier may climb more than one level, or name the directory with a dot.
    { name: 'v', code: "import { cx } from '../..'", isParsed: true },
    { name: 'w', code: "import { cx } from '../../'", isParsed: true },
    { name: 'x', code: "import { cx } from './.'", isParsed: true },
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

  it('control: with no index file declared, a directory specifier is not parsed', async () => {
    const { parsed, transform } = fixture(['./src/ui/button.ts'])
    await transform("import { cx } from '..'", `${ROOT}/src/ui/forms/m.ts`)
    await transform("import { cx } from '.'", `${ROOT}/src/ui/m.ts`)

    expect(parsed).toEqual([])
  })

  describe('recognition by the module that writes the specifier', () => {
    const recognised = async (
      cxModules: readonly string[],
      rows: readonly (readonly [importer: string, source: string])[],
    ): Promise<string[]> => {
      const { context, transform } = fixture(cxModules)
      for (const [importer, source] of rows) {
        await transform(`import { cx } from '${source}'\nexport const r = cx('flex')`, importer)
      }
      return rows
        .filter(([importer]) =>
          context.state.recognised.has(recognisedKey('client', DECLARED, importer)),
        )
        .map(([importer]) => importer)
    }

    it('recognises each spelling that resolves, from where it is written, to the declared file', async () => {
      const rows = [
        [`${ROOT}/src/a.ts`, './ui'],
        [`${ROOT}/src/b.ts`, './ui/index'],
        [`${ROOT}/src/c.ts`, '@/ui'],
        [`${ROOT}/src/pages/d.ts`, '../ui'],
        [`${ROOT}/src/pages/e.ts`, '../ui/'],
        [`${ROOT}/src/f.ts`, './ui?v=1'],
        [`${ROOT}/src/ui/g.ts`, '.'],
        [`${ROOT}/src/ui/h.ts`, './'],
        [`${ROOT}/src/ui/forms/i.ts`, '..'],
        [`${ROOT}/src/ui/forms/j.ts`, '../'],
        [`${ROOT}/src/k.ts`, '#internal/ui'],
        [`${ROOT}/src/ui/forms/inputs/l.ts`, '../..'],
        [`${ROOT}/src/ui/forms/inputs/m.ts`, '../../'],
        [`${ROOT}/src/ui/n.ts`, './.'],
      ] as const

      expect(await recognised(['./src/ui/index.ts'], rows)).toEqual(rows.map(([id]) => id))
    })

    it('does not recognise the same text where it names another file', async () => {
      const rows = [
        [`${ROOT}/src/feature/b.ts`, './ui'],
        [`${ROOT}/src/pages/c.ts`, './ui'],
        [`${ROOT}/src/ui/forms/d.ts`, '.'],
      ] as const

      expect(await recognised(['./src/ui/index.ts'], rows)).toEqual([])
    })

    it('reads a relative entry by its file only, never as written', async () => {
      const { context, transform } = fixture(['./ui'])
      const importer = `${ROOT}/src/feature/b.ts`
      // The sibling `./ui` is a plain function; the entry names the barrel at `<root>/ui`.
      await transform("import { cx } from './ui'\nexport const b = cx('card', v)", importer)
      await transform("import { cx } from '../ui'\nexport const a = cx('flex')", `${ROOT}/src/a.ts`)

      expect(context.state.modules.get(`client\0${importer}`)?.problems).toEqual([])
      expect(
        context.state.recognised.has(recognisedKey('client', `${ROOT}/ui/index.ts`, importer)),
      ).toBe(false)
      expect(
        context.state.recognised.has(
          recognisedKey('client', `${ROOT}/ui/index.ts`, `${ROOT}/src/a.ts`),
        ),
      ).toBe(true)
    })

    it('still reads an entry that is not relative as written', async () => {
      const { context, transform } = fixture(['#ds'])
      await transform("import { cx } from '#ds'\nexport const e = cx('flex')", `${ROOT}/src/e.ts`)

      expect([...(context.state.modules.get(`client\0${ROOT}/src/e.ts`)?.atoms ?? [])]).toEqual([
        'flex',
      ])
    })

    it('binds a # entry only when the import resolves, from its own module, to a listed file', async () => {
      // `#scoped` is the barrel from the project root, and another package scope's own function
      // from `feature/b.ts`: the same text, so the text alone binds nothing.
      const modules = ['./src/ui/index.ts', '#scoped']
      const other = fixture(modules, { '#scoped': `${ROOT}/src/feature/ui.ts` })
      const own = `${ROOT}/src/feature/b.ts`
      await other.transform(
        "import { cx } from '#scoped'\nexport const b = (v) => cx('card', v)",
        own,
      )

      expect(other.context.state.modules.get(`client\0${own}`)?.problems).toEqual([])
      expect(other.context.state.recognised.has(recognisedKey('client', DECLARED, own))).toBe(false)
      const same = fixture(modules)
      const importer = `${ROOT}/src/a.ts`
      await same.transform("import { cx } from '#scoped'\nexport const a = cx('flex')", importer)

      expect(same.context.state.recognised.has(recognisedKey('client', DECLARED, importer))).toBe(
        true,
      )
    })

    it('records an import through an entry that resolved to nothing from the root, once it lands on a listed file', async () => {
      // `#local` names nothing from the project root, and the declared barrel from a module.
      const { context, transform } = fixture(['./src/ui/index.ts', '#local'], {
        '#local': DECLARED,
      })
      const importer = `${ROOT}/src/p.ts`
      await transform("import { cx } from '#local'\nexport const p = cx('flex')", importer)

      expect(context.state.recognised.has(recognisedKey('client', DECLARED, importer))).toBe(true)
    })

    it('ignores an entry that is Nave’s own module, whatever it is read beside', async () => {
      const { context, parsed, transform } = fixture(['@navecss/core/cx'])
      await transform(
        "import { cx } from '@navecss/core/cx'\nexport const d = cx('grid')",
        `${ROOT}/src/d.ts`,
      )

      expect([...(context.state.modules.get(`client\0${ROOT}/src/d.ts`)?.atoms ?? [])]).toEqual([
        'grid',
      ])
      expect(parsed).toEqual([`${ROOT}/src/d.ts`])
      expect(context.state.recognised.size).toBe(0)
    })
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

describe('AC-used-atoms-49 - a relative specifier is judged without its query', () => {
  it.each(['./ui', '../ui?v=1', '.?v=1', '..?v=1', './.?x#y', './ui#top'])(
    'reads %s as relative',
    (specifier) => {
      expect(isRelative(specifier)).toBe(true)
    },
  )

  it.each(['#ds', '#ds?v=1', '@acme/ui', '@acme/ui?v=1', '/src/ui', 'ui'])(
    'does not read %s as relative',
    (specifier) => {
      expect(isRelative(specifier)).toBe(false)
    },
  )
})

describe('AC-used-atoms-49 - the text test grows with the text, not with its worst runs', () => {
  const ROOT = '/scale-root'
  const DECLARED = `${ROOT}/src/ui/index.ts`

  async function listing(): ReturnType<typeof declaredModulesFor> {
    const context = createUsedContext(
      resolveUsedOptions({ cxModules: ['./src/ui/index.ts'] }),
      createExtendSource(undefined),
    )
    context.root = ROOT
    const resolver = {
      resolve: (source: string) =>
        // Vite's resolver answers `null` for a specifier that names no file.
        // eslint-disable-next-line unicorn/no-null -- the host's own answer
        Promise.resolve(source === './src/ui/index.ts' ? { id: DECLARED } : null),
    }
    return declaredModulesFor(context, resolver, 'client')
  }

  /**
   * The fastest of several runs of `work`, repeated until one run takes a few milliseconds so a
   * clock's grain does not decide the answer. Load only ever adds time, so the fastest run is
   * the one that says what the pattern costs.
   */
  function fastest(work: () => void): number {
    const once = performance.now()
    work()
    const elapsed = Math.max(performance.now() - once, 0.001)
    const reps = Math.max(1, Math.ceil(8 / elapsed))
    let best = Infinity
    for (let run = 0; run < 7; run += 1) {
      const start = performance.now()
      for (let rep = 0; rep < reps; rep += 1) work()
      best = Math.min(best, (performance.now() - start) / reps)
    }
    return best
  }

  /**
   * How much longer the text test takes for `make(2n)` than for `make(n)`: about 2 when it is
   * linear, about 4 when it is quadratic. Never a time budget.
   */
  async function growth(make: (n: number) => string): Promise<number> {
    const declared = await listing()
    const time = (n: number): number => {
      const code = make(n)
      return fastest(() => isAboutListed({ code, id: `${ROOT}/src/m.ts` }, declared))
    }
    // One stall of the scheduler can lengthen either time of a measurement by a whole factor, as a
    // pattern that takes a fraction of a millisecond is easily outlasted by it. A stall only ever
    // adds time, and a quadratic pattern is about 4 in every measurement, so the least of three
    // measurements still tells the two apart.
    return Math.min(...Array.from({ length: 3 }, () => time(8000) / time(4000)))
  }

  const MOST = 3
  const shapes: [string, (n: number) => string][] = [
    ['a quote-free run of names and queries', (n) => `'${'/ui?x'.repeat(n)}`],
    ['a quote-free run of names and hashes', (n) => `\`${'/index#a'.repeat(n)}`],
    ['`from` followed by many spaces', (n) => `from${' '.repeat(n)}`],
    ['many `from` each followed by spaces', (n) => `from${' '.repeat(40)}`.repeat(n)],
    ['many quotes each opening a long text', (n) => `'ui?${'x'.repeat(60)}`.repeat(n)],
  ]

  it.each(shapes)(
    'stays linear for %s',
    async (_name, make) => {
      expect(await growth(make)).toBeLessThan(MOST)
    },
    60_000,
  )

  it('takes about twice as long for twice as many typical modules', async () => {
    const typical = [
      "import { cx } from './ui'",
      'const s = "it\'s"',
      'const t = `a ${s} b`',
      "export const x = 'a.b.c'.split('.')",
      "export const y = import('./lazy')",
    ].join('\n')

    expect(await growth((n) => `${typical}\n`.repeat(n / 4))).toBeLessThan(MOST)
  }, 60_000)

  const spellings: [string, boolean][] = [
    ["import { cx } from './ui'", true],
    ["import { cx } from '../ui/'", true],
    ["import { cx } from './ui?v=1'", true],
    ["import { cx } from '#internal/ui'", true],
    ["import { cx } from '.'", true],
    ['import{cx}from"."', true],
    ["export const l = import('..')", true],
    ["export const l = import(\n '..'\n)", true],
    ["import { cx } from './ui/index.ts#x'", true],
    ["import { cx } from\n '..'", true],
    ["import { cx } from './uix'", false],
    ["export const s = 'a.b'.split('.')", false],
    ["import { cx } from './ui.d.ts'", false],
  ]

  it.each(spellings)('reads %j the same way: parsed is %s', async (code, expected) => {
    const declared = await listing()

    expect(isAboutListed({ code, id: `${ROOT}/src/m.ts` }, declared)).toBe(expected)
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

describe('the cxModules option’s documentation', () => {
  const source = readFileSync(new URL('../src/vite-options.ts', import.meta.url), 'utf8')
  const docblock = source
    .slice(source.indexOf('Modules that re-export'), source.indexOf('cxModules?:'))
    .replaceAll(/\s*\n\s*\*\s?/g, ' ')

  it('lists no # import among the entries that match an import written the same way', () => {
    expect(docblock).not.toContain('an alias, a `#` import')
    expect(docblock).toContain(
      'A package name or subpath, an alias or an absolute path matches an import written the same way.',
    )
  })

  it('says a # entry matches only where the import resolves to a listed file', () => {
    expect(docblock).toContain(
      'A `#` entry matches an import written the same way only where that import resolves to a listed file',
    )
  })
})
