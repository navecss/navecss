/**
 * A record older than what it read: the check compares the files and directories the record lists,
 * and the options, with what is on disk now, and stops the build naming the first difference.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { HookConfig } from '../src/hook.ts'
import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const OPTIONS: NaveOptions = { keep: ['flex'] }
const CX = "import { cx } from '@navecss/core/cx'"
const FILES = {
  'app/page.tsx': `${CX}\nimport Card from '../components/Card'\nimport { look } from 'ok-lib'\n\nvoid look\n\nexport default function Page() {\n  return <div className={cx('flex')}><Card /></div>\n}\n`,
  'components/Card.tsx': `${CX}\n\nexport default function Card() {\n  return <div className={cx('block')} />\n}\n`,
  'README.md': '# app\n',
}
const OK_LIB = {
  'package.json': JSON.stringify({
    name: 'ok-lib',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dependencies: { '@navecss/core': '*' },
  }),
  'index.js': `${CX}\n\nexport const look = cx('gap')\n`,
}

interface Printed {
  readonly error: Error | undefined
  readonly errors: string[]
  readonly warnings: string[]
}

/**
 * One text per call: the arguments of the call joined.
 */
function linesOf(calls: readonly (readonly unknown[])[]): string[] {
  return calls.map((call) => call.map(String).join(' '))
}

/**
 * Runs the check and returns what it threw and what it printed.
 */
async function check(
  project: Project,
  options: NaveOptions = OPTIONS,
  distDir = '.next',
): Promise<Printed> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors.mockClear()
  warnings.mockClear()
  const config: HookConfig = {}
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project, distDir), options, config)
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}

/**
 * A project the plugin has run over, with the CSS it left written as the build's output.
 */
async function builtProject(distDir = '.next'): Promise<Project> {
  const project = makeProject(FILES)
  project.install('ok-lib', OK_LIB)
  const result = await runAtomic(project, [], { options: OPTIONS, distDir })
  writeBuildCss(project, result.css, { distDir })
  return project
}

/**
 * Edits a project file: `from` becomes `to`.
 */
function edit(project: Project, file: string, from: string, to: string): void {
  const target = path.join(project.dir, file)
  const text = readFileSync(target, 'utf8')
  if (!text.includes(from)) throw new Error(`${file} does not hold ${from}`)
  writeFileSync(target, text.split(from).join(to))
}

/**
 * Expects one message that names the difference, the cache to delete and the command to run again.
 */
function expectStale(printed: Printed, distDir = '.next'): string {
  expect(printed.error).toBeInstanceOf(Error)
  expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
  expect(printed.error?.stack).toBe(printed.error?.message)
  expect(printed.errors).toHaveLength(1)
  const [message = ''] = printed.errors
  expect(message).toContain(`${distDir}/cache`)
  expect(message).toContain('next build')
  expect(printed.warnings).toEqual([])
  return message
}

