import { navePlugin } from '@navecss/core/postcss'
import { describe, expect, it } from 'vitest'

import type { PruneRecord } from '../src/record.ts'
import type { PipelineOptions, Sheet } from './helpers/plugin-run.ts'

import {
  makeProject,
  PAGE_WITH_PROP,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

interface Row {
  readonly name: string
  readonly files: Record<string, string>
  readonly sheets?: readonly Sheet[]
  readonly run?: PipelineOptions
  /**
   * Whether the record holds the problem the row introduces.
   */
  readonly holdsProblem: (record: PruneRecord) => boolean
}

const ROWS: readonly Row[] = [
  {
    name: 'argument',
    files: { 'app/page.tsx': PAGE_WITH_PROP },
    holdsProblem: (record) => record.problems.some((problem) => problem.file === 'app/page.tsx'),
  },
  {
    name: 'unknown literal',
    files: { 'app/page.tsx': pageCalling("'interactve'") },
    holdsProblem: (record) => record.problems.some((problem) => problem.file === 'app/page.tsx'),
  },
  {
    name: 'unresolved import',
    files: {
      'app/page.tsx':
        "import { Card } from '@/ui/card'\n\nexport default function Page() {\n  return <Card />\n}\n",
    },
    holdsProblem: (record) => record.problems.length > 0,
  },
  {
    name: '@nave problem',
    files: { 'app/page.tsx': pageCalling("'flex'") },
    sheets: [{ css: '.card {\n  @nave interactve;\n}\n', file: 'app/globals.css' }],
    holdsProblem: (record) => record.directiveProblems.length > 0,
  },
  {
    name: 'options on the PostCSS entry',
    files: { 'app/page.tsx': pageCalling("'flex'") },
    run: { entryOptions: { keep: ['grid'] } },
    holdsProblem: (record) => record.entryProblems.length > 0,
  },
  {
    name: 'both plugins',
    files: { 'app/page.tsx': pageCalling("'flex'") },
    run: { before: [navePlugin()] },
    holdsProblem: (record) => record.hasCorePlugin,
  },
]

describe('AC-nextjs-used-atoms-02: no problem makes the plugin throw', () => {
  for (const row of ROWS) {
    it(`AC-nextjs-used-atoms-02: row "${row.name}" resolves for every stylesheet and the record holds the problem`, async () => {
      const project = makeProject(row.files)
      const sheets = [...(row.sheets ?? []), ATOMIC_SHEET]
      await expect(runSheets(project, sheets, row.run)).resolves.toHaveLength(sheets.length)
      // Control: the row's problem exists in the record, so the case was reached.
      expect(row.holdsProblem(recordOf(project))).toBe(true)
    })
  }
})
