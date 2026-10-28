/**
 * AC-nextjs-used-atoms-17, on a real `next build` and `next dev` of the newest Next.js on both
 * bundlers: the dependency rows of AC-used-atoms-16 (a problem in dependency code names the package
 * and prints its `keepFor` line), -19 (`cx.dynamic()` with no list), -43 (what `keepFor` covers),
 * -44 (`keepFor` reaches `node_modules` only) and -55 (the remedy block split by owner). One app
 * holds every package, so one report is read for all of them; the lines the printed remedies ask
 * for are then pasted into `withNave()` and the app is built again. In `next dev` the clauses "no
 * dev error names <package>" are inverted: the terminal prints the dependency's problem too. The
 * floor version is covered by the other real-build files.
 */
/* eslint-disable vitest/no-disabled-tests -- the skipped rows are the ones for a part the plugin does not do yet; each is explained where it is skipped */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import {
  builtAtoms,
  BUNDLERS,
  configText,
  TIMEOUT,
  untilPrinted,
} from '../helpers/used-atoms-build.ts'
import { dependency, nave } from '../helpers/used-atoms-fixture.ts'
import { IMPORT } from '../helpers/used-atoms-rows.ts'

const DEV_CLOSING =
  'next build stops on these. The dev server keeps serving, without rules for atoms that only these calls apply.'

const WIDE = {
  'index.js':
    "import './unreadable.js'\nimport './typo.js'\nimport './passed.js'\nimport './dist/cx.js'\nimport './dyn-import.js'\nimport './pieces.js'\nimport './readable.js'\nimport './literal.js'\n",
  'unreadable.js': `${IMPORT}export const a = (v) => cx(v)\n`,
  'typo.js': `${IMPORT}export const b = cx('interactve')\n`,
  'passed.js': `${IMPORT}export const c = [1].map(cx)\n`,
  'dist/cx.js': "export { cx } from '@navecss/core/cx'\n",
  'dyn-import.js': "import '@navecss/core/cx'\nexport const d = import('@navecss/core/cx')\n",
  'pieces.js': `${IMPORT}export const e = (t) => 'nave-' + t\nexport const f = cx('flex')\n`,
  'readable.js': `${IMPORT}export const g = cx('gap')\n`,
  'literal.js': "export const h = 'nave-truncate'\n",
}

const PACKAGES: Record<string, Record<string, string>> = {
  'bad-lib': {
    'index.js': [
      IMPORT.trim(),
      '',
      'export const t = (v) => cx(v)',
      '',
      "export const u = cx('interactve')",
      '',
      'export const w = [1].map(cx)',
      '',
    ].join('\n'),
  },
  'dyn-lib': { 'index.js': `${IMPORT}export const x = (t) => cx.dynamic(t)\n` },
  'wide-lib': WIDE,
  'zz-lib': { 'index.js': `${IMPORT}export const z = (v) => cx(v)\n` },
  'aa-lib': { 'index.js': `${IMPORT}export const a = [1].map(cx)\n` },
  '@acme/ds': { 'index.js': "export { cx } from '@navecss/core/cx'\n" },
}

const APPLICATION = {
  'components/Tone.jsx': [
    IMPORT.trim(),
    '',
    'export function Tone(tone) {',
    '  const a = cx.dynamic(tone)',
    '  return a',
    '}',
    'export function Tone2(tone) {',
    '  return cx.dynamic(tone)',
    '}',
    '',
  ].join('\n'),
  'components/Card.jsx': `${IMPORT}export const v = (variant) => cx(variant)\n`,
  'components/U.jsx': `${IMPORT}export const u = cx('legacy-card')\n`,
}

/**
 * The page importing every package and application module for its effect.
 */
function pageOf(imports: readonly string[]): string {
  return `${imports.map((specifier) => `import '${specifier}'`).join('\n')}\n\nexport default function Page() {\n  return <main />\n}\n`
}

/**
 * Installs the packages in the app's `node_modules`, each a dependency that lists core.
 */
function install(app: NextApp, packages: Record<string, Record<string, string>>): void {
  const files: Record<string, string> = {}
  for (const [name, own] of Object.entries(packages)) {
    const installed = Object.entries(dependency(name, own))
    for (const [file, text] of installed) files[`node_modules/${name}/${file}`] = text
  }
  app.write(files)
}

const IMPORTS = [
  '../components/Tone.jsx',
  '../components/Card.jsx',
  '../components/U.jsx',
  ...Object.keys(PACKAGES),
]

