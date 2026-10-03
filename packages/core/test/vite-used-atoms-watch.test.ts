/**
 * The used-atoms criteria for a build that stays up (`vite build --watch`): each rebuild fixes its
 * own emitted set, hands the page's inline stylesheet back pruned to it, and says what it has to
 * say again, once for that build.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from 'vite'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { APP_CSS, atomLayerAtoms, makeUsedApp } from './helpers/used-atoms-app.ts'
import { appConfig, VITE_APIS } from './helpers/vite-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"

describe('AC-used-atoms-27 - rebuilds in watch mode', () => {
  it('hands the inline stylesheet of a page back pruned on every rebuild, and warns once per build', async () => {
    const app = makeUsedApp({
      'index.html': `<!doctype html><html><head><style>@import url('@navecss/core/layers');@import url('@navecss/core');</style></head><body><script type="module" src="/src/main.ts"></script></body></html>`,
      'src/app.css': APP_CSS,
      'src/inline.css': APP_CSS,
      'src/a.ts': "import css from './inline.css?inline'\nexport const a = css\n",
      'src/main.ts': `import './app.css'\nimport { a } from './a.ts'\n${IMPORT}console.log(cx('flex'), a)\n`,
    })
    const warnings: string[] = []
    const logger = createLogger('silent')
    logger.warn = (message) => {
      warnings.push(message)
    }
    try {
      const config = {
        ...appConfig(app.root, 'postcss', [navePlugin()], {
          build: { write: true, watch: {}, outDir: 'dist' },
        }),
        customLogger: logger,
      }
      const watcher = (await VITE_APIS['8.2.1']!.build(config)) as unknown as {
        on(event: 'event', listener: (event: { code: string; error?: Error }) => void): void
        off(event: 'event', listener: (event: { code: string; error?: Error }) => void): void
        close(): Promise<void>
      }
      const rebuilt = (): Promise<void> =>
        new Promise((resolve, reject) => {
          const listener = (event: { code: string; error?: Error }): void => {
            if (event.code !== 'END' && event.code !== 'ERROR') return
            watcher.off('event', listener)
            if (event.code === 'ERROR') reject(event.error)
            else resolve()
          }
          watcher.on('event', listener)
        })
      const written = (): { page: string[]; asset: string[] } => {
        const assets = path.join(app.root, 'dist/assets')
        const css = readdirSync(assets)
          .filter((name) => name.endsWith('.css'))
          .map((name) => readFileSync(path.join(assets, name), 'utf8'))
          .join('\n')
        const html = readFileSync(path.join(app.root, 'dist/index.html'), 'utf8')
        return { page: atomLayerAtoms(html), asset: atomLayerAtoms(css) }
      }
      const edit = async (call: string): Promise<void> => {
        const next = rebuilt()
        writeFileSync(
          path.join(app.root, 'src/main.ts'),
          `import './app.css'\nimport { a } from './a.ts'\n${IMPORT}console.log(${call}, a)\n`,
        )
        await next
      }

      await rebuilt()
      const first = written()
      await edit("cx('flex', 'grid')")
      const second = written()
      await edit("cx('block')")
      const third = written()
      await watcher.close()

      expect(first).toEqual({ page: ['flex'], asset: ['flex'] })
      expect(second).toEqual({ page: ['flex', 'grid'], asset: ['flex', 'grid'] })
      expect(third).toEqual({ page: ['block'], asset: ['block'] })
      expect(warnings.filter((message) => message.includes('src/inline.css'))).toHaveLength(3)
    } finally {
      app.dispose()
    }
  }, 120_000)
})
