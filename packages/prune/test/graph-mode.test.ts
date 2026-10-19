/**
 * A build reads its own mode's files for problems and both modes' files for atoms: the layer is
 * the same under `next dev` and `next build`, while a problem in a file only the other mode
 * bundles does not fail the build that never bundles it.
 */
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project } from './helpers/project.ts'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import { prunePlugin } from '../src/postcss.ts'
import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

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

/**
 * A project whose page renders `Box` from `ui-lib`, whose exports give `prod.js` under the
 * production condition and `dev.js` otherwise.
 */
function projectWithProductionFile(prod: string, dev: string): Project {
  const app = project({
    'app/page.tsx':
      "import { Box } from 'ui-lib'\n\nexport default function Page() {\n  return <main className={Box()} />\n}\n",
  })
  app.install('ui-lib', {
    'package.json': JSON.stringify({
      name: 'ui-lib',
      version: '1.0.0',
      type: 'module',
      exports: { '.': { production: './prod.js', default: './dev.js' } },
      dependencies: { '@navecss/core': '*' },
    }),
    'prod.js': prod,
    'dev.js': dev,
  })
  return app
}

const RUN_TIME_ATOM =
  "import { cx } from '@navecss/core/cx'\nexport const Box = (v) => cx('grid', v)\n"
const PLAIN_CALL = "import { cx } from '@navecss/core/cx'\nexport const Box = () => cx('grid')\n"

/**
 * The record's problems after a run whose hand-off a function config left, called by Next.js
 * with `phase`, its project directory then set by the webpack callback as Next.js calls it.
 */
async function problemsUnderPhase(app: Project, phase: string): Promise<string[]> {
  const previous = process.env[HANDOFF_VARIABLE]
  try {
    const wrapped = withNave(() => ({})) as unknown as (phase: string) => {
      webpack: (config: unknown, context: { dir: string }) => unknown
    }
    wrapped(phase).webpack({}, { dir: app.dir })
    const from = path.join(app.dir, 'node_modules/@navecss/core/dist/atomic.css')
    await postcss([prunePlugin()]).process(ATOMIC_CSS, { from })
  } finally {
    if (previous === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = previous
  }
  return recordOf(app).problems.map(
    (problem) => `${problem.file}|${problem.kind}|${problem.construct}`,
  )
}

describe('the mode comes from the phase Next.js gives the config, not from NODE_ENV alone', () => {
  it('a function config called in the production build phase counts the production file, even with NODE_ENV development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const app = projectWithProductionFile(RUN_TIME_ATOM, PLAIN_CALL)
    expect(await problemsUnderPhase(app, 'phase-production-build')).toEqual([
      "node_modules/ui-lib/prod.js|argument|cx('grid', v)",
    ])
  })

  it('an object config with NODE_ENV development counts the files of both modes', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { record } = await runAndRead(projectWithProductionFile(RUN_TIME_ATOM, PLAIN_CALL))
    expect(record.problems.map((problem) => `${problem.file}|${problem.kind}`)).toEqual([
      'node_modules/ui-lib/prod.js|argument',
    ])
  })

  it('control: in the development server phase the development file counts and the production file does not', async () => {
    vi.stubEnv('NODE_ENV', undefined)
    const app = projectWithProductionFile(RUN_TIME_ATOM, RUN_TIME_ATOM)
    expect(await problemsUnderPhase(app, 'phase-development-server')).toEqual([
      "node_modules/ui-lib/dev.js|argument|cx('grid', v)",
    ])
  })
})

describe('a file reached outside the mode and then inside it, and a listed module per mode', () => {
  it('a file both modes reach counts in production, whichever reaches it first', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = projectWithProductionFile(
      "export { Box } from './shared.js'\n",
      "import './shared.js'\nexport { Box } from './shared.js'\n",
    )
    app.install('ui-lib', { 'shared.js': RUN_TIME_ATOM })
    const { record } = await runAndRead(app)
    expect(record.problems.map((problem) => `${problem.file}|${problem.kind}`)).toEqual([
      'node_modules/ui-lib/shared.js|argument',
    ])
  })

  it('a listed module whose development file renames cx is a problem in development only', async () => {
    const app = project({
      'app/page.tsx':
        "import { cx } from 'ui-lib'\n\nexport default function Page() {\n  return <main className={cx('grid')} />\n}\n",
    })
    app.install('ui-lib', {
      'package.json': JSON.stringify({
        name: 'ui-lib',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { development: './dev.js', default: './prod.js' } },
        dependencies: { '@navecss/core': '*' },
      }),
      'prod.js': "export { cx } from '@navecss/core/cx'\n",
      'dev.js': "export { cx as classes } from '@navecss/core/cx'\n",
    })
    const options = { options: { cxModules: ['ui-lib'] } }
    vi.stubEnv('NODE_ENV', 'production')
    const production = await runAndRead(app, options)
    expect(production.record.problems).toEqual([])
    vi.stubEnv('NODE_ENV', 'development')
    const development = await runAndRead(app, options)
    expect(development.record.problems.map((problem) => `${problem.file}|${problem.kind}`)).toEqual(
      ['node_modules/ui-lib/dev.js|declared'],
    )
  })
})
