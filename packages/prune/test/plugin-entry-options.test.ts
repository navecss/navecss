import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { atomsIn } from './helpers/layer.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const FILES = { 'app/page.tsx': pageCalling("'flex'") }

describe('AC-nextjs-used-atoms-19: withNave() is the one option home and the record goes where distDir says', () => {
  it('AC-nextjs-used-atoms-19: options on the PostCSS entry are recorded as a problem naming keep and withNave()', async () => {
    const project = makeProject(FILES)
    await runAtomic(project, [], {
      options: { keep: ['grid'] },
      entryOptions: { keep: ['hidden'] },
    })
    const { entryProblems } = recordOf(project)
    expect(entryProblems).toHaveLength(1)
    expect(entryProblems[0]).toContain('keep')
    expect(entryProblems[0]).toContain('withNave()')
  })

  it('AC-nextjs-used-atoms-19: every key found on the entry is named', async () => {
    const project = makeProject(FILES)
    await runAtomic(project, [], { entryOptions: { keep: ['hidden'], onUnknown: 'warn' } })
    const named = recordOf(project).entryProblems.join('\n')
    expect(named).toContain('keep')
    expect(named).toContain('onUnknown')
  })

  it('AC-nextjs-used-atoms-19: the plugin does not throw and trims with the options of withNave()', async () => {
    const project = makeProject(FILES)
    await expect(
      runSheets(project, [{ css: '', file: 'app/empty.css' }], {
        entryOptions: { keep: ['hidden'] },
      }),
    ).resolves.toHaveLength(1)
    const result = await runAtomic(project, [], {
      options: { keep: ['grid'] },
      entryOptions: { keep: ['hidden'] },
    })
    expect(atomsIn(result.css)).toEqual(['flex', 'grid'])
  })

  it('AC-nextjs-used-atoms-19: an empty entry object records no configuration problem', async () => {
    const project = makeProject(FILES)
    await runAtomic(project, [], { options: { keep: ['grid'] }, entryOptions: {} })
    expect(recordOf(project).entryProblems).toEqual([])
  })

  it('AC-nextjs-used-atoms-19: the record lands under <dir>/.next/cache by default', async () => {
    const project = makeProject(FILES)
    await runAtomic(project)
    expect(existsSync(path.join(project.dir, '.next/cache/navecss-prune.json'))).toBe(true)
  })

  it('AC-nextjs-used-atoms-19: with distDir "build" the record lands under <dir>/build/cache and nowhere else', async () => {
    const project = makeProject(FILES)
    await runAtomic(project, [], { distDir: 'build' })
    expect(existsSync(path.join(project.dir, 'build/cache/navecss-prune.json'))).toBe(true)
    expect(existsSync(path.join(project.dir, '.next'))).toBe(false)
    const startingDir = process.cwd()
    expect(existsSync(path.join(startingDir, 'build/cache/navecss-prune.json'))).toBe(false)
    expect(existsSync(path.join(startingDir, '.next/cache/navecss-prune.json'))).toBe(false)
  })
})
