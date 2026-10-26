/**
 * The root the plugin declares files within. Turbopack panics on a declared file outside its own
 * root, which is `outputFileTracingRoot`, else `turbopack.root`, else the workspace root Next.js
 * infers from the project directory. The plugin uses the same root for both bundlers, so a
 * workspace package above the app is declared and a file above the workspace is not, also after
 * webpack's callback ran.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import { registerIsolation } from './helpers/plugin-fixtures.ts'
import { freshPrunePlugin } from './helpers/plugin-run.ts'
import { ATOMIC_CSS, CORE_ROOT } from './helpers/project.ts'

registerIsolation()

const CX_LOOK = "import { cx } from '@navecss/core/cx'\n\nexport const look = cx('grid')\n"

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  scratch.length = 0
})

interface Monorepo {
  readonly top: string
  /**
   * The app, at `apps/web`.
   */
  readonly web: string
  /**
   * A directory beside the workspace, outside it.
   */
  readonly outside: string
}

/**
 * Writes `files` relative to `dir`.
 */
function writeIn(dir: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), text)
  }
}

/**
 * A repository whose app imports a module of `packages/ui` and, through a tsconfig path, a
 * module beside the repository, with `markers` (a workspace config and lockfile, or none) at its
 * top.
 */
function monorepo(markers: Record<string, string>): Monorepo {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-mono-'))
  const base = realpathSync(made)
  scratch.push(base)
  const top = path.join(base, 'repo')
  const web = path.join(top, 'apps/web')
  const outside = path.join(base, 'shared')
  writeIn(top, markers)
  writeIn(web, {
    'package.json': JSON.stringify({ name: 'web', private: true }),
    'next.config.mjs': 'export default {}\n',
    'postcss.config.mjs': "export default { plugins: { '@navecss/prune/postcss': {} } }\n",
    'tsconfig.json': JSON.stringify({
      compilerOptions: { jsx: 'preserve', paths: { '@ext/*': ['../../../shared/*'] } },
    }),
    'app/page.tsx': [
      "import { look } from '../../../packages/ui/look'",
      "import { far } from '@ext/far'",
      '',
      'export default function Page() {',
      '  return <div className={`${look} ${far}`} />',
      '}',
      '',
    ].join('\n'),
  })
  writeIn(top, { 'packages/ui/look.ts': CX_LOOK })
  writeIn(outside, { 'far.ts': CX_LOOK.replace('look', 'far') })
  mkdirSync(path.join(web, 'node_modules/@navecss'), { recursive: true })
  symlinkSync(CORE_ROOT, path.join(web, 'node_modules/@navecss/core'), 'dir')
  return { top, web, outside: path.join(outside, 'far.ts') }
}

const WORKSPACE = { 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n", 'pnpm-lock.yaml': '' }

/**
 * Loads `config` through `withNave()` as Next.js loads it from `cwd`, runs webpack's callback when
 * `webpackDir` is given, and runs the plugin over core's `atomic.css` in the PostCSS worker's
 * directory `cwd`. Returns the files the `dependency` messages name, relative to the top.
 */
async function declaredFrom(
  repo: Monorepo,
  config: object,
  run: { readonly webpackDir?: string } = {},
): Promise<string[]> {
  const previous = process.env[HANDOFF_VARIABLE]
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(repo.web)
  try {
    const wrapped = withNave(config) as { webpack: (c: unknown, x: { dir: string }) => unknown }
    if (run.webpackDir !== undefined) wrapped.webpack({}, { dir: run.webpackDir })
    const create = await freshPrunePlugin()
    const from = path.join(repo.web, 'node_modules/@navecss/core/dist/atomic.css')
    const result = await postcss([create()]).process(ATOMIC_CSS, { from })
    return result.messages
      .filter((message) => message.type === 'dependency')
      .map((message) => path.relative(repo.top, message.file as string))
      .toSorted((a, b) => a.localeCompare(b))
  } finally {
    cwd.mockRestore()
    if (previous === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = previous
  }
}

describe('the root the plugin declares files within', () => {
  it('is the workspace Next.js infers, so a workspace package above the app is declared', async () => {
    const repo = monorepo(WORKSPACE)
    const files = await declaredFrom(repo, {})
    expect(files).toContain('packages/ui/look.ts')
    expect(files).not.toContain(path.relative(repo.top, repo.outside))
  })

  it('is the project directory when nothing above it marks a workspace', async () => {
    const repo = monorepo({})
    const files = await declaredFrom(repo, {})
    expect(files).toContain('apps/web/app/page.tsx')
    expect(files).not.toContain('packages/ui/look.ts')
  })

  it('is turbopack.root when the config sets it', async () => {
    const repo = monorepo(WORKSPACE)
    const files = await declaredFrom(repo, { turbopack: { root: repo.web } })
    expect(files).toContain('apps/web/app/page.tsx')
    expect(files).not.toContain('packages/ui/look.ts')
  })

  it('is the directory NEXT_PRIVATE_OUTPUT_TRACE_ROOT names, as Next.js reads it', async () => {
    const repo = monorepo({})
    vi.stubEnv('NEXT_PRIVATE_OUTPUT_TRACE_ROOT', repo.top)
    const files = await declaredFrom(repo, {})
    expect(files).toContain('packages/ui/look.ts')
  })

  it('bounds the declarations once webpack ran the callback too: a file beside the workspace is not declared', async () => {
    const repo = monorepo(WORKSPACE)
    const files = await declaredFrom(repo, {}, { webpackDir: repo.web })
    expect(files).toContain('packages/ui/look.ts')
    expect(files).not.toContain(path.relative(repo.top, repo.outside))
  })

  it('is the configured root after webpack’s callback, as before it', async () => {
    const repo = monorepo(WORKSPACE)
    const files = await declaredFrom(
      repo,
      { turbopack: { root: repo.web } },
      { webpackDir: repo.web },
    )
    expect(files).toContain('apps/web/app/page.tsx')
    expect(files).not.toContain('packages/ui/look.ts')
  })
})
