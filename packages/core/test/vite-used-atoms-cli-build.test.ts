/**
 * The used-atoms criteria for a build run the way a consumer runs it: the `vite build` command
 * with a config file that imports the plugin from `@navecss/core/vite` (the package's built
 * output). Vite's command always goes through a builder, and by default gives the builder's
 * top-level config and each environment's config a resolution, and a plugin list, of their own.
 * The markup warning (AC-used-atoms-53) and the order failure (AC-used-atoms-13) hold across them,
 * and two builds of one root in one process keep their sets apart.
 */
import { execFile } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { build, createBuilder } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { APP_CSS, atomLayerAtoms, atoms, makeUsedApp } from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, outputsOf, type ScratchApp } from './helpers/vite-app.ts'

const run = promisify(execFile)
const requireHere = createRequire(import.meta.url)
const viteBin = path.join(path.dirname(requireHere.resolve('vite/package.json')), 'bin/vite.js')

interface Builder {
  readonly environments: Record<string, unknown>
  build(environment: unknown): Promise<unknown>
}

const WARNING = 'Nave read no HTML page and no server render'

interface Ran {
  /**
   * What the command printed, standard output and standard error together.
   */
  readonly output: string
  readonly exitCode: number
}

/**
 * Runs `vite build` with `args` in the app, resolving to what it printed and how it exited.
 */
async function viteBuild(app: ScratchApp, args: readonly string[] = []): Promise<Ran> {
  rmSync(path.join(app.root, 'dist'), { force: true, recursive: true })
  rmSync(path.join(app.root, 'dist-ssr'), { force: true, recursive: true })
  const command = run(process.execPath, [viteBin, 'build', ...args], {
    cwd: app.root,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
  })
  try {
    const { stderr, stdout } = await command
    return { output: `${stdout}\n${stderr}`, exitCode: 0 }
  } catch (error) {
    const failed = error as { code?: number; stderr: string; stdout: string }
    return { output: `${failed.stdout}\n${failed.stderr}`, exitCode: failed.code ?? 1 }
  }
}

/**
 * How the command ended, with what it printed when it did not exit cleanly, so a failing row
 * shows the build's own report.
 */
function outcome({ exitCode, output }: Ran): string {
  return exitCode === 0 ? 'exited 0' : `exited ${exitCode}\n${output}`
}

/**
 * The text of every stylesheet the last `vite build` of the app wrote.
 */
function builtCss(app: ScratchApp): string {
  const assets = path.join(app.root, 'dist', 'assets')
  return readdirSync(assets)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(path.join(assets, name), 'utf8'))
    .join('\n')
}

/**
 * Writes the app's config file: the plugin as a consumer imports it, and `body` for the rest.
 */
function writeConfig(app: ScratchApp, body: string): void {
  writeFileSync(
    path.join(app.root, 'vite.config.mjs'),
    `import { navePlugin } from '@navecss/core/vite'\nexport default { plugins: [navePlugin()], ${body} }\n`,
  )
}

const markupWarnings = (output: string): number => output.split(WARNING).length - 1

const SERVER_ENVIRONMENT =
  "environments: { ssr: { build: { outDir: 'dist-ssr', rolldownOptions: { input: 'src/entry-server.ts' } } } }"
const SERVER_FIRST =
  'async buildApp(b) { await b.build(b.environments.ssr); await b.build(b.environments.client) }'
const INPUT = "build: { rolldownOptions: { input: 'src/main.ts' } }"

