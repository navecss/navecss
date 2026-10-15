import { symlinkSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const PACKAGE_JSON = JSON.stringify({
  name: 'bad-lib',
  version: '1.0.0',
  type: 'module',
  main: 'index.js',
  dependencies: { '@navecss/core': '*' },
})

const INDEX = `import { cx } from '@navecss/core/cx'

export const first = cx(one)

export const second = cx(two)

export const third = cx(three)
`

describe('AC-nextjs-used-atoms-18: a dependency problem is positioned at its real path', () => {
  it('AC-nextjs-used-atoms-18: three problems carry the .pnpm path and their 1-based lines', async () => {
    const project = makeProject({
      'app/page.tsx':
        "import { first } from 'bad-lib'\n\nexport default function Page() {\n  return <div className={first} />\n}\n",
    })
    const store = '.pnpm/bad-lib@1.0.0/node_modules/bad-lib'
    project.install(store, { 'package.json': PACKAGE_JSON, 'index.js': INDEX })
    symlinkSync(store, path.join(project.dir, 'node_modules/bad-lib'), 'dir')

    await runAtomic(project)

    const problems = recordOf(project).problems.filter((problem) =>
      problem.file.includes('bad-lib'),
    )
    expect(problems.map((problem) => problem.line).toSorted((a, b) => a - b)).toEqual([3, 5, 7])
    for (const problem of problems) {
      expect(problem.file.startsWith('node_modules/.pnpm/bad-lib@')).toBe(true)
      expect(problem.file.endsWith('/node_modules/bad-lib/index.js')).toBe(true)
      expect(problem.column).toBeGreaterThanOrEqual(1)
    }
  })
})
