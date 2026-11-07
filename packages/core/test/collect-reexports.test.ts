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

type Files = Readonly<Record<string, string>>

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
function hostOver(files: Files): ModuleHost {
  const resolve = (source: string, importer: string | undefined): string | undefined => {
    if (source === '@acme/ui') return ENTRY
    if (importer === undefined || !source.startsWith('.')) return undefined
    const file = path.resolve(path.dirname(importer), source)
    return Object.hasOwn(files, file) ? file : undefined
  }
  return {
    environment: { name: 'client' },
    getModuleInfo: (id) => {
      const code = files[id]
      // eslint-disable-next-line unicorn/no-null -- the module graph holds `null` for a module it does not hold
      if (code === undefined) return null
      const importers = Object.entries(files)
        .filter(([from, text]) =>
          specifiersOf(text).some((specifier) => resolve(specifier, from) === id),
        )
        .map(([from]) => from)
      return { code, importers, dynamicImporters: [] }
    },
    resolve: (source, importer) => {
      const id = resolve(source, importer)
      // eslint-disable-next-line unicorn/no-null -- the host answers `null` for a specifier that resolves to nothing
      return Promise.resolve(id === undefined ? null : { id })
    },
    parseModule: (code) => parseAst(code, { lang: 'ts' }),
  }
}

const CONTEXT: TakesContext = {
  root: ROOT,
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
async function judged(entry: string, app: string): Promise<LocatedProblem[]> {
  const files: Files = {
    [ENTRY]: entry,
    [`${UI}/dist/button.js`]:
      "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
    [APP]: app,
  }
  const outcome = await judgeReexports(hostOver(files), CONTEXT, [
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
})
