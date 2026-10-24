/**
 * On a file system that keeps modification times in whole seconds, the first report of a dev
 * server is still printed: which dev server wrote the record is read from the record, not from a
 * comparison of its modification time with this process's clock.
 */
import type * as Fs from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>()
  const statSync = (path: Fs.PathLike): Fs.Stats | undefined => {
    const stats = actual.statSync(path, { throwIfNoEntry: false })
    if (stats === undefined || !String(path).endsWith('navecss-prune.json')) return stats
    return new Proxy(stats, {
      get: (target, key): unknown =>
        key === 'mtimeMs' ? Math.floor(target.mtimeMs / 1000) * 1000 : Reflect.get(target, key),
    })
  }
  return { ...actual, statSync }
})

import { makeProject, PAGE_WITH_PROP, registerIsolation } from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'

registerIsolation()

/**
 * Waits for the start of the next second when this one is more than 400 ms old, so the run below
 * does not cross a second boundary.
 */
async function startMidSecond(): Promise<void> {
  const age = Date.now() % 1000
  if (age <= 400) return
  await new Promise((resolve) => setTimeout(resolve, 1100 - age))
}

describe('AC-nextjs-used-atoms-29: the first report of a dev server does not depend on file times', () => {
  it('AC-nextjs-used-atoms-29: the first atom-layer run prints its report when the record time is floored to the second', async () => {
    vi.stubEnv('NEXT_PRIVATE_START_TIME', '1000')
    await startMidSecond()
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const out: string[] = []
    for (const kind of ['error', 'log', 'warn'] as const) {
      vi.spyOn(console, kind).mockImplementation((...args: unknown[]) => {
        out.push(args.map(String).join(' '))
      })
    }

    await runSheets(project, [ATOMIC_SHEET], { phase: 'phase-development-server' })

    expect(out.join('\n')).toContain('app/page.tsx:4:')
  })
})
