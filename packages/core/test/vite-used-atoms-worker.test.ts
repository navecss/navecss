/**
 * The used-atoms criteria for a module worker (AC-used-atoms-12, the environments clause): the
 * sub-build of a worker is code the build transforms and ships, so the atoms its `cx()` calls and
 * written classes name are in the emitted set.
 */
import { describe, expect, it } from 'vitest'

import {
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const WORKER = {
  'src/a.js':
    "export const w = new Worker(new URL('./w.js', import.meta.url), { type: 'module' })\n",
  'src/w.js': `${IMPORT}postMessage('<p class="' + cx('grid') + '">x</p><p class="nave-block">y</p>')\n`,
}

describe('AC-used-atoms-12 - a module worker’s calls and classes are read', () => {
  it('ships the atoms a worker’s cx() call and written class name', async () => {
    const app = makeUsedApp(appFiles(WORKER, ['src/a.js']))
    try {
      const built = await buildUsed(app)

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'grid'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('reads a worker next to the atoms the page itself names', async () => {
    const app = makeUsedApp(
      appFiles({ ...WORKER, 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }, [
        'src/a.js',
        'src/App.ts',
      ]),
    )
    try {
      const built = await buildUsed(app)

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex', 'grid'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('control: under all the worker is not read and every atom ships', async () => {
    const app = makeUsedApp(appFiles(WORKER, ['src/a.js']))
    try {
      const built = await buildUsed(app, { options: { atomic: 'all' } })

      expect(atomLayerAtoms(built.css).length).toBeGreaterThan(40)
    } finally {
      app.dispose()
    }
  }, 60_000)
})
