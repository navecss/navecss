/**
 * Imports of core's subpaths other than `cx` (its stylesheets, its manifest, its atom map) are no
 * use of `cx` and no problem, from the application or from a package; only a `require()` of a
 * subpath core exports for `import` alone cannot be resolved.
 */
import { describe, expect, it } from 'vitest'

import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const project = scratchProjects()

const LAYOUT =
  'export default function Layout({ children }: { children: unknown }) {\n  return <html><body>{children}</body></html>\n}\n'

const PAGE =
  "import { cx } from '@navecss/core/cx'\n\nexport default function Page() {\n  return <main className={cx('grid')} />\n}\n"

describe('core subpaths that are not cx', () => {
  it('every stylesheet subpath, the manifest and the atom map, from a layout, record no problem', async () => {
    const { atoms, record } = await runAndRead(
      project({
        'app/layout.tsx': `import '@navecss/core'
import '@navecss/core/layers'
import '@navecss/core/atomic'
import '@navecss/core/reset'
import '@navecss/core/no-tokens'
import '@navecss/core/standalone'
import pkg from '@navecss/core/package.json'
import { atomClassMap } from '@navecss/core/atoms'
import type { AtomName } from '@navecss/core/atoms'
export const x: [unknown, unknown, AtomName?] = [pkg, atomClassMap]
${LAYOUT}`,
        'app/page.tsx': PAGE,
      }),
    )
    expect(record.problems).toEqual([])
    expect(atoms).toContain('grid')
  })

  it('the same kinds of import from a package that lists core record no problem', async () => {
    const app = project({
      'app/page.tsx':
        "import { Box } from 'lib'\n\nexport default function Page() {\n  return <main className={Box()} />\n}\n",
    })
    app.install('lib', {
      'package.json': JSON.stringify({
        name: 'lib',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        dependencies: { '@navecss/core': '*' },
      }),
      'index.js':
        "import '@navecss/core/layers'\nimport '@navecss/core'\nimport { cx } from '@navecss/core/cx'\nexport const Box = () => cx('grid')\n",
    })
    const { atoms, record } = await runAndRead(app)
    expect(record.problems).toEqual([])
    expect(atoms).toContain('grid')
  })

  it('require() of stylesheet subpaths records no problem', async () => {
    const { record } = await runAndRead(
      project({
        'app/extra.cjs': "require('@navecss/core/layers')\nrequire('@navecss/core')\n",
        'app/page.tsx': `import './extra.cjs'\n${PAGE}`,
      }),
    )
    expect(record.problems).toEqual([])
  })

  it('require() of the atom map, which core exports for import only, cannot be resolved', async () => {
    const { record } = await runAndRead(
      project({
        'app/extra.cjs': "module.exports = require('@navecss/core/atoms')\n",
        'app/page.tsx': `import './extra.cjs'\n${PAGE}`,
      }),
    )
    expect(
      record.problems.map((problem) => [problem.file, problem.kind, problem.construct]),
    ).toEqual([['app/extra.cjs', 'unreadable', "'@navecss/core/atoms'"]])
  })
})
