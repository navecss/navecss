/**
 * The Server Component check's app and its verdict, apart from the processes that run it: the files
 * of the throwaway app, what a build of it must show, and the control that puts 0.2.0's shape back.
 * The builder is passed in, so a test can judge builds it did not run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Route } from './read.ts'

import { htmlProblems, logProblems, ROUTES } from './read.ts'

export type Bundler = 'turbopack' | 'webpack'

export const BUNDLERS: readonly Bundler[] = ['turbopack', 'webpack']

export interface Build {
  readonly bundler: Bundler
  readonly exit: number
  readonly log: string
}

export type Builder = (app: string, bundler: Bundler) => Build

export interface Versions {
  readonly next: string
  readonly react: string
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

/**
 * Writes the app's manifest, its layout and one page per route. The package under test is the
 * packed tarball.
 */
export const writeApp = (app: string, versions: Versions, tarball: string): void => {
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
 * 0.2.0's shape: the directive on the namespace module of Dialog. Every build must fail with it.
 */
const controlProblems = (
  app: string,
  builder: Builder,
  report: (line: string) => void,
): string[] => {
  const entry = path.join(app, 'node_modules/@navecss/base-ui/dist/dialog/index.js')
  writeFileSync(entry, `'use client';\n${readFileSync(entry, 'utf8')}`)
  return BUNDLERS.flatMap((bundler) => {
    const { exit } = builder(app, bundler)
    report(`control, ${bundler}: next build exit ${exit} (non-zero expected)`)
    return exit === 0
      ? [`control, ${bundler}: the build passed with the directive on dialog/index.js`]
      : []
  })
}

/**
 * Builds the app under both bundlers, then the control, and returns what is wrong: nothing when
 * every build passes and shows its pages, and every control build fails.
 */
export const check = (app: string, builder: Builder, report: (line: string) => void): string[] => {
  const builds = BUNDLERS.map((bundler) => {
    const result = builder(app, bundler)
    report(`${bundler}: next build exit ${result.exit}`)
    return result
  })
  return [
    ...builds.flatMap((result) => problemsOf(app, result)),
    ...controlProblems(app, builder, report),
  ]
}