describe('AC-nextjs-used-atoms-31: a record older than the code it serves stops the build, naming the first difference', () => {
  it('AC-nextjs-used-atoms-31: control, with nothing changed the check passes and prints nothing', async () => {
    const project = await builtProject()
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
    // The record lists what the rows below change.
    expect(Object.keys(recordOf(project).files)).toEqual(
      expect.arrayContaining([
        'app/page.tsx',
        'components/Card.tsx',
        'node_modules/ok-lib/index.js',
      ]),
    )
    expect(Object.keys(recordOf(project).directories)).toContain('app/')
  })

  it('AC-nextjs-used-atoms-31: (a) a call added to app/page.tsx names app/page.tsx', async () => {
    const project = await builtProject()
    edit(project, 'app/page.tsx', "cx('flex')", "cx('flex', 'grid')")
    const message = expectStale(await check(project))
    expect(message).toContain('app/page.tsx')
  })

  it('AC-nextjs-used-atoms-31: (b) a new route names the directory app/, not a file', async () => {
    const project = await builtProject()
    mkdirSync(path.join(project.dir, 'app/new'))
    writeFileSync(path.join(project.dir, 'app/new/page.tsx'), "export default () => 'x'\n")
    const message = expectStale(await check(project))
    expect(message).toContain('app/')
    expect(message).not.toContain('app/page.tsx')
    expect(message).not.toContain('app/new')
  })

  it("AC-nextjs-used-atoms-31: (c) a change in a dependency the plugin read names the dependency's file", async () => {
    const project = await builtProject()
    edit(project, 'node_modules/ok-lib/index.js', "cx('gap')", "cx('hidden')")
    const message = expectStale(await check(project))
    expect(message).toContain('node_modules/ok-lib/index.js')
  })

  it('AC-nextjs-used-atoms-31: (d) other options name the withNave() options and no file', async () => {
    const project = await builtProject()
    const message = expectStale(await check(project, { keep: ['grid'] }))
    expect(message).toContain('withNave()')
    expect(message).toContain('options')
    for (const file of [
      'app/page.tsx',
      'components/Card.tsx',
      'postcss.config.mjs',
      'package.json',
    ]) {
      expect(message).not.toContain(file)
    }
  })

  it('AC-nextjs-used-atoms-31: (e) two files changed name app/page.tsx, which comes first, and not components/Card.tsx', async () => {
    const project = await builtProject()
    edit(project, 'components/Card.tsx', "cx('block')", "cx('block', 'grid')")
    edit(project, 'app/page.tsx', "cx('flex')", "cx('flex', 'grid')")
    const message = expectStale(await check(project))
    expect(message).toContain('app/page.tsx')
    expect(message).not.toContain('components/Card.tsx')
  })

  it('AC-nextjs-used-atoms-31: a directory sorts before the files in it, so a new route and a changed page name the directory', async () => {
    const project = await builtProject()
    mkdirSync(path.join(project.dir, 'app/new'))
    writeFileSync(path.join(project.dir, 'app/new/page.tsx'), "export default () => 'x'\n")
    edit(project, 'app/page.tsx', "cx('flex')", "cx('flex', 'grid')")
    const message = expectStale(await check(project))
    expect(message).not.toContain('app/page.tsx')
  })

  it('AC-nextjs-used-atoms-31: a file the record lists that was deleted is named', async () => {
    const project = await builtProject()
    rmSync(path.join(project.dir, 'components/Card.tsx'))
    const message = expectStale(await check(project))
    expect(message).toContain('components/Card.tsx')
  })
})

describe('AC-nextjs-used-atoms-31: the cache directory named follows distDir', () => {
  it('AC-nextjs-used-atoms-31: with distDir build the message names build/cache and not .next/cache', async () => {
    const project = await builtProject('build')
    expect(await check(project, OPTIONS, 'build')).toEqual({
      error: undefined,
      errors: [],
      warnings: [],
    })
    edit(project, 'app/page.tsx', "cx('flex')", "cx('flex', 'grid')")
    const message = expectStale(await check(project, OPTIONS, 'build'), 'build')
    expect(message).not.toContain('.next/cache')
  })
})

describe('AC-nextjs-used-atoms-06: a PostCSS config changed since the record names postcss.config.mjs', () => {
  it.each([
    ['swapped for the core entry', "export default { plugins: { '@navecss/core/postcss': {} } }\n"],
    ['with the entry removed', 'export default { plugins: {} }\n'],
  ])(
    'AC-nextjs-used-atoms-06: postcss.config.mjs %s is named, with the cache to delete',
    async (_name, text) => {
      const project = await builtProject()
      writeFileSync(path.join(project.dir, 'postcss.config.mjs'), text)
      const message = expectStale(await check(project))
      expect(message).toContain('postcss.config.mjs')
    },
  )
})

describe('AC-nextjs-used-atoms-32: the check never stops a build whose set is current', () => {
  it.each([
    ['no change', () => {}],
    [
      'README.md edited',
      (project: Project) => appendFileSync(path.join(project.dir, 'README.md'), 'more\n'),
    ],
    [
      'public/robots.txt added',
      (project: Project) => project.write({ 'public/robots.txt': 'User-agent: *\n' }),
    ],
    [
      'app/page.tsx touched with its content unchanged',
      (project: Project) => {
        const later = new Date(Date.now() + 60_000)
        utimesSync(path.join(project.dir, 'app/page.tsx'), later, later)
      },
    ],
    ['app/notes.txt added', (project: Project) => project.write({ 'app/notes.txt': 'notes\n' })],
  ])('AC-nextjs-used-atoms-32: %s passes and prints nothing', async (_name, change) => {
    const project = await builtProject()
    change(project)
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })
})
