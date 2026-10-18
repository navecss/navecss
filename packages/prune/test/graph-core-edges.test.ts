/**
 * Imports that reach core's `cx` module in a form the reader does not bind: a `require()` call, a
 * TypeScript `import x = require()`, and either one inside an installed package. Each call made
 * through such an import would ship with no rule, so the module is recorded as a problem.
 */
import { describe, expect, it } from 'vitest'

import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

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