describe('AC-used-atoms-53 — the markup warning under the vite build command', () => {
  describe('a single page app', () => {
    let app: ScratchApp
    beforeAll(() => {
      app = makeUsedApp({
        'index.html':
          '<!doctype html><html><body><div class="nave-flex"></div><script type="module" src="/src/main.ts"></script></body></html>',
        'src/app.css': APP_CSS,
        'src/main.ts': `import './app.css'\n${IMPORT}export const c = cx('gap')\n`,
      })
    })
    afterAll(() => {
      app.dispose()
    })

    it('prints no markup warning and ships what the page and the script name', async () => {
      writeConfig(app, '')

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(0)
      expect(atomLayerAtoms(builtCss(app))).toEqual(atoms('flex', 'gap'))
    }, 120_000)

    it('prints none under --app either, which builds through a builder', async () => {
      writeConfig(app, '')

      const { exitCode, output } = await viteBuild(app, ['--app'])

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(0)
      expect(atomLayerAtoms(builtCss(app))).toEqual(atoms('flex', 'gap'))
    }, 120_000)
  })

  describe('a backend that renders its own templates', () => {
    let app: ScratchApp
    beforeAll(() => {
      app = makeUsedApp({
        'src/app.css': APP_CSS,
        'src/main.ts': "import './app.css'\n",
        'src/entry-server.ts': 'export const render = () => 1\n',
      })
    })
    afterAll(() => {
      app.dispose()
    })

    it('prints exactly one warning for a plain build', async () => {
      writeConfig(app, INPUT)

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(1)
    }, 120_000)

    it('prints none when a server environment of the same build transformed a module', async () => {
      writeConfig(app, `${INPUT}, builder: {}, ${SERVER_ENVIRONMENT}`)

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(0)
    }, 120_000)

    it('prints none when the builder’s own buildApp builds the environments and shares the config', async () => {
      writeConfig(
        app,
        `${INPUT}, builder: { sharedConfigBuild: true, ${SERVER_FIRST} }, ${SERVER_ENVIRONMENT}`,
      )

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(0)
    }, 120_000)

    it('prints none when the builder’s own buildApp builds the environments and each has a config of its own', async () => {
      writeConfig(app, `${INPUT}, builder: { ${SERVER_FIRST} }, ${SERVER_ENVIRONMENT}`)

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(0)
    }, 120_000)

    it('prints exactly one when the builder’s own buildApp builds the client alone', async () => {
      writeConfig(
        app,
        `${INPUT}, builder: { async buildApp(b) { await b.build(b.environments.client) } }, ${SERVER_ENVIRONMENT}`,
      )

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(1)
    }, 120_000)

    it('prints exactly one when the builder builds the client alone', async () => {
      writeConfig(app, `${INPUT}, builder: {}`)

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(markupWarnings(output)).toBe(1)
    }, 120_000)
  })
})

describe('AC-used-atoms-13 — an atom only a server environment names, under the vite build command', () => {
  let app: ScratchApp
  beforeAll(() => {
    app = makeUsedApp({
      'src/app.css': APP_CSS,
      'src/main.ts': "import './app.css'\n",
      'src/entry-server.ts': `${IMPORT}export const render = () => cx('grid')\n`,
    })
  })
  afterAll(() => {
    app.dispose()
  })

  const SHARED = [
    ['gives each environment a config of its own', 'sharedConfigBuild: false'],
    ['shares one config across the environments', 'sharedConfigBuild: true'],
  ] as const

  it.each(SHARED)(
    'fails the build with the order failure naming the module and the atom when it %s and builds the client first',
    async (_name, sharing) => {
      writeConfig(app, `${INPUT}, builder: { ${sharing} }, ${SERVER_ENVIRONMENT}`)

      const { exitCode, output } = await viteBuild(app)

      expect(exitCode).toBe(1)
      expect(output).toContain('src/entry-server.ts: names grid')
      expect(output).toContain('build the server environments first')
    },
    120_000,
  )

  it.each(SHARED)(
    'ships the atom in the client CSS when it %s and builds the server first',
    async (_name, sharing) => {
      writeConfig(app, `${INPUT}, builder: { ${sharing}, ${SERVER_FIRST} }, ${SERVER_ENVIRONMENT}`)

      const { exitCode, output } = await viteBuild(app)

      expect(outcome({ exitCode, output })).toBe('exited 0')
      expect(atomLayerAtoms(builtCss(app))).toEqual(['grid'])
      expect(markupWarnings(output)).toBe(0)
    },
    120_000,
  )
})

