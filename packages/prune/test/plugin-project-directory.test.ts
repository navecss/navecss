/**
 * Which directory the plugin reads as the project. `next build apps/web`, run from a repository's
 * top, loads `next.config` with the top as the working directory, so the wrapper hands over the
 * top. Turbopack runs PostCSS with the project directory as the working directory, and webpack
 * passes its project directory to the wrapper's `webpack` callback: either one is the directory
 * to read.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'

import type { Handoff } from '../src/handoff.ts'

import { encodeHandoff, HANDOFF_VARIABLE } from '../src/handoff.ts'
import { readRecord } from '../src/record.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { freshPrunePlugin } from './helpers/plugin-run.ts'
import { ATOMIC_CSS, createProject, type Project } from './helpers/project.ts'

registerIsolation()

const CX_LOOK = "import { cx } from '@navecss/core/cx'\n\nexport const look = cx('grid')\n"

const scratch: string[] = []
const startedIn = process.cwd()

afterEach(() => {
  process.chdir(startedIn)
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  scratch.length = 0
})

/**
 * A directory with no `next.config` in it, standing for the repository's top.
 */
function topDirectory(): string {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-top-'))
  const dir = realpathSync(made)
  scratch.push(dir)
  return dir
}

/**
 * Runs the plugin over core's `atomic.css` with `handoff` in the environment and the working
 * directory `cwd`, the way the bundler's PostCSS worker runs it.
 */
async function runIn(cwd: string, project: Project, handoff: Handoff): Promise<postcss.Result> {
  const create = await freshPrunePlugin()
  const previous = process.env[HANDOFF_VARIABLE]
  process.env[HANDOFF_VARIABLE] = encodeHandoff(handoff)
  process.chdir(cwd)
  try {
    const from = path.join(project.dir, 'node_modules/@navecss/core/dist/atomic.css')
    return await postcss([create()]).process(ATOMIC_CSS, { from })
  } finally {
    process.chdir(startedIn)
    if (previous === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = previous
  }
}

/**
 * The hand-off `withNave()` leaves at config load when `next` was started in `dir`.
 */
function loadedIn(dir: string): Handoff {
  return { options: {}, dir, distDir: '.next', root: dir }
}

/**
 * The files the plugin's messages name, relative to the project directory.
 */
function declaredFiles(result: postcss.Result, project: Project): string[] {
  return result.messages
    .filter((message) => message.type === 'dependency')
    .map((message) => path.relative(project.dir, message.file as string))
    .toSorted((a, b) => a.localeCompare(b))
}

describe('the project directory, when next was started in a directory above the project', () => {
  it('is the working directory the bundler runs PostCSS in, when it holds a next.config', async () => {
    const top = topDirectory()
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    await runIn(project.dir, project, loadedIn(top))
    expect(readRecord({ dir: project.dir, distDir: '.next' })?.atoms ?? []).toContain('grid')
    expect(existsSync(path.join(top, '.next'))).toBe(false)
  })

  it('is the hand-off directory when the working directory holds no next.config', async () => {
    const top = topDirectory()
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    await runIn(top, project, loadedIn(project.dir))
    expect(readRecord({ dir: project.dir, distDir: '.next' })?.atoms ?? []).toContain('grid')
    expect(existsSync(path.join(top, '.next'))).toBe(false)
  })

  it("is webpack's project directory when the webpack callback passed it on, whatever the working directory holds", async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const other = makeProject({ 'app/page.tsx': pageCalling("'block'") })
    await runIn(other.dir, project, { ...loadedIn(project.dir), isBundlerDir: true })
    expect(readRecord({ dir: project.dir, distDir: '.next' })?.atoms ?? []).toContain('grid')
    expect(existsSync(path.join(other.dir, '.next'))).toBe(false)
  })

  it('declares the files it read when the hand-off root does not hold the project directory', async () => {
    const top = topDirectory()
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const result = await runIn(project.dir, project, loadedIn(top))
    // `app/package.json` is not there: creating it would change which `package.json` governs the page.
    expect(declaredFiles(result, project)).toEqual([
      'app/package.json',
      'app/page.tsx',
      'next.config.ts',
      'package.json',
      'postcss.config.mjs',
      'tsconfig.json',
    ])
  })

  it('keeps a hand-off root that holds the project directory, so a file above the project is declared', async () => {
    const project = createProject(
      {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { jsx: 'preserve', paths: { '@ext/*': ['../shared/*'] } },
        }),
        'app/page.tsx':
          "import { look } from '@ext/look'\n\nexport default function Page() {\n  return <div className={look} />\n}\n",
      },
      'web',
    )
    const top = path.dirname(project.dir)
    scratch.push(top)
    mkdirSync(path.join(top, 'shared'))
    writeFileSync(path.join(top, 'shared/look.ts'), CX_LOOK)
    const result = await runIn(project.dir, project, { ...loadedIn(top), root: top })
    expect(declaredFiles(result, project)).toContain('../shared/look.ts')
    // Control: with the project directory as the root, the same file is not declared.
    const narrow = await runIn(project.dir, project, loadedIn(project.dir))
    expect(declaredFiles(narrow, project)).not.toContain('../shared/look.ts')
    expect(declaredFiles(narrow, project)).toContain('app/page.tsx')
  })
})
