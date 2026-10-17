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
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

export const DEFAULT_NEXT = '16.4.2'
export const DEFAULT_REACT = '19.3.1'

export interface Route {
  /**
  The directory under `app/`, and the name of the prerendered file.
   */
  readonly name: string
  readonly source: string
}

const PAGE = (imports: string, body: string, directive = ''): string =>
  `${directive}${imports}\n\nexport default function Page() {\n  return (\n${body}\n  )\n}\n`

/**
 * The four routes. A page with no directive is a Server Component, the App Router's default.
 */
export const ROUTES: readonly Route[] = [
  {
    name: 'namespace',
    source: PAGE(
      `import { Accordion } from '@navecss/base-ui/accordion'\nimport { Dialog } from '@navecss/base-ui/dialog'`,
      `    <>\n      <Dialog.Root>\n        <Dialog.Trigger variant="primary">Open</Dialog.Trigger>\n      </Dialog.Root>\n      <Accordion.Root>\n        <Accordion.Item value="a">\n          <Accordion.Header>\n            <Accordion.Trigger>One</Accordion.Trigger>\n          </Accordion.Header>\n        </Accordion.Item>\n      </Accordion.Root>\n    </>`,
    ),
  },
  {
    name: 'single',
    source: PAGE(
      `import { Button } from '@navecss/base-ui/button'`,
      `    <Button variant="primary">Save</Button>`,
    ),
  },
  {
    name: 'root',
    source: PAGE(
      `import { Dialog } from '@navecss/base-ui'`,
      `    <Dialog.Root>\n      <Dialog.Trigger variant="primary">Open</Dialog.Trigger>\n    </Dialog.Root>`,
    ),
  },
  {
    name: 'client',
    source: PAGE(
      `import { Dialog } from '@navecss/base-ui/dialog'`,
      `    <Dialog.Root>\n      <Dialog.Trigger variant="primary">Open</Dialog.Trigger>\n    </Dialog.Root>`,
      `'use client'\n\n`,
    ),
  },
]

/**
 * What 0.2.0's build prints: Turbopack at prerender, webpack on the `export *` and on dotting into
 * a client module.
 */
export const KNOWN_ERRORS: readonly string[] = [
  'Element type is invalid',
  'unsupported to use "export *"',
  'Cannot access',
]

/**
 * The known errors a build log contains.
 */
export const logProblems = (log: string): string[] =>
  KNOWN_ERRORS.filter((message) => log.includes(message)).map(
    (message) => `the log contains "${message}"`,
  )

const PRIMARY_BUTTON = /<button\b[^>]*\bdata-nave-variant="primary"/

/**
 * What a route's prerendered HTML lacks: the primary Button of the page, and on the namespace route
 * an element carrying a class of the Accordion's styling as well.
 */
export const htmlProblems = (route: string, html: string): string[] => [
  ...(route === 'client' || PRIMARY_BUTTON.test(html)
    ? []
    : [`${route}: no <button> with data-nave-variant="primary"`]),
  ...(route === 'client' || route !== 'namespace' || /class="[^"]*nave-base-ui-accordion/.test(html)
    ? []
    : [`${route}: no element with a class of the Accordion`]),
]

interface Build {
  readonly bundler: 'turbopack' | 'webpack'
  readonly exit: number
  readonly log: string
}

const run = (
  command: string,
  args: readonly string[],
  cwd: string,
  label: string,
): Build['exit'] => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
  appendFileSync(path.join(cwd, 'build.log'), `\n$ ${label}\n${result.stdout}${result.stderr}`)
  return result.status ?? 1
}

const build = (app: string, bundler: Build['bundler']): Build => {
  rmSync(path.join(app, '.next'), { force: true, recursive: true })
  rmSync(path.join(app, 'build.log'), { force: true })
  const next = path.join(app, 'node_modules/next/dist/bin/next')
  const exit = run(
    process.execPath,
    [next, 'build', ...(bundler === 'webpack' ? ['--webpack'] : [])],
    app,
    `next build${bundler === 'webpack' ? ' --webpack' : ''}`,
  )
  return { bundler, exit, log: readFileSync(path.join(app, 'build.log'), 'utf8') }
}

