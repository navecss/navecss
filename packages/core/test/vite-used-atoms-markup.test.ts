/* eslint-disable unicorn/consistent-function-scoping -- each fixture sits beside the criterion whose rows use it */
/**
 * The markup warning (AC-used-atoms-53, -54): a build or dev server that read no use at all and
 * no markup says so once, naming the README section and `keep` before `atomic: 'all'`; each of
 * its conditions silences it.
 */
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createLogger } from 'vite'
import { describe, expect, it } from 'vitest'

import type { NaveViteOptions } from '../src/vite.ts'

import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  APP_CSS,
  buildEnvironments,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, startDev, stopDev } from './helpers/vite-app.ts'

const run = promisify(execFile)
const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/**
 * What a child process printed, whether or not it exited cleanly.
 */
async function settled(
  command: Promise<{ stderr: string; stdout: string }>,
): Promise<{ stderr: string; stdout: string }> {
  try {
    return await command
  } catch (error) {
    return error as { stderr: string; stdout: string }
  }
}

const WARNING = 'Nave read no HTML page and no server render'

/**
 * A backend-shaped app: `src/main.ts` is the input, there is no HTML file, and it imports the
 * Quick start's stylesheet and calls no `cx()`.
 */
function backend(extra: Record<string, string> = {}): ReturnType<typeof makeUsedApp> {
  return makeUsedApp({
    'src/app.css': APP_CSS,
    'src/main.ts': "import './app.css'\n",
    ...extra,
  })
}

const INPUT = { rolldownOptions: { input: 'src/main.ts' } }

/**
 * The markup warnings a build printed.
 */
function markupWarnings(warnings: readonly string[] | undefined): string[] {
  return (warnings ?? []).filter((warning) => warning.includes(WARNING))
}

