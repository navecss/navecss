/**
 * A file whose reading throws is that file's problem: the walk reads every other file and the run
 * still leaves its record.
 */
import type * as Collect from '@navecss/core/collect'

import { describe, expect, it, vi } from 'vitest'

import { moduleSource, runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const MARK = '/* reading this file throws */'

vi.mock('@navecss/core/collect', async (importOriginal) => {
  const actual = await importOriginal<typeof Collect>()
  return {
    ...actual,
    readModule: (...args: Parameters<typeof actual.readModule>) => {
      if (args[0].includes(MARK)) throw new TypeError('the reader met a tree it cannot read')
      return actual.readModule(...args)
    },
  }
})

const project = scratchProjects()

describe('a throw while reading one file', () => {
  it('is an unreadable problem in that file, and the rest of the graph is read', async () => {
    const { atoms, record } = await runAndRead(
      project({
        'app/page.tsx':
          "import { Card } from './Card'\nimport { Other } from './Other'\n\nexport default function Page() {\n  return <><Card /><Other /></>\n}\n",
        'app/Card.tsx': `${MARK}\n${moduleSource('app/Card.tsx', ['flex'])}`,
        'app/Other.tsx': moduleSource('app/Other.tsx', ['grid']),
      }),
    )
    expect(record.problems.map((problem) => [problem.file, problem.kind])).toEqual([
      ['app/Card.tsx', 'unreadable'],
    ])
    expect(atoms).toContain('grid')
  })
})
