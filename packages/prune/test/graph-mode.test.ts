/**
 * A build reads its own mode's files for problems and both modes' files for atoms: the layer is
 * the same under `next dev` and `next build`, while a problem in a file only the other mode
 * bundles does not fail the build that never bundles it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project } from './helpers/project.ts'

import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const project = scratchProjects()

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * A project whose page renders `Box` from `ui-lib`, whose exports give `src/index.js` under the
 * development condition and `dist/index.js` otherwise.
 */
function projectWithModeFiles(developmentSource: string): Project {
  const app = project({
    'app/page.tsx':
      "import { Box } from 'ui-lib'\n\nexport default function Page() {\n  return <main className={Box()} />\n}\n",
  })
  app.install('ui-lib', {
    'package.json': JSON.stringify({
      name: 'ui-lib',
      version: '1.0.0',
      type: 'module',
      exports: { '.': { development: './src/index.js', default: './dist/index.js' } },
      dependencies: { '@navecss/core': '*' },
    }),
    'dist/index.js': "import { cx } from '@navecss/core/cx'\nexport const Box = () => cx('grid')\n",
    'src/index.js': developmentSource,
  })
  return app
}

const UNINSTALLED_TOOL =
  "import 'why-did-you-render'\nimport { cx } from '@navecss/core/cx'\nexport const Box = () => cx('grid')\n"
const UNREADABLE_CALL = "import { cx } from '@navecss/core/cx'\nexport const Box = (v) => cx(v)\n"

/**
 * The record's problems, by file, kind and construct.
 */
async function problemsUnder(nodeEnv: string | undefined, source: string): Promise<string[]> {
  vi.stubEnv('NODE_ENV', nodeEnv)
  const { record } = await runAndRead(projectWithModeFiles(source))
  return record.problems.map((problem) => `${problem.file}|${problem.kind}|${problem.construct}`)
}

describe('problems count only from the files the run’s own mode bundles', () => {
  it.each([['production'], [undefined]])(
    'with NODE_ENV %s, an unresolved import in a development-only file is no problem',
    async (nodeEnv) => {
      expect(await problemsUnder(nodeEnv, UNINSTALLED_TOOL)).toEqual([])
    },
  )

  it.each([['production'], [undefined]])(
    'with NODE_ENV %s, an unreadable call in a development-only file is no problem',
    async (nodeEnv) => {
      expect(await problemsUnder(nodeEnv, UNREADABLE_CALL)).toEqual([])
    },
  )

  it('control: with NODE_ENV development, the same files are problems', async () => {
    expect(await problemsUnder('development', UNINSTALLED_TOOL)).toEqual([
      "node_modules/ui-lib/src/index.js|unreadable|'why-did-you-render'",
    ])
    expect(await problemsUnder('development', UNREADABLE_CALL)).toEqual([
      'node_modules/ui-lib/src/index.js|argument|cx(v)',
    ])
  })

  it('the atoms emitted are the same under both values of NODE_ENV', async () => {
    const source = "import { cx } from '@navecss/core/cx'\nexport const Box = () => cx('flex')\n"
    vi.stubEnv('NODE_ENV', 'production')
    const production = await runAndRead(projectWithModeFiles(source))
    vi.stubEnv('NODE_ENV', 'development')
    const development = await runAndRead(projectWithModeFiles(source))
    expect(production.atoms).toEqual(expect.arrayContaining(['flex', 'grid']))
    expect(development.atoms).toEqual(production.atoms)
  })
})
