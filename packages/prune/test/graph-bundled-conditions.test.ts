/**
 * The files of a package Next.js's bundlers pick that a plain Node resolution does not: the legacy
 * `browser` field of the client build, and the `production` and `development` conditions webpack
 * adds by mode. Reading more files than one build bundles is safe; missing one is not.
 */
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const project = scratchProjects()

const CX_IMPORT = "import { cx } from '@navecss/core/cx'"

/**
 * A project whose page renders `Box` from the installed package `name`.
 */
function projectUsing(name: string, manifest: object, files: Record<string, string>): Project {
  const app = project({
    'app/page.tsx': `import { Box } from '${name}'\n\nexport default function Page() {\n  return <Box />\n}\n`,
  })
  app.install(name, {
    'package.json': JSON.stringify({
      name,
      version: '1.0.0',
      dependencies: { '@navecss/core': '*' },
      ...manifest,
    }),
    ...files,
  })
  return app
}

describe('the files a Next.js build bundles from a package are read', () => {
  it('the file a package names in its browser field is read', async () => {
    const app = projectUsing(
      'br-lib',
      { main: 'index.js', browser: 'browser.js' },
      {
        'index.js': `${CX_IMPORT}\nexport const Box = () => cx('flex')\n`,
        'browser.js': `${CX_IMPORT}\nexport const Box = () => cx('grid')\n`,
      },
    )
    const { atoms, record } = await runAndRead(app)
    // Control: the main file is read as before.
    expect(atoms).toContain('flex')
    expect(atoms).toContain('grid')
    expect(Object.keys(record.files)).toContain('node_modules/br-lib/browser.js')
  })

  it('the file an exports map gives under the production condition is read', async () => {
    const app = projectUsing(
      'pr-lib',
      { type: 'module', exports: { '.': { production: './prod.js', default: './dev.js' } } },
      {
        'prod.js': `${CX_IMPORT}\nexport const Box = () => cx('grid')\n`,
        'dev.js': `${CX_IMPORT}\nexport const Box = () => cx('flex')\n`,
      },
    )
    const { atoms } = await runAndRead(app)
    expect(atoms).toContain('flex')
    expect(atoms).toContain('grid')
  })

  it('the file an exports map gives under the development condition is read', async () => {
    const app = projectUsing(
      'dv-lib',
      { type: 'module', exports: { '.': { development: './dev.js', default: './prod.js' } } },
      {
        'dev.js': `${CX_IMPORT}\nexport const Box = () => cx('grid')\n`,
        'prod.js': `${CX_IMPORT}\nexport const Box = () => cx('flex')\n`,
      },
    )
    const { atoms } = await runAndRead(app)
    expect(atoms).toContain('flex')
    expect(atoms).toContain('grid')
  })
})
