/**
 * The dev half of the `srOnly` pair (AC-used-atoms-26, whose dev clause AC-used-atoms-33 names):
 * whenever `srOnly` is in the set, `srOnlyFocusable` is too, in the dev server as in the build,
 * because its reveal on focus is what restores what `srOnly` hides. The pair adds to the served set
 * only: `srOnlyFocusable` alone brings no `srOnly`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { classesOf, keepOnly, parseAtomicLayer } from './helpers/css-layer.ts'
import {
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, devCss, startDev, stopDev } from './helpers/vite-app.ts'

const PAGE = (body: string): string =>
  `<!doctype html><html><body>${body}<script type="module" src="/src/main.ts"></script></body></html>`

/**
 * The CSS the dev server serves for `src/app.css`, with `plugin` and a page whose script is
 * `src/main.ts`.
 */
async function servedStylesheet(
  root: string,
  plugin: ReturnType<typeof navePlugin>,
): Promise<string> {
  const server = await startDev(appConfig(root, 'postcss', [plugin]))
  try {
    await server.transformIndexHtml(
      '/index.html',
      readFileSync(path.join(root, 'index.html'), 'utf8'),
    )
    const served = await devCss(server, '/src/main.ts')
    const sheet = Object.entries(served).find(([url]) => url.startsWith('/src/app.css'))?.[1]
    if (sheet === undefined) throw new Error('no stylesheet was served')
    return sheet
  } finally {
    await stopDev(server)
  }
}

describe('AC-used-atoms-26 — the srOnly pair, in the dev server as in the build', () => {
  const ROWS = [
    {
      name: 'a cx() call',
      files: { 'src/uses.ts': `${IMPORT}export const a = cx('srOnly')\n` },
      options: {},
    },
    {
      name: 'keep',
      files: {},
      options: { keep: ['srOnly'] },
    },
    {
      name: 'a Nave class in the page',
      files: { 'index.html': PAGE('<i class="nave-sr-only"></i>') },
      options: {},
    },
  ] as const

  for (const row of ROWS) {
    it(`serves srOnlyFocusable whole beside srOnly from ${row.name}, as the build does`, async () => {
      const app = makeUsedApp(appFiles({ ...row.files }))
      try {
        const dev = await servedStylesheet(app.root, navePlugin({ ...row.options }))
        const full = await servedStylesheet(app.root, navePlugin({ atomic: 'all' }))
        const built = await buildUsed(app, { options: { ...row.options } })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('srOnly', 'srOnlyFocusable'))
        expect(atomLayerAtoms(dev)).toEqual(atoms('srOnly', 'srOnlyFocusable'))
        expect(parseAtomicLayer(dev)).toEqual(
          keepOnly(parseAtomicLayer(full), classesOf('srOnly', 'srOnlyFocusable')),
        )
      } finally {
        app.dispose()
      }
    }, 120_000)
  }

  it('control: srOnlyFocusable alone brings no srOnly, in dev or in the build', async () => {
    const app = makeUsedApp(
      appFiles({ 'src/uses.ts': `${IMPORT}export const a = cx('srOnlyFocusable')\n` }),
    )
    try {
      const dev = await servedStylesheet(app.root, navePlugin())
      const built = await buildUsed(app, { options: {} })

      expect(atomLayerAtoms(built.css)).toEqual(atoms('srOnlyFocusable'))
      expect(atomLayerAtoms(dev)).toEqual(atoms('srOnlyFocusable'))
      expect(dev).not.toContain('.nave-sr-only,')
    } finally {
      app.dispose()
    }
  }, 120_000)
})
