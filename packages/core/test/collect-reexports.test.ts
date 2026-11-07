/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-52: the read of who takes a `cx` that a listed package
 * gives out runs over any host's module graph, not only Vite's. A host that reads authored sources
 * hands it a stand-in graph; a re-export that `keepFor` stands in for stays an error while a module
 * of the consumer takes it, and carries the specifier that clears it or the takes that do not.
 */
import path from 'node:path'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'
import type { ModuleHost, TakesContext } from '../src/vite-takes-host.ts'
import type { LocatedProblem } from '../src/vite-used-report.ts'

import { CX_SOURCE, readModule } from '../src/vite-collect.ts'
import { judgeReexports } from '../src/vite-reexport-judge.ts'

const ROOT = '/app'
const UI = '/app/node_modules/@acme/ui'
const ENTRY = `${UI}/dist/index.js`
const APP = '/app/components/App.ts'
const SERVER = `${UI}/dist/server.js`

type Files = Readonly<Record<string, string>>

/**
 * Every file the package's name resolves to, the first being the one `resolve` answers.
 */
type Entry = () => readonly string[]

/**
 * Every file a specifier other than the package's name resolves to, as a package resolves to one
 * file per condition.
 */
type Alternatives = Readonly<Record<string, readonly string[]>>

/**
 * The specifiers a file writes: the quoted text after each `from`.
 */
function specifiersOf(code: string): string[] {
  return code
    .matchAll(/\bfrom '([^']+)'/gu)
    .map((match) => match[1]!)
    .toArray()
}

/**
 * A module graph over `files`: `@acme/ui` resolves to the package's entry, a relative specifier to
 * the file it names, and the importers of a file are the files whose specifiers resolve to it.
 */
function hostOver(
  files: Files,
  entryOf: Entry = () => [ENTRY],
  alternatives: Alternatives = {},
): ModuleHost {
  const resolveEvery = (source: string, importer: string | undefined): string[] => {
    if (source === '@acme/ui') return [...entryOf()]
    if (Object.hasOwn(alternatives, source)) return [...alternatives[source]!]
    if (importer === undefined || !source.startsWith('.')) return []
    const file = path.resolve(path.dirname(importer), source)
    return Object.hasOwn(files, file) ? [file] : []
  }
  const resolve = (source: string, importer: string | undefined): string | undefined =>
    resolveEvery(source, importer)[0]
  return {
    environment: { name: 'client' },
    getModuleInfo: (id) => {
      const code = files[id]
      // eslint-disable-next-line unicorn/no-null -- the module graph holds `null` for a module it does not hold
      if (code === undefined) return null
      const importers = Object.entries(files)
        .filter(([from, text]) =>
          specifiersOf(text).some((specifier) => resolveEvery(specifier, from).includes(id)),
        )
        .map(([from]) => from)
      return { code, importers, dynamicImporters: [] }
    },
    resolve: (source, importer) => {
      const id = resolve(source, importer)
      // eslint-disable-next-line unicorn/no-null -- the host answers `null` for a specifier that resolves to nothing
      return Promise.resolve(id === undefined ? null : { id })
    },
    resolveAll: (source, importer) => Promise.resolve(resolveEvery(source, importer)),
    parseModule: (code) => parseAst(code, { lang: 'tsx' }),
  }
}

const CONTEXT: TakesContext = {
  root: ROOT,
  rootName: 'the project root',
  options: { cxModules: [], keepFor: { '@acme/ui': ['flex'] } },
  state: { declared: new Map() },
  packageOf: (id) =>
    Promise.resolve(id.includes('/node_modules/@acme/ui/') ? '@acme/ui' : undefined),
  labelOf: (id) => path.relative(ROOT, id),
}

/**
 * The problems the entry's own reading gives, placed as a host places them, in the form of a
 * package `keepFor` lists: set aside, to be judged by what takes them.
 */
function suppressedIn(files: Files): LocatedProblem[] {
  const code = files[ENTRY]!
  const program = parseAst(code, { lang: 'ts' }) as unknown as AstNode
  const reading = readModule(code, program, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: true,
  })
  return reading.problems.map((problem) => ({
    ...problem,
    file: path.relative(ROOT, ENTRY),
    line: 1,
    column: 1,
    pkg: '@acme/ui',
    moduleId: ENTRY,
  }))
}

/**
 * What the judgement leaves as errors for an application `app` over a package whose entry is `entry`.
 */
async function judged(
  entry: string,
  app: string,
  entryOf: Entry = () => [ENTRY],
): Promise<LocatedProblem[]> {
  return judgedOver(
    {
      [ENTRY]: entry,
      [SERVER]: "export { Button } from './button.js'\n",
      [`${UI}/dist/button.js`]:
        "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
      [APP]: app,
    },
    entryOf,
  )
}

/**
 * What the judgement leaves as errors over the module graph `files`, whose entry is `ENTRY`.
 */
async function judgedOver(
  files: Files,
  entryOf: Entry = () => [ENTRY],
  alternatives: Alternatives = {},
): Promise<LocatedProblem[]> {
  const outcome = await judgeReexports(hostOver(files, entryOf, alternatives), CONTEXT, [
    { problems: [], suppressed: suppressedIn(files) },
  ])
  return outcome.problems
}

