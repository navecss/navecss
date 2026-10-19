/**
 * A router directory created after a run is seen: the record lists each of the four router
 * directories whether or not it is there, so the listing digest of one that appears changes.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { digestOf } from '../src/digest.ts'
import { findEntries } from '../src/entries.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

/**
 * The recorded directories whose listing digest differs from the project's listing now.
 */
function changedDirectories(dir: string, recorded: Readonly<Record<string, string>>): string[] {
  const now = new Map(
    findEntries(dir).directories.map((directory) => [
      `${path.relative(dir, directory.path) || '.'}/`,
      digestOf(directory.names.join('\n')),
    ]),
  )
  return Object.entries(recorded)
    .filter(([key, digest]) => now.get(key) !== digest)
    .map(([key]) => key)
}

describe('a router directory created after the run changes a recorded digest', () => {
  it.each([
    ['pages/ added to an app/-only project', 'app/page.tsx', 'pages/about.tsx', 'pages/'],
    ['app/ added to a pages/-only project', 'pages/index.tsx', 'app/page.tsx', 'app/'],
    [
      'src/pages/ added to a src/app/-only project',
      'src/app/page.tsx',
      'src/pages/about.tsx',
      'src/pages/',
    ],
    ['a page added inside app/ (control)', 'app/page.tsx', 'app/about/page.tsx', 'app/'],
  ])('%s', async (_label, first, later, directory) => {
    const project = makeProject({ [first]: pageCalling("'flex'") })
    await runAtomic(project, [], { options: {} })
    const recorded = recordOf(project).directories
    project.write({ [later]: pageCalling("'grid'") })
    expect(changedDirectories(project.dir, recorded)).toContain(directory)
  })
})
