import { navePlugin } from '@navecss/core/postcss'
import { describe, expect, it, vi } from 'vitest'

import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import {
  makeProject,
  PAGE_WITH_PROP,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const DEV = 'phase-development-server'
const BUILD = 'phase-production-build'

const MARKDOWN_PAGE = `import { cx } from '@navecss/core/cx'
import Note from '@/components/Note.mdx'
import Read from '@/components/Read.md'

void Note
void Read

export default function Page() {
  return <div className={cx('flex')} />
}
`

/**
 * Starts recording what the code prints through any console method, one entry per call.
 */
function watchPrinted(): () => string[] {
  const printed: string[] = []
  for (const kind of ['error', 'log', 'warn'] as const) {
    vi.spyOn(console, kind).mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '))
    })
  }
  return () => [...printed]
}

/**
 * The sheet, preceded by writing `files` to the project: an edit between two runs of one plugin
 * instance.
 */
function afterWriting(project: Project, files: Record<string, string>, sheet: Sheet): Sheet {
  return {
    file: sheet.file,
    get css() {
      project.write(files)
      return sheet.css
    },
  }
}

function markdownProject(): Project {
  return makeProject({
    'app/page.tsx': MARKDOWN_PAGE,
    'app/docs/page.mdx': '# Docs\n',
    'components/Note.mdx': '# Note\n',
    'components/Read.md': '# Read\n',
  })
}

function naming(lines: readonly string[], text: string): string[] {
  return lines.filter((line) => line.includes(text))
}

describe('AC-nextjs-used-atoms-26: in dev the line naming @navecss/core/postcss prints once per dev server life', () => {
  const CORE_ENTRY = '@navecss/core/postcss'

  it('AC-nextjs-used-atoms-26: with the phase "development" several runs print one line naming it', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET, ATOMIC_SHEET], {
      phase: DEV,
      before: [navePlugin()],
    })
    expect(naming(printed(), CORE_ENTRY)).toHaveLength(1)
    expect(recordOf(project).hasCorePlugin).toBe(true)
  })

  it('AC-nextjs-used-atoms-26: the same holds with core listed after the Nave plugin', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { phase: DEV, after: [navePlugin()] })
    expect(naming(printed(), CORE_ENTRY)).toHaveLength(1)
    expect(recordOf(project).hasCorePlugin).toBe(true)
  })

  it('AC-nextjs-used-atoms-26: with no phase, NODE_ENV "development" prints it once across runs', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { before: [navePlugin()] })
    expect(naming(printed(), CORE_ENTRY)).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-26: in a production-build phase nothing names it, as the build check fails instead', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { phase: BUILD, before: [navePlugin()] })
    expect(naming(printed(), CORE_ENTRY)).toEqual([])
    // Control: the record holds the case the build check reads, and dev prints the line.
    expect(recordOf(project).hasCorePlugin).toBe(true)
    await runSheets(project, [ATOMIC_SHEET], { phase: DEV, before: [navePlugin()] })
    expect(naming(printed(), CORE_ENTRY)).toHaveLength(1)
  })

  it.each(['production', undefined])(
    'AC-nextjs-used-atoms-26: with no phase and NODE_ENV %s nothing names it',
    async (value) => {
      vi.stubEnv('NODE_ENV', value)
      const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
      const printed = watchPrinted()
      await runSheets(project, [ATOMIC_SHEET], { before: [navePlugin()] })
      expect(naming(printed(), CORE_ENTRY)).toEqual([])
      expect(recordOf(project).hasCorePlugin).toBe(true)
    },
  )
})

describe('AC-nextjs-used-atoms-16: in dev the plugin prints the Markdown warning once per dev server life', () => {
  const FILES = ['app/docs/page.mdx', 'components/Note.mdx', 'components/Read.md']

  it('AC-nextjs-used-atoms-16: one warning lists the files sorted and root-relative, and no other file', async () => {
    const project = markdownProject()
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { phase: DEV })
    const warnings = naming(printed(), 'Note.mdx')
    expect(warnings).toHaveLength(1)
    const places = FILES.map((file) => warnings[0]!.indexOf(file))
    expect(places.every((place) => place >= 0)).toBe(true)
    expect(places).toEqual(places.toSorted((a, b) => a - b))
    expect(warnings[0]).not.toContain('app/page.tsx')
    expect(recordOf(project).markdown).toEqual(FILES)
  })

  it('AC-nextjs-used-atoms-16: a later run with the same list prints nothing more', async () => {
    const project = markdownProject()
    const printed = watchPrinted()
    const edit = afterWriting(
      project,
      { 'app/page.tsx': `${MARKDOWN_PAGE}\n// edited\n` },
      ATOMIC_SHEET,
    )
    await runSheets(project, [ATOMIC_SHEET, edit, ATOMIC_SHEET], { phase: DEV })
    expect(naming(printed(), 'Read.md')).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-16: a different list prints the warning again', async () => {
    const project = markdownProject()
    const printed = watchPrinted()
    const more = afterWriting(
      project,
      {
        'app/page.tsx': MARKDOWN_PAGE.replace(
          'import Read',
          "import Extra from '@/components/Extra.md'\nimport Read",
        ),
        'components/Extra.md': '# Extra\n',
      },
      ATOMIC_SHEET,
    )
    await runSheets(project, [ATOMIC_SHEET, more], { phase: DEV })
    const warnings = naming(printed(), 'Read.md')
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).not.toContain('Extra.md')
    expect(warnings[1]).toContain('components/Extra.md')
  })

  it('AC-nextjs-used-atoms-16: with the phase "production build" the plugin prints no such warning', async () => {
    const project = markdownProject()
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { phase: BUILD })
    expect(naming(printed(), 'Note.mdx')).toEqual([])
    // Control: the record holds the files the build check lists, and dev prints the warning.
    expect(recordOf(project).markdown).toEqual(FILES)
    await runSheets(project, [ATOMIC_SHEET], { phase: DEV })
    expect(naming(printed(), 'Note.mdx')).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-16: a project with no Markdown file prints no such warning in dev', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET], { phase: DEV })
    expect(printed()).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-24: without the wrapper the line is printed once per dev server life', () => {
  const NOTICE = 'withNave()'

  it('AC-nextjs-used-atoms-24: two edits that re-run the plugin in dev print nothing more', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = watchPrinted()
    const first = afterWriting(
      project,
      { 'app/page.tsx': `${PAGE_WITH_PROP}// one\n` },
      ATOMIC_SHEET,
    )
    const second = afterWriting(
      project,
      { 'app/page.tsx': `${PAGE_WITH_PROP}// two\n` },
      ATOMIC_SHEET,
    )
    await runSheets(project, [ATOMIC_SHEET, first, second], { options: false })
    expect(printed()).toHaveLength(1)
    expect(printed()[0]).toContain(NOTICE)
    expect(printed()[0]).toContain('@navecss/prune')
  })

  it('AC-nextjs-used-atoms-24: in dev no report is printed, because no cx() call is read', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET], { options: false })
    expect(naming(printed(), 'app/page.tsx')).toEqual([])
    expect(naming(printed(), 'problem')).toEqual([])
    // Control: with the wrapper the same dev run prints the report of the page's problem.
    await runSheets(project, [ATOMIC_SHEET], { phase: DEV })
    expect(naming(printed(), 'app/page.tsx:4:')).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-24: a new dev server life prints the line again', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = watchPrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { options: false })
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET], { options: false })
    expect(naming(printed(), NOTICE)).toHaveLength(2)
  })
})