describe('AC-used-atoms-12 — two builds of one root in one process keep their sets apart', () => {
  let app: ScratchApp
  beforeAll(() => {
    app = makeUsedApp({
      'src/app.css': APP_CSS,
      'src/main.ts': `import './app.css'\n${IMPORT}export const c = cx('flex')\n`,
      'src/entry-server.ts': `${IMPORT}export const render = () => cx('block')\n`,
    })
  })
  afterAll(() => {
    app.dispose()
  })

  const edit = (client: string, server: string): void => {
    writeFileSync(
      path.join(app.root, 'src/main.ts'),
      `import './app.css'\n${IMPORT}export const c = cx('${client}')\n`,
    )
    writeFileSync(
      path.join(app.root, 'src/entry-server.ts'),
      `${IMPORT}export const render = () => cx('${server}')\n`,
    )
  }

  it('does not carry the first build’s atoms into the second when one config object builds twice', async () => {
    const config = {
      ...appConfig(app.root, 'postcss', [navePlugin()], {
        build: { rolldownOptions: { input: 'src/main.ts' } },
      }),
    }
    edit('flex', 'block')
    const first = outputsOf(await build(config))
    edit('grid', 'block')
    const second = outputsOf(await build(config))

    expect(atomLayerAtoms(first.css)).toEqual(['flex'])
    expect(atomLayerAtoms(second.css)).toEqual(['grid'])
  }, 120_000)

  it('does not carry the first builder’s atoms into the second when a config file’s plugin is made afresh for each environment and one inline config builds twice', async () => {
    writeConfig(app, `${INPUT}, builder: { ${SERVER_FIRST} }, ${SERVER_ENVIRONMENT}`)
    const inline = {
      root: app.root,
      configFile: path.join(app.root, 'vite.config.mjs'),
      logLevel: 'silent',
    } as const
    const built = async (): Promise<string[]> => {
      rmSync(path.join(app.root, 'dist'), { force: true, recursive: true })
      const builder = await createBuilder(inline)
      await builder.buildApp()
      return atomLayerAtoms(builtCss(app))
    }
    edit('flex', 'block')
    const first = await built()
    edit('gap', 'grid')
    const second = await built()

    expect(first).toEqual(atoms('block', 'flex'))
    expect(second).toEqual(atoms('gap', 'grid'))
  }, 120_000)

  it.each([
    ['gives each environment a config of its own', false],
    ['shares one config across the environments', true],
  ] as const)(
    'does not carry the first builder’s atoms into the second when one config object builds twice and it %s',
    async (_name, sharedConfigBuild) => {
      let css = ''
      const config = {
        ...appConfig(app.root, 'postcss', [navePlugin()], {
          build: { rolldownOptions: { input: 'src/main.ts' } },
        }),
        environments: {
          ssr: {
            build: { outDir: 'dist-ssr', rolldownOptions: { input: 'src/entry-server.ts' } },
          },
        },
        builder: {
          sharedConfigBuild,
          // Server first, so the client reads what the server environment named.
          async buildApp(b: Builder) {
            await b.build(b.environments.ssr)
            css = outputsOf(await b.build(b.environments.client)).css
          },
        },
      }
      const built = async (): Promise<string[]> => {
        const builder = await createBuilder(config)
        await builder.buildApp()
        return atomLayerAtoms(css)
      }
      edit('flex', 'block')
      const first = await built()
      edit('gap', 'grid')
      const second = await built()

      expect(first).toEqual(atoms('block', 'flex'))
      expect(second).toEqual(atoms('gap', 'grid'))
    },
    120_000,
  )

  it('keeps the atoms of two concurrent builders of one root apart when a config file’s plugin is made afresh for each environment', async () => {
    writeConfig(app, 'builder: {}')
    for (const name of ['a', 'b']) {
      writeFileSync(
        path.join(app.root, `${name}.html`),
        `<!doctype html><script type="module" src="/src/${name}.ts"></script>`,
      )
    }
    writeFileSync(path.join(app.root, 'src/a.ts'), `import './app.css'\n${IMPORT}cx('flex')\n`)
    writeFileSync(path.join(app.root, 'src/b.ts'), `import './app.css'\n${IMPORT}cx('grid')\n`)
    const builtAs = async (name: string): Promise<string[]> => {
      const outDir = `dist-${name}`
      const builder = await createBuilder({
        root: app.root,
        configFile: path.join(app.root, 'vite.config.mjs'),
        logLevel: 'silent',
        build: { outDir, rolldownOptions: { input: path.join(app.root, `${name}.html`) } },
      })
      await builder.buildApp()
      const assets = path.join(app.root, outDir, 'assets')
      return atomLayerAtoms(
        readdirSync(assets)
          .filter((file) => file.endsWith('.css'))
          .map((file) => readFileSync(path.join(assets, file), 'utf8'))
          .join('\n'),
      )
    }

    const [a, b] = await Promise.all([builtAs('a'), builtAs('b')])

    expect(a).toEqual(['flex'])
    expect(b).toEqual(['grid'])
  }, 120_000)
})
