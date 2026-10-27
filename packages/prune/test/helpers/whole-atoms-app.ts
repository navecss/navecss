import type { NextApp, Run } from './next-app.ts'
/**
 * The apps the whole-atoms rows build: one fixture in three ways (the trimmed build, the same app
 * with `withNave()` removed, and the same app with core's PostCSS plugin and no wrapper), at a
 * browser floor, on a cell.
 */
import type { Cell } from './next-cells.ts'

import { createNextApp } from './next-app.ts'
import { LOWERING_FLOOR, nextRootOf, README_FLOOR } from './next-cells.ts'

export type Variant = 'core' | 'every' | 'trimmed'

export interface Floor {
  readonly list: readonly string[]
  readonly name: 'lowering floor' | 'README floor'
}

export const FLOORS: readonly Floor[] = [
  { name: 'README floor', list: README_FLOOR },
  { name: 'lowering floor', list: LOWERING_FLOOR },
]

const WITHOUT_WRAPPER = 'export default {}\n'

const CORE_POSTCSS = "export default { plugins: { '@navecss/core/postcss': {} } }\n"

/**
 * The root layout with a skip link, and a page with a button that wears `focusRing`; nothing else
 * uses `focusRing`, `srOnly` or `srOnlyFocusable`.
 */
export const FOCUS_FILES: Record<string, string> = {
  'app/layout.jsx': [
    "import './globals.css'",
    '',
    'export default function RootLayout({ children }) {',
    '  return (',
    '    <html lang="en">',
    '      <body>',
    '        <a id="skip" href="#main" className="nave-sr-only-focusable">',
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
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Page() {',
    '  return <button id="b" className={cx(\'focusRing\')}>Press</button>',
    '}',
    '',
  ].join('\n'),
}

/**
 * An app of the variant on the cell's `next`, its `package.json` holding the floor, with `files`
 * written over the default ones.
 */
export async function createVariantApp(
  cell: Cell,
  variant: Variant,
  floor: Floor,
  files: Record<string, string>,
): Promise<NextApp> {
  const nextRoot = await nextRootOf(cell)
  const config = variant === 'trimmed' ? undefined : WITHOUT_WRAPPER
  const app = createNextApp(config, { nextRoot })
  app.write({
    ...files,
    'package.json': JSON.stringify({ name: 'web', private: true, browserslist: floor.list }),
    ...(variant === 'core' && { 'postcss.config.mjs': CORE_POSTCSS }),
  })
  return app
}

/**
 * Runs `next build` on the app with the cell's bundler flag.
 */
export function buildApp(app: NextApp, cell: Cell): Promise<Run> {
  return app.next(['build', ...cell.flags])
}
