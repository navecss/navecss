/**
 * Builds a Next.js App Router app whose Server Components use the package, under both bundlers, and
 * says whether `next build` accepts them. Four routes: a namespace (`Dialog`, `Accordion`), a
 * single component (`Button`), the package root and a page that starts with `'use client'`. As the
 * control, the same app with the directive put back on the installed `dialog/index.js` (0.2.0's
 * shape) must fail to build under each bundler.
 *
 * The app lives in the operating system's temporary directory and nothing is added to any
 * `package.json` of this repository, so `next` is never a dependency here. It installs from the
 * network and takes 30 to 60 seconds per bundler. Run after `pnpm run build`, before a release:
 *
 *   node scripts/check-server-components.ts [--next 16.4.2] [--react 19.3.1] [--keep]
 *
 * `--next` and `--react` choose the versions (the defaults are the ones the fix was measured on);
 * `--keep` leaves the app in place and prints where. The exit code is 0 only when every build and
 * the control behave as stated.
 */
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { htmlProblems, logProblems, type Route, ROUTES } from './server-components/read.ts'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

const DEFAULT_NEXT = '16.4.2'
const DEFAULT_REACT = '19.3.1'

interface Build {
  readonly bundler: Bundler
  readonly exit: number
  readonly log: string
}

type Bundler = 'turbopack' | 'webpack'

const BUNDLERS: readonly Bundler[] = ['turbopack', 'webpack']

const say = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

const complain = (line: string): void => {
  process.stderr.write(`${line}\n`)
}

const run = (command: string, args: readonly string[], cwd: string, label: string): number => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
  appendFileSync(path.join(cwd, 'build.log'), `\n$ ${label}\n${result.stdout}${result.stderr}`)
  return result.status ?? 1
}

const build = (app: string, bundler: Bundler): Build => {
  rmSync(path.join(app, '.next'), { force: true, recursive: true })
  rmSync(path.join(app, 'build.log'), { force: true })
  const next = path.join(app, 'node_modules/next/dist/bin/next')
  const flags = bundler === 'webpack' ? ['--webpack'] : []
  const exit = run(
    process.execPath,
    [next, 'build', ...flags],
    app,
    `next build ${flags.join(' ')}`,
  )
  return { bundler, exit, log: readFileSync(path.join(app, 'build.log'), 'utf8') }
}

const LAYOUT = [
  'export default function Layout({ children }) {',
  '  return (',
  '    <html lang="en">',
  '      <body>{children}</body>',
  '    </html>',
  '  )',
  '}',
  '',
].join('\n')

interface Versions {
  readonly next: string
  readonly react: string
}

const writeApp = (app: string, versions: Versions, tarball: string): void => {
  writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({
      dependencies: {
        '@base-ui/react': '1.8.0',
        '@navecss/base-ui': `file:${tarball}`,
        next: versions.next,
        react: versions.react,
        'react-dom': versions.react,
      },
      name: 'server-components-check',
      private: true,
      type: 'module',
    }),
  )
  mkdirSync(path.join(app, 'app'), { recursive: true })
  writeFileSync(path.join(app, 'app/layout.jsx'), LAYOUT)
  for (const route of ROUTES) {
    mkdirSync(path.join(app, 'app', route.name), { recursive: true })
    writeFileSync(path.join(app, 'app', route.name, 'page.jsx'), route.source)
  }
}

const routeProblems = (app: string, route: Route): string[] => {
  const file = path.join(app, '.next/server/app', `${route.name}.html`)
  return existsSync(file)
    ? htmlProblems(route.name, readFileSync(file, 'utf8'))
    : [`${route.name} was not prerendered`]
}

const problemsOf = (app: string, result: Build): string[] =>
  [
    ...(result.exit === 0 ? [] : [`next build exited ${result.exit}`]),
    ...logProblems(result.log),
    ...ROUTES.flatMap((route) => routeProblems(app, route)),
  ].map((problem) => `${result.bundler}: ${problem}`)

/**
 * Packs this package and installs the tarball in a new app beside `next`, `react` and `react-dom`.
 * Returns the app's directory, or the reason it could not be made.
 */
const prepare = (root: string, versions: Versions): string | Error => {
  const pack = spawnSync('npm', ['pack', '--silent', '--pack-destination', root], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
  })
  const tarball = path.join(root, pack.stdout.trim().split('\n').at(-1) ?? '')
  if (pack.status !== 0 || !existsSync(tarball)) {
    return new Error(`npm pack failed:\n${pack.stdout}${pack.stderr}`)
  }
  const app = path.join(root, 'app-under-test')
  mkdirSync(app)
  writeApp(app, versions, tarball)
  const installed = run(
    'npm',
    ['install', '--no-audit', '--no-fund', '--loglevel=error'],
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
 * 0.2.0's shape: the directive on the namespace module of Dialog. Every build must fail with it.
 */
const controlProblems = (app: string): string[] => {
  const entry = path.join(app, 'node_modules/@navecss/base-ui/dist/dialog/index.js')
  writeFileSync(entry, `'use client';\n${readFileSync(entry, 'utf8')}`)
  return BUNDLERS.flatMap((bundler) => {
    const { exit } = build(app, bundler)
    say(`control, ${bundler}: next build exit ${exit} (non-zero expected)`)
    return exit === 0
      ? [`control, ${bundler}: the build passed with the directive on dialog/index.js`]
      : []
  })
}

const check = (app: string): string[] => {
  const builds = BUNDLERS.map((bundler) => {
    const result = build(app, bundler)
    say(`${bundler}: next build exit ${result.exit}`)
    return result
  })
  return [...builds.flatMap((result) => problemsOf(app, result)), ...controlProblems(app)]
}

const main = (): number => {
  const { values } = parseArgs({
    options: {
      keep: { type: 'boolean' },
      next: { default: DEFAULT_NEXT, type: 'string' },
      react: { default: DEFAULT_REACT, type: 'string' },
    },
  })
  if (!existsSync(path.join(PACKAGE_DIR, 'dist/index.js'))) {
    complain('dist/ is missing: run `pnpm run build` first.')
    return 2
  }
  const root = mkdtempSync(path.join(tmpdir(), 'nave-base-ui-server-components-'))
  try {
    const app = prepare(root, { next: values.next, react: values.react })
    if (app instanceof Error) {
      complain(app.message)
      return 2
    }
    say(`Next.js ${installedNextVersion(app)}`)
    const problems = check(app)
    for (const problem of problems) {
      complain(problem)
    }
    return problems.length === 0 ? 0 : 1
  } finally {
    if (values.keep === true) {
      say(`kept: ${root}`)
    } else {
      rmSync(root, { force: true, recursive: true })
    }
  }
}

if (isMain) {
  process.exitCode = main()
}
