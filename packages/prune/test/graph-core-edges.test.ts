/**
 * Imports that reach core's `cx` module in a form the reader does not bind: a `require()` call, a
 * TypeScript `import x = require()`, and either one inside an installed package. Each call made
 * through such an import would ship with no rule, so the module is recorded as a problem.
 */
import { cpSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'
import { CORE_ROOT } from './helpers/project.ts'

const project = scratchProjects()

/**
 * The problems of kind `reference` the record holds, by file and construct.
 */
function references(record: Awaited<ReturnType<typeof runAndRead>>['record']): string[] {
  return record.problems
    .filter((problem) => problem.kind === 'reference')
    .map((problem) => `${problem.file}:${problem.construct}`)
}

describe('an import of cx the reader does not bind is a problem', () => {
  it('control: an import declaration of cx is read and records no problem', async () => {
    const { atoms, record } = await runAndRead(
      project({
        'app/page.tsx':
          "import { cx } from '@navecss/core/cx'\n\nexport default function Page() {\n  return <main className={cx('grid')} />\n}\n",
      }),
    )
    expect(atoms).toContain('grid')
    expect(record.problems).toEqual([])
  })

  it("const { cx } = require('@navecss/core/cx') in a page is a reference problem", async () => {
    const { record } = await runAndRead(
      project({
        'app/page.jsx':
          "const { cx } = require('@navecss/core/cx')\n\nexport default function Page() {\n  return <main className={cx('grid')} />\n}\n",
      }),
    )
    expect(references(record)).toEqual(["app/page.jsx:'@navecss/core/cx'"])
  })

  it("import n = require('@navecss/core/cx') in a TypeScript page is a reference problem", async () => {
    const { record } = await runAndRead(
      project({
        'app/page.tsx':
          "import n = require('@navecss/core/cx')\n\nexport default function Page() {\n  return <main className={n.cx('grid')} />\n}\n",
      }),
    )
    expect(references(record)).toEqual(["app/page.tsx:'@navecss/core/cx'"])
  })

  it('a CommonJS dependency that requires cx is a reference problem in that package', async () => {
    const app = project({
      'app/page.tsx':
        "import { Box } from 'cjs-lib'\n\nexport default function Page() {\n  return <Box />\n}\n",
    })
    app.install('cjs-lib', {
      'package.json': JSON.stringify({
        name: 'cjs-lib',
        version: '1.0.0',
        main: 'index.cjs',
        dependencies: { '@navecss/core': '*' },
      }),
      'index.cjs': "const { cx } = require('@navecss/core/cx')\nexports.Box = () => cx('grid')\n",
    })
    const { record } = await runAndRead(app)
    const found = record.problems.filter((problem) => problem.kind === 'reference')
    expect(found.map((problem) => [problem.file, problem.pkg, problem.construct])).toEqual([
      ['node_modules/cjs-lib/index.cjs', 'cjs-lib', "'@navecss/core/cx'"],
    ])
  })
})

/**
 * Copies core's manifest and built files to `into`, as a dependency that vendors core, or a second
 * install of it under another name, holds them.
 */
function copyCore(into: string): void {
  mkdirSync(into, { recursive: true })
  cpSync(path.join(CORE_ROOT, 'package.json'), path.join(into, 'package.json'))
  cpSync(path.join(CORE_ROOT, 'dist'), path.join(into, 'dist'), { recursive: true })
}

/**
 * A page module whose component returns an element with `className={<call>}`, after `head`.
 */
function pageWith(call: string, head: string): string {
  return `${head}\n\nexport default function Page() {\n  return <main className={${call}} />\n}\n`
}

/**
 * The record's problems, by file, kind and construct.
 */
function problemsOf(record: Awaited<ReturnType<typeof runAndRead>>['record']): string[] {
  return record.problems.map((problem) => `${problem.file}|${problem.kind}|${problem.construct}`)
}

/**
 * A project whose page renders `Box` from `lib`, which holds its own copy of core and `main`.
 */
function projectWithNestedCore(main: string, text: string): Project {
  const app = project({ 'app/page.tsx': pageWith('Box()', "import { Box } from 'lib'") })
  const root = app.install('lib', {
    'package.json': JSON.stringify({
      name: 'lib',
      version: '1.0.0',
      ...(main.endsWith('.js') && { type: 'module' }),
      main,
      dependencies: { '@navecss/core': '*' },
    }),
    [main]: text,
  })
  copyCore(path.join(root, 'node_modules/@navecss/core'))
  return app
}

describe('a type-only import-equals declaration makes no edge', () => {
  it('import type n = require() of cx records no problem', async () => {
    const { record } = await runAndRead(
      project({
        'app/types.ts':
          "import type n = require('@navecss/core/cx')\nexport type Cx = typeof n.cx\n",
        'app/page.tsx': pageWith(
          "cx('grid')",
          "import { cx } from '@navecss/core/cx'\nimport './types'",
        ),
      }),
    )
    expect(problemsOf(record)).toEqual([])
  })

  it('the value form, even when its binding is used only as a type, is a reference problem', async () => {
    const { record } = await runAndRead(
      project({
        'app/types.ts': "import n = require('@navecss/core/cx')\nexport type Cx = typeof n.cx\n",
        'app/page.tsx': pageWith(
          "cx('grid')",
          "import { cx } from '@navecss/core/cx'\nimport './types'",
        ),
      }),
    )
    expect(problemsOf(record)).toEqual(["app/types.ts|reference|'@navecss/core/cx'"])
  })
})

describe('cx reached through createRequire() or through another copy of core', () => {
  it('a call of a createRequire() result under any name is a require edge', async () => {
    const { record } = await runAndRead(
      project({
        'app/page.tsx': pageWith(
          "load('@navecss/core/cx').cx('grid')",
          "import { createRequire } from 'node:module'\nconst load = createRequire(import.meta.url)",
        ),
      }),
    )
    expect(problemsOf(record)).toEqual(["app/page.tsx|reference|'@navecss/core/cx'"])
  })

  it('a dependency that vendors core and imports its cx file is a reference problem', async () => {
    const app = project({ 'app/page.tsx': pageWith('Box()', "import { Box } from '@acme/ui'") })
    const root = app.install('@acme/ui', {
      'package.json': JSON.stringify({
        name: '@acme/ui',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        dependencies: { '@navecss/core': '*' },
      }),
      'index.js':
        "import { cx } from './vendor/core/dist/cx.js'\nexport const Box = () => cx('grid')\n",
    })
    copyCore(path.join(root, 'vendor/core'))
    const { record } = await runAndRead(app)
    expect(problemsOf(record)).toEqual([
      "node_modules/@acme/ui/index.js|reference|'./vendor/core/dist/cx.js'",
    ])
  })

  it('core installed a second time under another name is a reference problem', async () => {
    const app = project({ 'app/page.tsx': pageWith("cx('grid')", "import { cx } from 'nave/cx'") })
    copyCore(path.join(app.dir, 'node_modules/nave'))
    const { record } = await runAndRead(app)
    expect(problemsOf(record)).toEqual(["app/page.tsx|reference|'nave/cx'"])
  })
})

describe('the forms of reaching cx already refused stay refused', () => {
  it('a require() bound to the name require by createRequire() is a reference problem', async () => {
    const { record } = await runAndRead(
      project({
        'app/page.tsx': pageWith(
          "require('@navecss/core/cx').cx('grid')",
          "import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)",
        ),
      }),
    )
    expect(problemsOf(record)).toEqual(["app/page.tsx|reference|'@navecss/core/cx'"])
  })

  it('a local CommonJS module that re-exports cx is a reference problem in that module', async () => {
    const { record } = await runAndRead(
      project({
        'app/ui.js': "module.exports = require('@navecss/core/cx')\n",
        'app/page.tsx': pageWith("cx('grid')", "import { cx } from './ui'"),
      }),
    )
    expect(problemsOf(record)).toEqual(["app/ui.js|reference|'@navecss/core/cx'"])
  })

  it('a local export * from cx is a reexport problem', async () => {
    const { record } = await runAndRead(
      project({
        'app/ui.ts': "export * from '@navecss/core/cx'\n",
        'app/page.tsx': pageWith("cx('grid')", "import { cx } from './ui'"),
      }),
    )
    expect(record.problems.map((problem) => [problem.file, problem.kind])).toEqual([
      ['app/ui.ts', 'reexport'],
    ])
  })

  it('a tsconfig path alias to the cx file is a reference problem', async () => {
    const { record } = await runAndRead(
      project({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            jsx: 'preserve',
            baseUrl: '.',
            paths: { '#cx': ['./node_modules/@navecss/core/dist/cx.js'] },
          },
        }),
        'app/page.tsx': pageWith("cx('grid')", "import { cx } from '#cx'"),
      }),
    )
    expect(problemsOf(record)).toEqual(["app/page.tsx|reference|'#cx'"])
  })

  it('a dependency with its own nested copy of core that require()s cx is a reference problem', async () => {
    const app = projectWithNestedCore(
      'index.cjs',
      "const { cx } = require('@navecss/core/cx')\nexports.Box = () => cx('grid')\n",
    )
    const { record } = await runAndRead(app)
    expect(problemsOf(record)).toEqual(["node_modules/lib/index.cjs|reference|'@navecss/core/cx'"])
  })

  it('control: the same dependency importing cx is read', async () => {
    const app = projectWithNestedCore(
      'index.js',
      "import { cx } from '@navecss/core/cx'\nexport const Box = () => cx('grid')\n",
    )
    const { atoms, record } = await runAndRead(app)
    expect(problemsOf(record)).toEqual([])
    expect(atoms).toContain('grid')
  })
})
