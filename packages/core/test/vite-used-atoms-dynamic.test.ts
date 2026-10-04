/**
 * The used-atoms criterion for the `define` (AC-used-atoms-20, the build half): `keep` and every
 * `keepFor` list reach `cx.dynamic()` as one constant folded into the bundle, in a client build
 * and in a server build that bundles core, so the same class strings apply wherever the call is.
 * The dev half (the dev server's own global, the console texts) belongs to the dev-serving change.
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { KEEP_CONSTANT } from '../src/vite-config-hooks.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { appConfig } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const MAIN = `${IMPORT}import { tone } from 'dyn-lib'
globalThis.__r = [tone('grid'), tone('flex'), tone('block'), cx.dynamic('grid'), cx.dynamic('flex'), cx.dynamic('block')]
`

/**
 * An app whose client calls `cx.dynamic()` itself and through `dyn-lib`.
 */
function dynamicApp() {
  const app = makeUsedApp(appFiles({ 'src/App.ts': MAIN }))
  addPackage(app, 'dyn-lib', { 'index.js': `${IMPORT}export const tone = (t) => cx.dynamic(t)\n` })
  return app
}

/**
 * Runs the client bundle in Node, returning what it set on `globalThis.__r`.
 */
function runClient(js: string): string[] {
  const scope: { __r?: string[]; document: unknown } = {
    document: { createElement: () => ({ relList: { supports: () => true } }) },
  }
  new Function('globalThis', 'document', `${js.replaceAll(/\bimport\.meta\b/g, '({})')}`)(
    scope,
    scope.document,
  )
  return scope.__r!
}

describe('AC-used-atoms-20 — the define hands keep and the keepFor lists to cx.dynamic()', () => {
  const options = { keep: ['flex' as const], keepFor: { 'dyn-lib': ['block' as const] } }

  it('applies one map, whoever calls: keep and every keepFor list', async () => {
    const app = dynamicApp()
    try {
      const built = await buildUsed(app, { options })

      expect(built.error).toBeUndefined()
      expect(runClient(built.js)).toEqual([
        '',
        'nave-flex',
        'nave-block',
        '',
        'nave-flex',
        'nave-block',
      ])
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'block'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('control: under all the full map applies and nothing is folded', async () => {
    const app = dynamicApp()
    try {
      const built = await buildUsed(app, { options: { ...options, atomic: 'all' } })

      expect(runClient(built.js)).toEqual([
        'nave-grid',
        'nave-flex',
        'nave-block',
        'nave-grid',
        'nave-flex',
        'nave-block',
      ])
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('adds exactly one define key under the default, and no built asset names it', async () => {
    const app = dynamicApp()
    try {
      const definedBy = async (settings: Parameters<typeof navePlugin>[0]) => {
        const resolved = await resolveConfig(
          appConfig(app.root, 'postcss', [navePlugin(settings)]),
          'build',
        )
        return Object.keys(resolved.define ?? {})
      }
      const built = await buildUsed(app, { options })

      expect(await definedBy(options)).toEqual([KEEP_CONSTANT])
      expect(await definedBy({ ...options, atomic: 'all' })).toEqual([])
      expect(KEEP_CONSTANT).toBe('__NAVE_KEEP_CLASSES__')
      expect(built.js).not.toContain(KEEP_CONSTANT)
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('bundles core into a server build, so keep applies there to the application’s own calls', async () => {
    // Core is a real directory under node_modules, as a registry install makes it: a linked
    // package is bundled by Vite whatever the config says, which would hide a missing addition.
    const app = makeUsedApp(
      appFiles(
        {
          'src/App.ts': `${IMPORT}console.log(cx('flex'))\n`,
          'src/ssr.ts': `${IMPORT}import { tone } from 'dyn-lib'\nexport const own = cx.dynamic('grid')\nexport const lib = tone('grid')\n`,
        },
        ['src/App.ts'],
      ),
      'copy',
    )
    addPackage(app, 'dyn-lib', {
      'index.js': `${IMPORT}export const tone = (t) => cx.dynamic(t)\n`,
    })
    try {
      const build = { ssr: 'src/ssr.ts', outDir: 'dist-ssr', write: true }
      const built = await buildUsed(app, {
        options: { keep: ['flex'], keepFor: { 'dyn-lib': ['block'] } },
        build,
        config: {},
      })
      expect(built.error).toBeUndefined()
      const resolved = await resolveConfig(
        appConfig(app.root, 'postcss', [navePlugin({ keep: ['flex'] })], { build }),
        'build',
      )
      const module = (await import(pathToFileURL(path.join(app.root, 'dist-ssr/ssr.js')).href)) as {
        own: string
        lib: string
      }

      expect(resolved.environments.ssr?.resolve.noExternal).toContain('@navecss/core')
      expect(module.own).toBe('')
      // The residual R14 names: an externalized dependency loads core unbundled, so its call maps through the full map.
      expect(module.lib).toBe('nave-grid')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('decides a server environment the way Vite does: by consumer, else by name', () => {
    const [nave] = navePlugin({ keep: ['flex'] })
    const added = { resolve: { noExternal: ['@navecss/core'] } }

    expect(nave.configEnvironment('ssr', {})).toEqual(added)
    expect(nave.configEnvironment('rsc', {})).toEqual(added)
    expect(nave.configEnvironment('worker', { consumer: 'server' })).toEqual(added)
    expect(nave.configEnvironment('client', {})).toBeUndefined()
    expect(nave.configEnvironment('ssr', { consumer: 'client' })).toBeUndefined()
    expect(navePlugin({ atomic: 'all' })[0].configEnvironment('ssr', {})).toBeUndefined()
  })
})