describe('AC-used-atoms-53 — the markup warning fires for a build that read no use and no markup', () => {
  it('prints exactly one warning, naming the README section and keep before atomic: all, with no accessibility word', async () => {
    const app = backend()
    try {
      const built = await buildUsed(app, { build: INPUT })

      expect(built.error).toBeUndefined()
      const warnings = markupWarnings(built.warnings)
      expect(warnings).toHaveLength(1)
      const text = warnings[0]!
      expect(text).toContain('Which atoms the build ships')
      expect(text.indexOf('keep')).toBeLessThan(text.indexOf("atomic: 'all'"))
      expect(text).not.toMatch(/focus|screen reader|accessib/i)
    } finally {
      app.dispose()
    }
  }, 60_000)

  const SILENCERS: readonly (readonly [
    string,
    Record<string, string>,
    NaveViteOptions,
    Record<string, unknown>,
  ])[] = [
    ['keep is not empty', {}, { keep: ['flex'] }, INPUT],
    [
      'an HTML input was read, though it holds no Nave class',
      { 'index.html': '<!doctype html><script type="module" src="/src/main.ts"></script>' },
      {},
      { rolldownOptions: { input: 'index.html' } },
    ],
    [
      'a component called cx (an Inertia-shaped main.ts)',
      {
        'src/main.ts': "import './app.css'\nimport './c.ts'\n",
        'src/c.ts': `${IMPORT}export const c = cx('flex')\n`,
      },
      {},
      INPUT,
    ],
    [
      'main.ts holds the class as a string',
      { 'src/main.ts': "import './app.css'\nexport const c = 'nave-flex'\n" },
      {},
      INPUT,
    ],
    [
      'a stylesheet expanded a directive (CSS-first)',
      { 'src/app.css': `${APP_CSS}.card { @nave flex; }\n` },
      {},
      INPUT,
    ],
    [
      'build.lib is set',
      {},
      {},
      { lib: { entry: 'src/main.ts', formats: ['es'], fileName: 'lib' } },
    ],
    ['atomic is all', {}, { atomic: 'all' }, INPUT],
  ]

  it.each(SILENCERS)(
    'prints none when %s',
    async (_name, files, options, build) => {
      const app = backend(files)
      try {
        const built = await buildUsed(app, { options, build })

        expect(built.error).toBeUndefined()
        expect(markupWarnings(built.warnings)).toEqual([])
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it('prints none when a server environment of the same build transformed a module', async () => {
    const app = backend({ 'src/entry-server.ts': 'export const render = () => 1\n' })
    try {
      const built = await buildEnvironments(app, { build: INPUT })

      expect(built.error).toBeUndefined()
      expect(markupWarnings(built.warnings)).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('still prints when the only use is a package’s keepFor list: the emitted set is those lists alone', async () => {
    const app = backend({ 'src/main.ts': "import './app.css'\nimport 'kf-lib'\n" })
    addPackage(app, 'kf-lib', { 'index.js': `${IMPORT}export const k = (v) => cx(v)\n` })
    try {
      const built = await buildUsed(app, {
        options: { keepFor: { 'kf-lib': ['block'] } },
        build: INPUT,
      })

      expect(built.error).toBeUndefined()
      expect(markupWarnings(built.warnings)).toHaveLength(1)
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-54 — in dev, the markup warning is evaluated when the first stylesheet holding the layer is served', () => {
  async function served(
    steps: (server: Awaited<ReturnType<typeof startDev>>, logged: string[]) => Promise<void>,
    files: Record<string, string> = {},
  ): Promise<void> {
    const app = backend({ 'src/entry-server.ts': 'export const render = () => 1\n', ...files })
    const logged: string[] = []
    const logger = createLogger('silent')
    logger.warn = (message) => {
      logged.push(message)
    }
    try {
      const server = await startDev({
        ...appConfig(app.root, 'postcss', [navePlugin()]),
        customLogger: logger,
      })
      try {
        await steps(server, logged)
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }

  const count = (logged: readonly string[]): number => markupWarnings(logged).length

  it('logs none at start, one after the first stylesheet response, and none after later requests or an edit', async () => {
    let root = ''
    await served(async (server, logged) => {
      root = server.config.root
      expect(count(logged)).toBe(0)
      await server.transformRequest('/src/app.css')
      expect(count(logged)).toBe(1)
      await server.transformRequest('/src/app.css')
      writeFileSync(path.join(root, 'src/main.ts'), "import './app.css'\nexport const x = 1\n")
      const { moduleGraph } = server.environments.client
      moduleGraph.invalidateModule(moduleGraph.getModuleById(path.join(root, 'src/app.css'))!)
      await server.transformRequest('/src/main.ts')
      await server.transformRequest('/src/app.css')
      expect(count(logged)).toBe(1)
    })
  }, 60_000)

  it('logs none when a server render transformed a module first', async () => {
    await served(async (server, logged) => {
      await server.ssrLoadModule('/src/entry-server.ts')
      await server.transformRequest('/src/app.css')
      expect(count(logged)).toBe(0)
    })
  }, 60_000)

  it('logs none when an HTML page was requested before the stylesheet', async () => {
    await served(
      async (server, logged) => {
        await server.transformIndexHtml(
          '/index.html',
          '<!doctype html><script type="module" src="/src/main.ts"></script>',
        )
        await server.transformRequest('/src/app.css')
        expect(count(logged)).toBe(0)
      },
      { 'index.html': '<!doctype html><script type="module" src="/src/main.ts"></script>' },
    )
  }, 60_000)

  describe('under Vitest, which starts the same config as a dev server', () => {
    const requireHere = createRequire(import.meta.url)
    const vitestBin = path.join(
      path.dirname(requireHere.resolve('vitest/package.json')),
      'vitest.mjs',
    )

    async function vitestRun(test: string): Promise<string> {
      const app = backend({
        'vitest.config.ts': [
          `import { navePlugin } from ${JSON.stringify(path.join(CORE_ROOT, 'src/vite.ts'))}`,
          'export default { plugins: [navePlugin()], test: { css: { include: /.+/ } } }',
          '',
        ].join('\n'),
        'src/a.test.ts': test,
      })
      try {
        const command = run(
          process.execPath,
          [
            vitestBin,
            'run',
            '--root',
            app.root,
            '--config',
            path.join(app.root, 'vitest.config.ts'),
          ],
          { cwd: app.root, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } },
        )
        const { stderr, stdout } = await settled(command)
        return `${stdout}\n${stderr}`
      } finally {
        app.dispose()
      }
    }

    it('logs no such warning for a test that transforms no module holding the layer', async () => {
      const output = await vitestRun("import { it } from 'vitest'\nit('x', () => {})\n")

      expect(output).toContain('1 passed')
      expect(output).not.toContain(WARNING)
    }, 120_000)

    it('logs none for a test that imports src/app.css either: a test file is a module of a server environment', async () => {
      const output = await vitestRun(
        "import { it } from 'vitest'\nit('x', async () => { await import('./app.css') })\n",
      )

      expect(output).toContain('1 passed')
      expect(output).not.toContain(WARNING)
    }, 120_000)
  })
})