const writeApp = (
  app: string,
  versions: { next: string; react: string },
  tarball: string,
): void => {
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
  writeFileSync(
    path.join(app, 'app/layout.jsx'),
    `export default function Layout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  )\n}\n`,
  )
  for (const route of ROUTES) {
    mkdirSync(path.join(app, 'app', route.name), { recursive: true })
    writeFileSync(path.join(app, 'app', route.name, 'page.jsx'), route.source)
  }
}

const problemsOf = (app: string, result: Build): string[] => [
  ...(result.exit === 0 ? [] : [`${result.bundler}: next build exited ${result.exit}`]),
  ...logProblems(result.log).map((problem) => `${result.bundler}: ${problem}`),
  ...ROUTES.flatMap((route) => {
    const file = path.join(app, '.next/server/app', `${route.name}.html`)
    return existsSync(file)
      ? htmlProblems(route.name, readFileSync(file, 'utf8')).map(
          (problem) => `${result.bundler}: ${problem}`,
        )
      : [`${result.bundler}: ${route.name} was not prerendered`]
  }),
]

const main = (): number => {
  const { values } = parseArgs({
    options: {
      keep: { type: 'boolean' },
      next: { default: DEFAULT_NEXT, type: 'string' },
      react: { default: DEFAULT_REACT, type: 'string' },
    },
  })
  if (!existsSync(path.join(PACKAGE_DIR, 'dist/index.js'))) {
    console.error('dist/ is missing: run `pnpm run build` first.')
    return 2
  }
  const root = mkdtempSync(path.join(tmpdir(), 'nave-base-ui-server-components-'))
  const app = path.join(root, 'app-under-test')
  mkdirSync(app)
  try {
    const pack = spawnSync('npm', ['pack', '--silent', '--pack-destination', root], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
    })
    const tarball = path.join(root, pack.stdout.trim().split('\n').at(-1) ?? '')
    if (pack.status !== 0 || !existsSync(tarball)) {
      console.error(`npm pack failed:\n${pack.stdout}${pack.stderr}`)
      return 2
    }
    writeApp(app, { next: values.next, react: values.react }, tarball)
    const installed = run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--loglevel=error'],
      app,
      'npm install',
    )
    if (installed !== 0) {
      console.error(`npm install failed:\n${readFileSync(path.join(app, 'build.log'), 'utf8')}`)
      return 2
    }
    const version = (
      JSON.parse(readFileSync(path.join(app, 'node_modules/next/package.json'), 'utf8')) as {
        version: string
      }
    ).version
    console.log(`Next.js ${version}`)

    const problems: string[] = []
    for (const bundler of ['turbopack', 'webpack'] as const) {
      const result = build(app, bundler)
      console.log(`${bundler}: next build exit ${result.exit}`)
      problems.push(...problemsOf(app, result))
    }

    // The control: 0.2.0's shape, the directive on the namespace module.
    const entry = path.join(app, 'node_modules/@navecss/base-ui/dist/dialog/index.js')
    writeFileSync(entry, `'use client';\n${readFileSync(entry, 'utf8')}`)
    for (const bundler of ['turbopack', 'webpack'] as const) {
      const result = build(app, bundler)
      console.log(`control, ${bundler}: next build exit ${result.exit} (non-zero expected)`)
      if (result.exit === 0) {
        problems.push(`control, ${bundler}: the build passed with the directive on dialog/index.js`)
      }
    }

    for (const problem of problems) {
      console.error(problem)
    }
    return problems.length === 0 ? 0 : 1
  } finally {
    if (values.keep === true) {
      console.log(`kept: ${root}`)
    } else {
      rmSync(root, { force: true, recursive: true })
    }
  }
}

if (isMain) {
  process.exitCode = main()
}