const PLAIN = "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n"
const RENAMED =
  "export { cx as cn } from '@navecss/core/cx'\nexport { Button } from './button.js'\n"

describe('AC-nextjs-used-atoms-17: a host-neutral read of who takes a package’s re-export of cx', () => {
  it('keeps the re-export an error when the application takes cx from the package, with the specifier that clears it', async () => {
    const problems = await judged(
      PLAIN,
      "import { cx } from '@acme/ui'\nexport const A = cx('grid')\n",
    )

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
    expect(problems[0]!.specifier).toBe('@acme/ui')
  })

  it('clears the re-export when nothing of the application takes cx from the package', async () => {
    const problems = await judged(
      PLAIN,
      "import { Button } from '@acme/ui'\nexport const A = [Button]\n",
    )

    expect(problems).toEqual([])
  })

  it('keeps a renamed re-export an error with the takes that only an import from Nave ends', async () => {
    const problems = await judged(
      RENAMED,
      "import { cn } from '@acme/ui'\nexport const A = cn('grid')\n",
    )

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
    expect(problems[0]!.specifier).toBeUndefined()
    expect(problems[0]!.takes?.map((take) => [take.taker, take.names])).toEqual([
      ['components/App.ts', ['cn']],
    ])
  })

  it('clears a renamed re-export when the application takes only the package’s other exports', async () => {
    const problems = await judged(
      RENAMED,
      "import { Button } from '@acme/ui'\nexport const A = [Button]\n",
    )

    expect(problems).toEqual([])
  })

  it('clears a re-export when the application takes only other exports, whichever file the package name resolves to first', async () => {
    const problems = await judged(
      PLAIN,
      "import { Button } from '@acme/ui'\nexport const A = [Button]\n",
      () => [SERVER, ENTRY],
    )

    expect(problems).toEqual([])
  })

  it('keeps the re-export an error with its clearing specifier when the package name resolves to another file first', async () => {
    const problems = await judged(
      PLAIN,
      "import { cx } from '@acme/ui'\nexport const A = cx('grid')\n",
      () => [SERVER, ENTRY],
    )

    expect(problems.map((problem) => [problem.kind, problem.specifier])).toEqual([
      ['reexport', '@acme/ui'],
    ])
  })

  describe('a take written for the types only is no take', () => {
    const BUTTON = "import { Button } from '@acme/ui'\nexport const A = [Button]\n"

    it.each([
      [
        'an import type declaration',
        `import type { cn } from '@acme/ui'\n${BUTTON}export type T = typeof cn\n`,
      ],
      [
        'a type-only import specifier',
        "import { type cn, Button } from '@acme/ui'\nexport const A = [Button]\nexport type T = typeof cn\n",
      ],
      ['an export type declaration', `export type { cn } from '@acme/ui'\n${BUTTON}`],
      ['a type-only export specifier', `export { type cn } from '@acme/ui'\n${BUTTON}`],
      [
        'an import used only in a type position',
        "import { cn } from '@acme/ui'\nexport type T = typeof cn\n",
      ],
    ])('clears the renamed re-export for %s', async (_name, app) => {
      expect(await judged(RENAMED, app)).toEqual([])
    })

    it.each([
      [
        'a value use beside a type use',
        "import { cn } from '@acme/ui'\nexport const A = cn('grid')\nexport type T = typeof cn\n",
      ],
      ['an import that nothing references', "import { cn } from '@acme/ui'\nexport const A = 1\n"],
    ])('keeps the renamed re-export an error for %s', async (_name, app) => {
      const problems = await judged(RENAMED, app)

      expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
    })
  })
})

