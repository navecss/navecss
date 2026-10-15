import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from './helpers/project.ts'

import { atomsIn } from './helpers/layer.ts'
import {
  capturePrinted,
  makeProject,
  PAGE_WITH_PROP,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runAtomic, runSheets } from './helpers/plugin-run.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

registerIsolation()

const EVERY_ATOM = atomsIn(ATOMIC_CSS)

/**
 * A project whose page calls `cx(variant)`, which a trimming build would report.
 */
function projectWithProblem(): Project {
  return makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
}

/**
 * Whether the line is the one that names the wrapper and this package and says every atom ships.
 */
function isNotice(line: string): boolean {
  return (
    line.includes('withNave()') &&
    line.includes('@navecss/prune') &&
    /\b(every|all)\b.*\batoms?\b/i.test(line)
  )
}

describe('AC-nextjs-used-atoms-24: without the wrapper every atom ships, nothing is read, and the plugin says so once', () => {
  it('AC-nextjs-used-atoms-24: the output layer equals the input layer', async () => {
    const project = projectWithProblem()
    const result = await runAtomic(project, [], { options: false })
    expect(EVERY_ATOM).toContain('flex')
    expect(atomsIn(result.css)).toEqual(EVERY_ATOM)
    expect(result.css).toBe(ATOMIC_CSS)
    // Control: with the wrapper the same project is trimmed, so the equality above is the plugin's choice.
    const trimmed = await runAtomic(project, [], { options: {} })
    expect(atomsIn(trimmed.css)).not.toEqual(EVERY_ATOM)
  })

  it('AC-nextjs-used-atoms-24: no cx() call is read, so no problem is reported', async () => {
    const project = projectWithProblem()
    const printed = capturePrinted()
    await runAtomic(project, [], { options: false })
    expect(existsSync(path.join(project.dir, '.next'))).toBe(false)
    expect(
      printed().filter((line) => line.includes('variant') || line.includes('app/page.tsx')),
    ).toEqual([])
    // Control: with the wrapper the same page produces a problem in the record.
    await runAtomic(project, [], { options: {} })
    expect(recordOf(project).problems.some((problem) => problem.file === 'app/page.tsx')).toBe(true)
  })

  it('AC-nextjs-used-atoms-24: exactly one line is printed, naming withNave() and the package', async () => {
    const project = projectWithProblem()
    const printed = capturePrinted()
    await runAtomic(project, [], { options: false })
    const lines = printed()
    expect(lines).toHaveLength(1)
    expect(isNotice(lines[0]!)).toBe(true)
  })

  it('AC-nextjs-used-atoms-24: repeated runs of one plugin print nothing more', async () => {
    const project = projectWithProblem()
    const printed = capturePrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET, ATOMIC_SHEET], { options: false })
    expect(printed()).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-24: with NEXT_COMPILER_NAME "server" nothing is printed, with "client" or unset one line is', async () => {
    const project = projectWithProblem()
    const printed = capturePrinted()
    vi.stubEnv('NEXT_COMPILER_NAME', 'server')
    await runAtomic(project, [], { options: false })
    expect(printed()).toEqual([])
    // Control: the same run prints once when the variable names the client or is unset.
    vi.stubEnv('NEXT_COMPILER_NAME', 'client')
    await runAtomic(project, [], { options: false })
    expect(printed()).toHaveLength(1)
    vi.stubEnv('NEXT_COMPILER_NAME', undefined)
    await runAtomic(project, [], { options: false })
    expect(printed()).toHaveLength(2)
  })
})
