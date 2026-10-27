/**
 * AC-nextjs-used-atoms-41 on a real build: `next dev` serves the atoms `next build` ships, for
 * routes it never compiled too. The app has a route nothing requests in dev, a server component, a
 * client component, a dependency, `keep`, `keepFor` and a skip link in the layout. Only `/` is
 * requested in dev, over HTTP, and its linked CSS is compared with the build's.
 */
import { atomClassMap } from '@navecss/core/atoms'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { compareLayers } from '../helpers/atoms-flatten.ts'
import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { cells, nextRootOf } from '../helpers/next-cells.ts'
import { layerAtoms } from '../helpers/s3-used-atoms.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const CX = "import { cx } from '@navecss/core/cx'"

const EMITTED = [
  'block',
  'flex',
  'gap',
  'grid',
  'hidden',
  'inlineFlex',
  'srOnlyFocusable',
  'truncate',
]

const WRAPPED = [
  "import { withNave } from '@navecss/prune'",
  '',
  'export default withNave({}, { keep: ["truncate"], keepFor: { "kf-lib": ["inlineFlex"] } })',
  '',
].join('\n')

const WITHOUT_WRAPPER = 'export default {}\n'

const FILES: Record<string, string> = {
  'app/layout.jsx': [
    "import './globals.css'",
    '',
    'export default function RootLayout({ children }) {',
    '  return (',
    '    <html lang="en">',
    '      <body>',
    '        <a href="#main" className="skip',
    'nave-sr-only-focusable">',
    '          Skip to content',
    '        </a>',
    '        <main id="main">{children}</main>',
    '      </body>',
    '    </html>',
    '  )',
    '}',
    '',
  ].join('\n'),
  'app/page.jsx': [
    CX,
    "import { Client } from '../components/Client'",
    "import { Server } from '../components/Server'",
    "import { mark } from 'kf-lib'",
    "import { look } from 'ok-lib'",
    '',
    'export default function Page() {',
    '  return (',
    '    <div id="t" className={cx(\'flex\')}>',
    '      <Server />',
    '      <Client />',
    '      <p className={look}>{mark}</p>',
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n'),
  'app/other/page.jsx': [
    CX,
    '',
    'export default function Other() {',
    "  return <div className={cx('grid')} />",
    '}',
    '',
  ].join('\n'),
  'components/Server.jsx': [
    CX,
    '',
    'export function Server() {',
    "  return <p className={cx('block')}>server</p>",
    '}',
    '',
  ].join('\n'),
  'components/Client.jsx': [
    "'use client'",
    '',
    CX,
    '',
    'export function Client() {',
    "  return <p className={cx('hidden')}>client</p>",
    '}',
    '',
  ].join('\n'),
  'node_modules/ok-lib/package.json': JSON.stringify({
    name: 'ok-lib',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dependencies: { '@navecss/core': '*' },
  }),
  'node_modules/ok-lib/index.js': `${CX}\n\nexport const look = cx('gap')\n`,
  'node_modules/kf-lib/package.json': JSON.stringify({
    name: 'kf-lib',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
  }),
  'node_modules/kf-lib/index.js': "export const mark = 'kf'\n",
}

const EVERY_ATOM = Object.keys(atomClassMap).toSorted((a, b) => a.localeCompare(b))

const CELLS = cells().map((cell) => [cell.name, cell] as const)

describe.skipIf(SKIP_REASON !== undefined)(
  `next dev serves the atoms next build ships${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(CELLS)(
      '%s: AC-nextjs-used-atoms-41: the dev layer for / and the build name the same atoms, a route never requested included',
      async (_name, cell) => {
        const nextRoot = await nextRootOf(cell)
        const building = createNextApp(WRAPPED, { nextRoot })
        const serving = createNextApp(WRAPPED, { nextRoot })
        const everyAtom = createNextApp(WITHOUT_WRAPPER, { nextRoot })
        apps.push(building, serving, everyAtom)
        for (const app of [building, serving, everyAtom]) app.write(FILES)

        const build = await building.next(['build', ...cell.flags])
        expect(build.code, build.output).toBe(0)
        const built = building.builtCss()

        const server = await serving.dev(cell.flags)
        const dev = await server.css('/')
        expect(server.output(), '/other is never requested').not.toContain('/other')

        // The control: a dev server that does not trim names every built-in atom.
        const untrimmed = await everyAtom.dev(cell.flags)
        const untrimmedLayer = await untrimmed.css('/')

        expect(layerAtoms(built), "the build's layer").toEqual(EMITTED)
        expect(layerAtoms(dev), "the dev server's layer for /").toEqual(EMITTED)
        // `grid` is in the dev layer although `/other` was never compiled.
        expect(layerAtoms(dev)).toContain('grid')

        const comparison = compareLayers(dev, built, EMITTED)
        expect(comparison.missing, 'entries the build has and dev lacks').toEqual([])
        expect(comparison.outside, 'dev entries of an atom outside the set').toEqual([])
        expect(comparison.unexpected, 'dev entries the build lacks').toEqual([])

        expect(layerAtoms(untrimmedLayer), "the every-atom dev server's layer").toEqual(EVERY_ATOM)
      },
      TIMEOUT,
    )
  },
)