describe('a JSX element name is a use of the value it names', () => {
  const CAPITAL =
    "export { cx as Cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n"
  const TYPED = "import { Cx } from '@acme/ui'\nexport type T = typeof Cx\n"

  it.each([
    ['a typeof and an element', `${TYPED}export const A = <Cx />\n`],
    ['a typeof and an element with children', `${TYPED}export const A = <Cx>x</Cx>\n`],
    ['a typeof and the object of a member tag', `${TYPED}export const A = <Cx.Sub />\n`],
    [
      'a type reference and an element',
      "import { Cx } from '@acme/ui'\nlet v: Cx\nexport const A = [v, <Cx />]\n",
    ],
    ['an element alone', "import { Cx } from '@acme/ui'\nexport const A = <Cx />\n"],
  ])('keeps the re-export an error for %s', async (_name, app) => {
    const problems = await judged(CAPITAL, app)

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  it('clears the re-export for a type position that is the only use', async () => {
    expect(await judged(CAPITAL, TYPED)).toEqual([])
  })
})

describe('a member tag written on a namespace import takes that member', () => {
  const CAPITAL =
    "export { cx as Cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n"
  const NAMESPACE = "import * as UI from '@acme/ui'\n"

  it.each([
    ['a member tag', '<UI.Cx />'],
    ['a member tag with children', '<UI.Cx>x</UI.Cx>'],
    ['a member tag of a member', '<UI.Cx.Sub />'],
    ['a call', "UI.Cx('a')"],
  ])('keeps the re-export an error for %s', async (_name, use) => {
    const problems = await judged(CAPITAL, `${NAMESPACE}export const A = ${use}\n`)

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  it('clears the re-export for a member tag of another member', async () => {
    expect(await judged(CAPITAL, `${NAMESPACE}export const A = <UI.Menu />\n`)).toEqual([])
  })
})

describe('a barrel that stars the module and a package that resolves to a file per condition', () => {
  const BARREL = `${UI}/dist/barrel.js`
  const CLIENT = `${UI}/dist/rival-client.js`
  const SERVER_SIDE = `${UI}/dist/rival-server.js`
  const MID = `${UI}/dist/mid.js`
  const EXPORTS_CN = 'export const cn = 1\n'
  const EXPORTS_OTHER = 'export const other = 1\n'
  const CALL = "import { cn } from '@acme/ui'\nexport const A = cn('grid')\n"

  const barrel = (rival: Record<string, string>, call: string = CALL): Promise<LocatedProblem[]> =>
    judgedOver(
      {
        [ENTRY]: RENAMED,
        [BARREL]: "export * from './index.js'\nexport * from '@acme/rival'\n",
        [APP]: call,
        ...rival,
      },
      () => [BARREL],
      { '@acme/rival': Object.keys(rival) },
    )

  it('keeps the call an error when only the file of one condition exports the name', async () => {
    const problems = await barrel({ [CLIENT]: EXPORTS_OTHER, [SERVER_SIDE]: EXPORTS_CN })

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  it('keeps the call an error when only the first file exports the name', async () => {
    const problems = await barrel({ [CLIENT]: EXPORTS_CN, [SERVER_SIDE]: EXPORTS_OTHER })

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  it('clears the call when every file exports the name with another binding', async () => {
    expect(await barrel({ [CLIENT]: EXPORTS_CN, [SERVER_SIDE]: EXPORTS_CN })).toEqual([])
  })

  it('clears the call when the one file exports the name with another binding', async () => {
    expect(await barrel({ [CLIENT]: EXPORTS_CN })).toEqual([])
  })

  it('keeps the call an error when no file exports the name', async () => {
    const problems = await barrel({ [CLIENT]: EXPORTS_OTHER, [SERVER_SIDE]: EXPORTS_OTHER })

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  it('finds the export of Nave’s cx in the one file of two that a nested star resolves to', async () => {
    const problems = await judgedOver(
      {
        [ENTRY]: RENAMED,
        [BARREL]: "export * from './index.js'\nexport * from './mid.js'\n",
        [MID]: "export * from '@acme/inner'\nexport * from './plain.js'\n",
        [`${UI}/dist/plain.js`]: EXPORTS_CN,
        [CLIENT]: EXPORTS_CN,
        [APP]: CALL,
      },
      () => [BARREL],
      { '@acme/inner': [CLIENT, ENTRY] },
    )

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  const nested = (inner: Record<string, string>): Promise<LocatedProblem[]> =>
    judgedOver(
      {
        [ENTRY]: RENAMED,
        [BARREL]: "export * from './index.js'\nexport * from './mid.js'\n",
        [MID]: "export * from '@acme/inner'\n",
        [APP]: CALL,
        ...inner,
      },
      () => [BARREL],
      { '@acme/inner': Object.keys(inner) },
    )

  it('keeps the call an error when only one file of a nested star exports the name', async () => {
    const problems = await nested({ [CLIENT]: EXPORTS_CN, [SERVER_SIDE]: EXPORTS_OTHER })

    expect(problems.map((problem) => problem.kind)).toEqual(['reexport'])
  })

  it('clears the call when every file of a nested star exports the name', async () => {
    expect(await nested({ [CLIENT]: EXPORTS_CN, [SERVER_SIDE]: EXPORTS_CN })).toEqual([])
  })

  it('clears the call when the one file of a nested star exports the name', async () => {
    expect(await nested({ [CLIENT]: EXPORTS_CN })).toEqual([])
  })

  it('clears the call when every file of a specifier stars a module that exports the name', async () => {
    const shared = `${UI}/dist/shared.js`
    const problems = await judgedOver(
      {
        [ENTRY]: RENAMED,
        [BARREL]: "export * from './index.js'\nexport * from '@acme/rival'\n",
        [CLIENT]: "export * from './shared.js'\n",
        [SERVER_SIDE]: "export * from './shared.js'\n",
        [shared]: EXPORTS_CN,
        [APP]: CALL,
      },
      () => [BARREL],
      { '@acme/rival': [CLIENT, SERVER_SIDE] },
    )

    expect(problems).toEqual([])
  })

  it('clears the call when every file of a nested star stars a module that exports the name', async () => {
    const shared = `${UI}/dist/shared.js`
    const problems = await nested({
      [CLIENT]: "export * from './shared.js'\n",
      [SERVER_SIDE]: "export * from './shared.js'\n",
      [shared]: EXPORTS_CN,
    })

    expect(problems).toEqual([])
  })
})
