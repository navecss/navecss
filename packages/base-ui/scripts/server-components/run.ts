/**
 * The processes of the Server Component check: packing the package, installing the app, running
 * `next build` and the whole run's verdict. The program runner is passed in, so a test can run the
 * whole check against a runner that starts nothing.
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Build, Builder, Bundler, Versions } from './app.ts'

import { check, writeApp } from './app.ts'

export interface Outcome {
  readonly status: null | number
  readonly stderr: string
  readonly stdout: string
}

export type Runner = (command: string, args: readonly string[], cwd: string) => Outcome

/**
 * npm's command-line script, next to the running Node. It is run through that Node rather than by
 * the name `npm`, so no directory of the search path decides which program is started.
 */
export const npmOf = (node: string): string =>
  path.join(path.dirname(node), '../lib/node_modules/npm/bin/npm-cli.js')

export interface Setup {
  readonly complain: (line: string) => void
  readonly keep: boolean
  readonly node: string
  readonly packageDir: string
  readonly runner: Runner
  readonly say: (line: string) => void
  readonly versions: Versions
}

const logged = (setup: Setup, args: readonly string[], cwd: string, label: string): number => {
  const result = setup.runner(setup.node, args, cwd)
  appendFileSync(path.join(cwd, 'build.log'), `\n$ ${label}\n${result.stdout}${result.stderr}`)
  return result.status ?? 1
}

const builderOf =
  (setup: Setup): Builder =>
  (app: string, bundler: Bundler): Build => {
    rmSync(path.join(app, '.next'), { force: true, recursive: true })
    rmSync(path.join(app, 'build.log'), { force: true })
    const next = path.join(app, 'node_modules/next/dist/bin/next')
    const flags = bundler === 'webpack' ? ['--webpack'] : []
    const exit = logged(setup, [next, 'build', ...flags], app, `next build ${flags.join(' ')}`)
    return { bundler, exit, log: readFileSync(path.join(app, 'build.log'), 'utf8') }
  }

/**
 * Packs the package and installs the tarball in a new app beside `next`, `react` and `react-dom`.
 * Returns the app's directory, or the reason it could not be made.
 */
const prepare = (root: string, setup: Setup): Error | string => {
  const npm = npmOf(setup.node)
  const pack = setup.runner(
    setup.node,
    [npm, 'pack', '--silent', '--pack-destination', root],
    setup.packageDir,
  )
  const tarball = path.join(root, pack.stdout.trim().split('\n').at(-1) ?? '')
  if (pack.status !== 0 || !existsSync(tarball)) {
    return new Error(`npm pack failed:\n${pack.stdout}${pack.stderr}`)
  }
  const app = path.join(root, 'app-under-test')
  mkdirSync(app)
  writeApp(app, setup.versions, tarball)
  const installed = logged(
    setup,
    [npm, 'install', '--no-audit', '--no-fund', '--loglevel=error'],
    app,
    'npm install',
  )
  return installed === 0
    ? app
    : new Error(`npm install failed:\n${readFileSync(path.join(app, 'build.log'), 'utf8')}`)
}

const installedNextVersion = (app: string): string =>
  (
    JSON.parse(readFileSync(path.join(app, 'node_modules/next/package.json'), 'utf8')) as {
      version: string
    }
  ).version

/**
 * The whole check. Returns the exit code: 0 when every build and the control behave as the
 * criterion says, 1 when one does not, 2 when the check could not be set up.
 */
export const runCheck = (setup: Setup): number => {
  if (!existsSync(path.join(setup.packageDir, 'dist/index.js'))) {
    setup.complain('dist/ is missing: run `pnpm run build` first.')
    return 2
  }
  if (!existsSync(npmOf(setup.node))) {
    setup.complain(`npm was not found beside ${setup.node}: use a Node that ships npm.`)
    return 2
  }
  const root = mkdtempSync(path.join(tmpdir(), 'nave-base-ui-server-components-'))
  try {
    const app = prepare(root, setup)
    if (app instanceof Error) {
      setup.complain(app.message)
      return 2
    }
    setup.say(`Next.js ${installedNextVersion(app)}`)
    const problems = check(app, builderOf(setup), setup.say)
    for (const problem of problems) {
      setup.complain(problem)
    }
    return problems.length === 0 ? 0 : 1
  } finally {
    if (setup.keep) {
      setup.say(`kept: ${root}`)
    } else {
      rmSync(root, { force: true, recursive: true })
    }
  }
}
