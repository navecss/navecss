import type { LocatedProblem } from '@navecss/core/collect'

import { buildReport } from '@navecss/core/collect'
import { symlinkSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

/**
 * What the promise rejects with, or `undefined` when it resolves.
 */
async function failureOf(task: Promise<void>): Promise<unknown> {
  try {
    await task
  } catch (error) {
    return error
  }
}

const CX_IMPORT = "import { cx } from '@navecss/core/cx'"
const ALIAS_LINE_START = 'If Next.js resolves an import above through an alias set in next.config'

/**
 * A package whose only call is `cx(v)` on line 3, and that lists core in `dependencies`.
 */
function library(name: string, exported: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${CX_IMPORT}\n\nexport const ${exported} = (v) => cx(v)\n`,
  }
}

/**
 * A page whose first lines are `imports` and whose component renders nothing that calls `cx()`.
 */
function pageImporting(...imports: string[]): string {
  return `${imports.join('\n')}\n\nexport default function Page() {\n  return <div />\n}\n`
}

const PAGE_CALLING_PROP =
  `${CX_IMPORT}\n\nexport default function Page({ variant }: { variant: string }) {\n` +
  '  return <div className={cx(variant)} />\n}\n'

/**
 * A project with an application problem (`cx(variant)` in the page), two dependencies that each
 * have one, and, when `unresolved` lists specifiers, one import in the page for each.
 */
function projectWith(unresolved: readonly string[]): Project {
  const imports = unresolved.map((specifier, index) => `import { x${index} } from '${specifier}'`)
  const project = makeProject({
    'app/page.tsx': `${imports.join('\n')}\n${PAGE_CALLING_PROP}`,
    'app/dependencies.ts':
      "import { a } from 'aa-lib'\nimport { z } from 'zz-lib'\n\nexport { a, z }\n",
    'app/layout.tsx': pageImporting("import './dependencies'"),
  })
  project.install('zz-lib', library('zz-lib', 'z'))
  project.install('aa-lib', library('aa-lib', 'a'))
  return project
}

interface Printed {
  /**
   * The report, the one `console.error` call's text.
   */
  readonly text: string
  readonly problems: readonly LocatedProblem[]
  readonly thrown: unknown
}

/**
 * Builds the project (plugin, then CSS, then check) and returns the report the check printed.
 */
async function reportOf(project: Project): Promise<Printed> {
  const result = await runAtomic(project, [], { phase: 'phase-production-build' })
  writeBuildCss(project, result.css)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  error.mockClear()
  const thrown = await failureOf(checkBuild(hookMetadata(project), {}, {}))
  const text = error.mock.calls.map((call) => call.map(String).join(' ')).join('\n---\n')
  return { text, problems: recordOf(project).problems, thrown }
}

/**
 * The lines after the problem lines, for `count` problems all counted in the report's first
 * lines.
 */
function remedyOf(text: string, count: number): string[] {
  return text.split('\n').slice(1 + count)
}

/**
 * The remedy block of core's formatter for the same problems with `withNave()` as the home.
 */
function expectedRemedy(problems: readonly LocatedProblem[]): string[] {
  return remedyOf(buildReport(problems, [], 'withNave()'), problems.length)
}

/**
 * The remedy block without the alias line.
 */
function withoutAliasLine(lines: readonly string[]): string[] {
  return lines.filter((line) => !line.startsWith(ALIAS_LINE_START))
}

/**
 * The lines of the remedy block that are the alias line.
 */
function aliasLines(lines: readonly string[]): string[] {
  return lines.filter((line) => line.startsWith(ALIAS_LINE_START))
}

describe('AC-nextjs-used-atoms-28: the remedy block is the shared formatter block with withNave() as home', () => {
  it('AC-nextjs-used-atoms-28: control, the fixture holds an application problem, two dependency problems and the unresolved import', async () => {
    const project = projectWith(['@/ui/card'])
    await runAtomic(project, [], { phase: 'phase-production-build' })
    const { problems } = recordOf(project)
    expect(problems.map((problem) => problem.pkg)).toEqual([
      undefined,
      undefined,
      'aa-lib',
      'zz-lib',
    ])
    expect(problems.some((problem) => problem.construct === "'@/ui/card'")).toBe(true)
  })

  it('AC-nextjs-used-atoms-28: the block equals core block line for line, plus the one alias line', async () => {
    const { text, problems } = await reportOf(projectWith(['@/ui/card']))
    const printed = remedyOf(text, problems.length)
    expect(withoutAliasLine(printed)).toEqual(expectedRemedy(problems))
    expect(aliasLines(printed)).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-28: the alias line sits after the application lines and before the first package line', async () => {
    const { text, problems } = await reportOf(projectWith(['@/ui/card']))
    const printed = remedyOf(text, problems.length)
    const application = problems.filter((problem) => problem.pkg === undefined)
    const applicationLines = remedyOf(
      buildReport(application, [], 'withNave()'),
      application.length,
    )
    expect(applicationLines.length).toBeGreaterThan(0)
    expect(printed.findIndex((line) => line.startsWith(ALIAS_LINE_START))).toBe(
      applicationLines.length,
    )
    expect(printed[applicationLines.length + 1]).toMatch(/^aa-lib /u)
  })

  it('AC-nextjs-used-atoms-28: the alias line names all three places an alias can be set', async () => {
    const { text, problems } = await reportOf(projectWith(['@/ui/card']))
    const [line = ''] = aliasLines(remedyOf(text, problems.length))
    expect(line).toContain('turbopack.resolveAlias')
    expect(line).toContain('resolve.alias')
    expect(line).toContain('compilerOptions.paths')
    expect(line).toContain('tsconfig.json')
  })

  it('AC-nextjs-used-atoms-28: two unresolved imports still print the alias line once', async () => {
    const { text, problems } = await reportOf(projectWith(['@/ui/card', '@/ui/other']))
    expect(problems.filter((problem) => problem.construct.startsWith("'@/ui/"))).toHaveLength(2)
    const printed = remedyOf(text, problems.length)
    expect(aliasLines(printed)).toHaveLength(1)
    expect(withoutAliasLine(printed)).toEqual(expectedRemedy(problems))
  })

  it('AC-nextjs-used-atoms-28: with no unresolved import there is no alias line and the block equals core block', async () => {
    const { text, problems } = await reportOf(projectWith([]))
    expect(problems).toHaveLength(3)
    const printed = remedyOf(text, problems.length)
    expect(printed.length).toBeGreaterThan(0)
    expect(printed).toEqual(expectedRemedy(problems))
    expect(text).not.toContain('turbopack.resolveAlias')
  })

  it('AC-nextjs-used-atoms-28: with the application problems removed the block opens with the first package line', async () => {
    const project = makeProject({
      'app/page.tsx': pageImporting("import { a } from 'aa-lib'", "import { z } from 'zz-lib'"),
    })
    project.install('zz-lib', library('zz-lib', 'z'))
    project.install('aa-lib', library('aa-lib', 'a'))
    const { text, problems } = await reportOf(project)
    const printed = remedyOf(text, problems.length)
    expect(printed).toEqual(expectedRemedy(problems))
    expect(printed[0]).toMatch(/^aa-lib /u)
  })
})

describe('AC-nextjs-used-atoms-15: a file the parser cannot read is a positioned problem without the alias line', () => {
  it('AC-nextjs-used-atoms-15: the problem opens with the broken file and no alias line is printed', async () => {
    const project = makeProject({
      'app/page.tsx': pageImporting("import { Broken } from '@/components/Broken'"),
      'components/Broken.tsx': 'export function Broken() {\n  return <div\n',
    })
    const { text, problems, thrown } = await reportOf(project)
    expect(problems.map((problem) => problem.file)).toEqual(['components/Broken.tsx'])
    const [, problemLine = ''] = text.split('\n', 2)
    expect(problemLine).toMatch(/^components\/Broken\.tsx:\d+:\d+: /u)
    expect(aliasLines(text.split('\n'))).toEqual([])
    expect(thrown).toBeInstanceOf(Error)
  })
})

/**
 * A project installed the way pnpm lays it out: the package in the store, linked from `node_modules`.
 */
function pnpmProject(): Project {
  const project = makeProject({
    'app/page.tsx': pageImporting("import { t } from 'bad-lib'"),
  })
  const store = '.pnpm/bad-lib@1.0.0/node_modules/bad-lib'
  project.install(store, library('bad-lib', 't'))
  symlinkSync(store, path.join(project.dir, 'node_modules/bad-lib'), 'dir')
  return project
}

describe('AC-nextjs-used-atoms-18: a dependency problem is at its real path with the keepFor line for withNave()', () => {
  it('AC-nextjs-used-atoms-18: the problem line opens with the .pnpm real path and its line', async () => {
    const { text } = await reportOf(pnpmProject())
    const [, line = ''] = text.split('\n', 2)
    expect(line).toMatch(
      /^node_modules\/\.pnpm\/bad-lib@1\.0\.0\/node_modules\/bad-lib\/index\.js:3:\d+: /u,
    )
  })

  it('AC-nextjs-used-atoms-18: the remedy block equals core block and has the keepFor line naming withNave()', async () => {
    const { text, problems } = await reportOf(pnpmProject())
    const printed = remedyOf(text, problems.length)
    expect(printed).toEqual(expectedRemedy(problems))
    const line = printed.find((candidate) => candidate.startsWith('bad-lib ')) ?? ''
    expect(line).toContain("keepFor: { 'bad-lib': ['<atom>'] }")
    expect(line).toContain('withNave()')
    expect(line).toContain('not yours to change')
  })
})