interface Builds {
  readonly app: NextApp
  readonly dev: { readonly output: string; readonly status: number }
  readonly fixed: Run
  readonly fixedAtoms: string[]
  readonly red: Run
  readonly unchanged: Run
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the dependency rows of the used-atoms criteria on a real next build and next dev${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(BUNDLERS)('%s, newest', (_name, flags) => {
      let builds: Builds
      beforeAll(async () => {
        const app = createNextApp(configText())
        install(app, PACKAGES)
        app.write({ ...APPLICATION, 'app/page.jsx': pageOf(IMPORTS) })
        const red = await app.next(['build', ...flags])
        app.write({
          'next.config.mjs': configText({ keepFor: { 'bad-lib': ['<atom>'] }, keep: ['flex'] }),
        })
        const unchanged = await app.next(['build', ...flags])
        app.write({ 'next.config.mjs': configText() })
        const server = await app.dev(flags)
        const served = await server.get('/')
        await untilPrinted(server, DEV_CLOSING)
        const dev = { output: server.output(), status: served.status }
        await server.stop()
        for (const file of Object.keys(APPLICATION)) app.delete(file)
        app.write({
          'app/page.jsx': pageOf(Object.keys(PACKAGES)),
          'next.config.mjs': configText({
            keep: ['flex'],
            keepFor: {
              'bad-lib': ['flex'],
              'dyn-lib': ['flex'],
              'wide-lib': ['block'],
              'zz-lib': ['flex'],
              'aa-lib': ['flex'],
            },
            cxModules: ['@acme/ds'],
          }),
        })
        const fixed = await app.next(['build', ...flags])
        builds = { app, dev, fixed, fixedAtoms: builtAtoms(app), red, unchanged }
      }, TIMEOUT)
      afterAll(async () => {
        await builds.app.remove()
      })

      const lines = (): string[] => builds.red.output.split('\n')

      it('the build fails from the hook with the report once, then one stop line', () => {
        const { code, output } = builds.red

        expect(code, output).not.toBe(0)
        expect(output.split(REPORT_CAUSE)).toHaveLength(2)
        expect(output).toMatch(/Nave stopped the build: \d+ problems, listed above\./u)
      })

      it('AC-used-atoms-16: bad-lib has three problems at their real lines and columns, and one remedy line for the package, ready to paste', () => {
        const own = lines().filter((line) => line.startsWith('node_modules/bad-lib/index.js:'))
        const remedy = lines().find((line) => line.startsWith('bad-lib is a dependency'))

        expect(own.map((line) => line.split(': ', 1)[0])).toEqual([
          'node_modules/bad-lib/index.js:3:28',
          'node_modules/bad-lib/index.js:5:21',
          'node_modules/bad-lib/index.js:7:26',
        ])
        expect(remedy).toContain("keepFor: { 'bad-lib': ['<atom>'] }")
        expect(remedy).toContain('not yours to change')
        expect(remedy).toContain("The lasting fix is the package's")
        expect(builds.red.output).not.toContain('keep alone')
      })

      it('AC-used-atoms-16: the printed line pasted unchanged stops the build at config load with the unknown-atom text', () => {
        const { code, output } = builds.unchanged

        expect(code, output).not.toBe(0)
        expect(output).toContain('withNave(): keepFor["bad-lib"] names an unknown atom "<atom>"')
        expect(output).not.toContain(REPORT_CAUSE)
      })

      it('AC-used-atoms-19: the application problem counts the two cx.dynamic() calls, one line each, and dyn-lib has its own', () => {
        expect(builds.red.output).toContain(
          'cx.dynamic() is called in 2 places in your code, but keep is empty',
        )
        expect(lines().filter((line) => line.startsWith('components/Tone.jsx:'))).toHaveLength(2)
        expect(lines().some((line) => line.startsWith('node_modules/dyn-lib/index.js:'))).toBe(true)
        expect(
          lines().find((line) => line.startsWith('dyn-lib calls cx.dynamic() in 1 place')),
        ).toContain("keepFor: { 'dyn-lib': ['<atom>'] }")
      })

      it('AC-used-atoms-43: wide-lib has six problems and its keepFor line once, with no cxModules entry for it', () => {
        const own = lines().filter((line) => line.startsWith('node_modules/wide-lib/'))

        expect(own).toHaveLength(6)
        expect(builds.red.output.match(/keepFor: \{ 'wide-lib'/gu)).toHaveLength(1)
        expect(builds.red.output).not.toContain("cxModules: ['wide-lib")
      })

      it('AC-used-atoms-55: the remedy block lists the application lines first, then each package in name order, then Available last', () => {
        const output = builds.red.output
        const report = lines().slice(
          lines().findIndex((line) => /^\d+ problems? in /u.test(line)),
          lines().findIndex((line) => line.includes('Nave stopped the build')),
        )
        const remedy = report.filter((line) => line.length > 0 && !/^\S+:\d+:\d+: /u.test(line))
        const owners = ['@acme/ds', 'aa-lib', 'bad-lib', 'dyn-lib', 'wide-lib', 'zz-lib']
        const at = owners.map((name) => remedy.findIndex((line) => line.startsWith(`${name} `)))

        expect(at.every((index) => index > 0)).toBe(true)
        expect(at).toEqual(at.toSorted((a, b) => a - b))
        expect(
          remedy.findIndex((line) => line.startsWith('Name the atoms at the call')),
        ).toBeLessThan(at[0]!)
        expect(remedy.at(-1)).toMatch(/^Available: /u)
        expect(output).toContain(REPORT_CAUSE)
        expect(output).not.toContain("atomic: 'all'")
      })

      // Skipped until the plugin tracks which application files take a `cx` a package re-exports:
      // the report then offers `cxModules` for such a package, where it now offers `keepFor`.
      it.skip('AC-used-atoms-55: a package whose entry re-exports cx is told to list it in cxModules, with no keepFor line', () => {
        const line = lines().find((text) => text.startsWith('@acme/ds'))

        expect(line).toBe(
          "@acme/ds re-exports cx in '@acme/ds'. List it in withNave(): cxModules: ['@acme/ds'].",
        )
      })

      it('the dev terminal prints the same dependency problems and the closing line, and the page serves (the inverted clauses)', () => {
        const { output, status } = builds.dev

        expect(status).toBe(200)
        expect(output).toContain(REPORT_CAUSE)
        expect(output).toContain('node_modules/bad-lib/index.js:3:28')
        expect(output).toContain('node_modules/dyn-lib/index.js:')
        expect(output).toContain('node_modules/wide-lib/')
        expect(output).toContain(DEV_CLOSING)
        expect(output).not.toContain('Nave stopped the build')
      })

      it('the printed lines pasted into withNave() build green, shipping the application and the listed atoms', () => {
        const { code, output } = builds.fixed

        expect(code, output).toBe(0)
        expect(output).not.toContain(REPORT_CAUSE)
        expect(builds.fixedAtoms).toEqual(['block', 'flex', 'gap', 'truncate'])
      })
    })
  },
)

/**
 * `@acme/ui` laid out as pnpm lays it out, `plain-lib`, and a workspace package linked into
 * `node_modules`, each with one unreadable `cx(v)` call.
 */
function writePackages(app: NextApp): void {
  const unreadable = `${IMPORT}export const u = (v) => cx(v)\n`
  const pnpm = path.join(app.dir, 'node_modules/.pnpm/@acme+ui@1.2.0/node_modules/@acme/ui')
  mkdirSync(path.join(pnpm, 'dist'), { recursive: true })
  writeFileSync(
    path.join(pnpm, 'package.json'),
    nave('@acme/ui', { version: '1.2.0', main: './dist/index.js' }),
  )
  writeFileSync(path.join(pnpm, 'dist/package.json'), '{ "type": "module" }')
  writeFileSync(path.join(pnpm, 'dist/index.js'), unreadable)
  mkdirSync(path.join(app.dir, 'node_modules/@acme'), { recursive: true })
  symlinkSync(pnpm, path.join(app.dir, 'node_modules/@acme/ui'), 'dir')
  const workspace = path.join(app.dir, 'packages/ws-ui')
  mkdirSync(workspace, { recursive: true })
  writeFileSync(path.join(workspace, 'package.json'), nave('@acme/ws-ui', { main: './index.js' }))
  writeFileSync(path.join(workspace, 'index.js'), unreadable)
  symlinkSync(workspace, path.join(app.dir, 'node_modules/@acme/ws-ui'), 'dir')
  app.write({
    'node_modules/plain-lib/package.json': nave('plain-lib'),
    'node_modules/plain-lib/index.js': unreadable,
    'app/page.jsx': pageOf(['@acme/ui', 'plain-lib', '@acme/ws-ui']),
  })
}

describe.skipIf(SKIP_REASON !== undefined)(
  `AC-used-atoms-44 on a real next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(BUNDLERS)('%s, newest', (_name, flags) => {
      let app: NextApp
      let first: Run
      let listed: Run
      beforeAll(async () => {
        app = createNextApp(configText())
        writePackages(app)
        first = await app.next(['build', ...flags])
        app.write({
          'next.config.mjs': configText({
            keepFor: { '@acme/ui': ['flex'], 'plain-lib': ['flex'], '@acme/ws-ui': ['flex'] },
          }),
        })
        listed = await app.next(['build', ...flags])
      }, TIMEOUT)
      afterAll(async () => {
        await app.remove()
      })

      it('AC-used-atoms-44: the report names @acme/ui (not dist, not the .pnpm path) and plain-lib as dependencies, and the workspace package as the application’s with no keepFor line', () => {
        const lines = first.output.split('\n')

        expect(first.code, first.output).not.toBe(0)
        expect(lines.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(true)
        expect(lines.some((line) => line.startsWith('plain-lib is a dependency'))).toBe(true)
        expect(lines.some((line) => line.startsWith('packages/ws-ui/index.js:'))).toBe(true)
        expect(lines.filter((line) => line.includes('keepFor') && line.includes('ws-ui'))).toEqual(
          [],
        )
      })

      it('AC-used-atoms-44: listing all three stops the two dependencies’ problems and never the workspace package’s', () => {
        const problems = listed.output.split('\n').filter((line) => /^\S+:\d+:\d+: /u.test(line))

        expect(listed.code, listed.output).not.toBe(0)
        expect(problems).toHaveLength(1)
        expect(problems[0]).toMatch(/^packages\/ws-ui\/index\.js:/u)
      })
    })
  },
)
