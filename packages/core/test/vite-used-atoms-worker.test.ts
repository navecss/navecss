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
import { VITE_APIS } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const WORKER = {
  'src/a.js':
    "export const w = new Worker(new URL('./w.js', import.meta.url), { type: 'module' })\n",
  'src/w.js': `${IMPORT}postMessage('<p class="' + cx('grid') + '">x</p><p class="nave-block">y</p>')\n`,
}

// A worker's entry is emitted by each Vite's own mechanism, so every row runs on each Vite measured.
describe.each(Object.entries(VITE_APIS))(
  'Vite %s: AC-used-atoms-12 - a module worker’s calls and classes are read',
  (_version, api) => {
    it('ships the atoms a worker’s cx() call and written class name', async () => {
      const app = makeUsedApp(appFiles(WORKER, ['src/a.js']))
      try {
        const built = await buildUsed(app, { api })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'grid'))
      } finally {
        app.dispose()
      }
    })

    it('reads a worker next to the atoms the page itself names', async () => {
      const app = makeUsedApp(
        appFiles({ ...WORKER, 'src/App.ts': `${IMPORT}export const a = cx('flex')\n` }, [
          'src/a.js',
          'src/App.ts',
        ]),
      )
      try {
        const built = await buildUsed(app, { api })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex', 'grid'))
      } finally {
        app.dispose()
      }
    })

    it('turns a worker’s cx() call into its class string, and ships no name map in the worker', async () => {
      const app = makeUsedApp(appFiles(WORKER, ['src/a.js']))
      try {
        const built = await buildUsed(app, { api })
        const control = await buildUsed(app, { api, options: { atomic: 'all' } })
        const shipped = (result: typeof built): string =>
          [result.js, ...Object.values(result.assets)].join('\n')

        expect(built.error).toBeUndefined()
        expect(shipped(built)).toContain('<p class="')
        expect(shipped(built)).toContain('nave-grid')
        expect(shipped(built)).not.toContain('srOnlyFocusable')
        // Control: the build that rewrites nothing ships the map, so the key can be found.
        expect(shipped(control)).toContain('srOnlyFocusable')
      } finally {
        app.dispose()
      }
    })

    it('control: under all the worker is not read and every atom ships', async () => {
      const app = makeUsedApp(appFiles(WORKER, ['src/a.js']))
      try {
        const built = await buildUsed(app, { api, options: { atomic: 'all' } })

        expect(atomLayerAtoms(built.css).length).toBeGreaterThan(40)
      } finally {
        app.dispose()
      }
    })
  },
)
