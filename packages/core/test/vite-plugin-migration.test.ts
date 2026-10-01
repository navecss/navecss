/**
 * AC-directive-core-38: moving `navePlugin()` from `css.postcss` to `plugins`. A project that adds
 * the Vite plugin and leaves the PostCSS one in place builds green, to the same CSS as the Vite
 * plugin alone, and nothing prints twice.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin as postcssPlugin } from '../src/postcss.ts'
import { navePlugin as vitePlugin } from '../src/vite.ts'
import { isEquivalent } from './helpers/css-equivalence.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import { appConfig, buildOutputs, makeApp, type ScratchApp } from './helpers/vite-app.ts'

const FILES = {
  'index.html': APP_FILES['index.html']!,
  'src/main.js': "import './app.css'",
  'src/app.css':
    '.a { color: red; @nave flex; &:hover { color: blue } }\n.b { @nave focusRing; }\n',
}

let app: ScratchApp
beforeAll(() => {
  app = makeApp(FILES)
})
afterAll(() => app.dispose())

describe('AC-directive-core-38 — migrating from css.postcss to plugins', () => {
  it('builds green with both, to CSS equivalent to the Vite plugin alone', async () => {
    const both = await buildOutputs(
      appConfig(app.root, 'postcss', [vitePlugin()], {
        css: { postcss: { plugins: [postcssPlugin()] } },
      }),
    )
    const alone = await buildOutputs(appConfig(app.root, 'postcss', [vitePlugin()]))

    expect(both.css).toContain('display:flex')
    expect(isEquivalent(both.css, alone.css)).toBe(true)
  }, 30_000)

  it('prints no diagnostic twice when both are left in place', async () => {
    const messages: string[] = []
    const scratch = makeApp({ ...FILES, 'src/app.css': '.a { @nave nope; }\n' })
    try {
      const config = appConfig(scratch.root, 'postcss', [vitePlugin({ onUnknown: 'warn' })], {
        css: { postcss: { plugins: [postcssPlugin({ onUnknown: 'warn' })] } },
      })
      await buildOutputs({
        ...config,
        customLogger: {
          info() {},
          warn: (m: string) => void messages.push(m),
          warnOnce: (m: string) => void messages.push(m),
          error: (m: string) => void messages.push(m),
          clearScreen() {},
          hasErrorLogged: () => false,
          hasWarned: false,
        },
      })
    } finally {
      scratch.dispose()
    }

    expect(messages.filter((m) => m.includes('unknown atom "nope"'))).toHaveLength(1)
  }, 30_000)
})
