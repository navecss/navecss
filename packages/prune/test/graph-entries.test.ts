/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- fixture sources are JSX text, whose braces are not template placeholders */
import type { AtomName } from '@navecss/core/atoms'

import { atoms as builtInAtoms } from '@navecss/core/atoms'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { writeBuildCss } from './helpers/build-output.ts'
import {
  installNext,
  moduleSource,
  runAndRead,
  scratchProjects,
  sorted,
} from './helpers/graph-fixture.ts'
import { runCheck } from './helpers/hook-run.ts'
import { atomsIn } from './helpers/layer.ts'
import { ATOMIC_CSS } from './helpers/project.ts'

interface EntryRow {
  readonly entry: string
  readonly file: string
  readonly atom: AtomName
  /**
   * Whether the file moves under `src/` when the project keeps its code there.
   */
  readonly moves: boolean
}

const ROWS: readonly EntryRow[] = [
  { entry: 'page', file: 'app/p/page.tsx', atom: 'flexCol', moves: true },
  { entry: 'layout', file: 'app/p/layout.tsx', atom: 'flexWrap', moves: true },
  { entry: 'template', file: 'app/p/template.tsx', atom: 'itemsStart', moves: true },
  { entry: 'loading', file: 'app/p/loading.tsx', atom: 'itemsEnd', moves: true },
  { entry: 'error', file: 'app/p/error.tsx', atom: 'justifyCenter', moves: true },
  { entry: 'global-error', file: 'app/global-error.tsx', atom: 'justifyEnd', moves: true },
  { entry: 'not-found', file: 'app/not-found.tsx', atom: 'relative', moves: true },
  { entry: 'global-not-found', file: 'app/global-not-found.tsx', atom: 'absolute', moves: true },
  { entry: 'forbidden', file: 'app/forbidden.tsx', atom: 'insetFull', moves: true },
  { entry: 'unauthorized', file: 'app/unauthorized.tsx', atom: 'wFull', moves: true },
  { entry: 'default', file: 'app/@slot/default.tsx', atom: 'hFull', moves: true },
  { entry: 'route', file: 'app/api/x/route.ts', atom: 'textLeft', moves: true },
  { entry: 'mdx-components', file: 'mdx-components.tsx', atom: 'noWrap', moves: true },
  { entry: 'proxy', file: 'proxy.ts', atom: 'container', moves: true },
  { entry: 'instrumentation', file: 'instrumentation.ts', atom: 'inlineFlex', moves: true },
  {
    entry: 'instrumentation-client',
    file: 'instrumentation-client.ts',
    atom: 'inlineBlock',
    moves: true,
  },
  {
    entry: 'next/dynamic target',
    file: 'components/Lazy.tsx',
    atom: 'justifyBetween',
    moves: false,
  },
]

const LAYOUT = `export default function Layout({ children }: { children: unknown }) {
  return <html><body>{children}</body></html>
}
`

const PAGE = `import dynamic from 'next/dynamic'
import { cx } from '@navecss/core/cx'

const Lazy = dynamic(() => import('@/components/Lazy'))

export default function Page() {
  return <div className={cx('flex')}><Lazy /></div>
}
`

/**
 * Where a row's file sits in a project that keeps its code under `src/` or at the root.
 */
function locate(row: EntryRow, isUnderSrc: boolean): string {
  return isUnderSrc && row.moves ? `src/${row.file}` : row.file
}

/**
 * The project's files: the root layout and page, the orphan and one file per row.
 */
function entryFiles(isUnderSrc: boolean, rows: readonly EntryRow[]): Record<string, string> {
  const base = isUnderSrc ? 'src/app' : 'app'
  const files: Record<string, string> = {
    [`${base}/layout.tsx`]: LAYOUT,
    [`${base}/page.tsx`]: PAGE,
    'components/Orphan.tsx': moduleSource('components/Orphan.tsx', ['block']),
  }
  for (const row of rows) files[locate(row, isUnderSrc)] = moduleSource(row.file, [row.atom])
  return files
}

/**
 * The atoms the layer must hold for these rows: the page's own `flex` and each row's atom.
 */
function expectedFor(rows: readonly EntryRow[]): string[] {
  return sorted(['flex', ...rows.map((row) => row.atom)])
}

describe.each([
  { variant: 'app/', isUnderSrc: false },
  { variant: 'src/app/', isUnderSrc: true },
])('AC-nextjs-used-atoms-13: every entry convention is read under $variant', ({ isUnderSrc }) => {
  const make = scratchProjects()

  /**
   * A project with one file per row, the orphan and a stand-in for the `next` package.
   */
  function build(rows: readonly EntryRow[]): ReturnType<typeof make> {
    const project = make(entryFiles(isUnderSrc, rows))
    installNext(project)
    return project
  }

  it('AC-nextjs-used-atoms-13: the layer holds exactly flex and each row atom', async () => {
    const { atoms, record } = await runAndRead(build(ROWS))
    expect(atoms).toEqual(expectedFor(ROWS))
    expect(record.atoms).toEqual(expectedFor(ROWS))
  })

  it('AC-nextjs-used-atoms-13: the orphan that nothing imports is not read', async () => {
    const { atoms, record } = await runAndRead(build(ROWS))
    expect(atoms).not.toContain('block')
    expect(Object.keys(record.files)).not.toContain('components/Orphan.tsx')
    expect(Object.keys(record.files)).toContain(locate(ROWS[0]!, isUnderSrc))
  })

  it('AC-nextjs-used-atoms-13: control, the orphan ships once a page imports it', async () => {
    const project = build(ROWS)
    const base = isUnderSrc ? 'src/app' : 'app'
    project.write({
      [`${base}/page.tsx`]: `import Orphan from '@/components/Orphan'\n${PAGE}\nexport { Orphan }\n`,
    })
    const { atoms } = await runAndRead(project)
    expect(atoms).toEqual(sorted([...expectedFor(ROWS), 'block']))
  })

  it('AC-nextjs-used-atoms-13: control, block is a rule the unpruned layer holds', () => {
    expect(atomsIn(ATOMIC_CSS)).toContain('block')
    expect(Object.keys(builtInAtoms)).toContain('block')
  })

  it.each(ROWS)(
    'AC-nextjs-used-atoms-13: control, the $entry atom is absent when its file is removed',
    async (row) => {
      const others = ROWS.filter((other) => other !== row)
      const { atoms } = await runAndRead(build(others))
      expect(atoms).toEqual(expectedFor(others))
      expect(atoms).not.toContain(row.atom)
    },
  )

  it.each(ROWS)(
    'AC-nextjs-used-atoms-13: the $entry file is recorded as read, by its relative path',
    async (row) => {
      const { record } = await runAndRead(build(ROWS))
      expect(Object.keys(record.files)).toContain(locate(row, isUnderSrc))
    },
  )
})

/**
 * `file` with `.page` before its last extension: `app/p/page.tsx` becomes `app/p/page.page.tsx`.
 */
function withPageSuffix(file: string): string {
  const dot = file.lastIndexOf('.')
  return `${file.slice(0, dot)}.page${file.slice(dot)}`
}

const PAGE_EXTENSIONS = ['page.tsx', 'page.ts']

/**
 * The convention files of ROWS, and the root layout and page, all written with the `.page`
 * extension a project that sets `pageExtensions: ['page.tsx', 'page.ts']` uses.
 */
function pageSuffixed(isUnderSrc: boolean, rows: readonly EntryRow[]): Record<string, string> {
  const base = isUnderSrc ? 'src/app' : 'app'
  const files: Record<string, string> = {
    [withPageSuffix(`${base}/layout.tsx`)]: LAYOUT,
    [withPageSuffix(`${base}/page.tsx`)]: PAGE,
  }
  for (const row of rows) {
    const file = locate(row, isUnderSrc)
    files[row.moves ? withPageSuffix(file) : file] = moduleSource(row.file, [row.atom])
  }
  return files
}

describe.each([
  { variant: 'app/', isUnderSrc: false },
  { variant: 'src/app/', isUnderSrc: true },
])(
  'AC-nextjs-used-atoms-13: every convention is read with the pageExtensions extension under $variant',
  ({ isUnderSrc }) => {
    const make = scratchProjects()

    /**
     * A project whose convention files all carry `.page` before the extension.
     */
    function build(rows: readonly EntryRow[]): ReturnType<typeof make> {
      const project = make(pageSuffixed(isUnderSrc, rows))
      installNext(project)
      return project
    }

    it('AC-nextjs-used-atoms-13: the layer holds exactly flex and each row atom', async () => {
      const { atoms, record } = await runAndRead(build(ROWS), {
        pageExtensions: PAGE_EXTENSIONS,
      })
      expect(atoms).toEqual(expectedFor(ROWS))
      expect(record.atoms).toEqual(expectedFor(ROWS))
    })

    it.each(ROWS.filter((row) => row.moves))(
      'AC-nextjs-used-atoms-13: control, the $entry atom is absent when its file is removed',
      async (row) => {
        const others = ROWS.filter((other) => other !== row)
        const { atoms } = await runAndRead(build(others), { pageExtensions: PAGE_EXTENSIONS })
        expect(atoms).toEqual(expectedFor(others))
        expect(atoms).not.toContain(row.atom)
      },
    )

    it('AC-nextjs-used-atoms-13: control, without the extension in pageExtensions the files are not entries', async () => {
      const { atoms } = await runAndRead(build(ROWS), { pageExtensions: ['tsx', 'ts'] })
      expect(atoms).toEqual([])
    })
  },
)

describe('AC-nextjs-used-atoms-13: pageExtensions in the spec’s row and for the page shell', () => {
  const make = scratchProjects()

  /**
   * A project with a page and a nested page written with `.page.tsx`, beside a layout.
   */
  function project(layout = 'layout.page.tsx'): ReturnType<typeof make> {
    const made = make({
      [`app/${layout}`]: moduleSource('app/layout.tsx', ['srOnlyFocusable']),
      'app/page.page.tsx': moduleSource('app/page.tsx', ['flex']),
      'app/q/page.page.tsx': moduleSource('app/q/page.tsx', ['grid']),
    })
    installNext(made)
    return made
  }

  it('AC-nextjs-used-atoms-13: app/q/page.page.tsx with pageExtensions page.tsx, tsx and ts puts grid in the layer', async () => {
    const { atoms } = await runAndRead(project(), { pageExtensions: ['page.tsx', 'tsx', 'ts'] })
    expect(atoms).toContain('grid')
    expect(atoms).toContain('flex')
  })

  it('AC-nextjs-used-atoms-13: control, with the file removed grid is not in the layer', async () => {
    const made = project()
    rmSync(path.join(made.dir, 'app/q/page.page.tsx'))
    const { atoms } = await runAndRead(made, { pageExtensions: ['page.tsx', 'tsx', 'ts'] })
    expect(atoms).not.toContain('grid')
  })

  it('AC-nextjs-used-atoms-13: control, with page.tsx left out of pageExtensions grid is not in the layer', async () => {
    const { atoms } = await runAndRead(project(), { pageExtensions: ['tsx', 'ts'] })
    expect(atoms).not.toContain('grid')
  })

  it('reads the layout that holds the skip link, so its atom ships', async () => {
    const { atoms } = await runAndRead(project(), { pageExtensions: ['page.tsx', 'tsx', 'ts'] })
    expect(atoms).toContain('srOnlyFocusable')
  })

  it('control: with page.tsx left out of pageExtensions the layout is not read', async () => {
    const { atoms } = await runAndRead(project(), { pageExtensions: ['tsx', 'ts'] })
    expect(atoms).not.toContain('srOnlyFocusable')
  })

  it('reads an extension of Markdown the way it reads a file of that kind: named, not parsed', async () => {
    const made = project()
    made.write({ 'app/notes/page.mdx': '# Notes\n' })
    const { record } = await runAndRead(made, { pageExtensions: ['page.tsx', 'tsx', 'mdx'] })
    expect(record.markdown).toEqual(['app/notes/page.mdx'])
  })
})

describe('AC-nextjs-used-atoms-13: what the bundler is told to watch with pageExtensions', () => {
  const make = scratchProjects()

  /**
   * The patterns declared for the directory holding `next.config`, from a run with `pageExtensions`.
   */
  async function rootGlobs(pageExtensions?: readonly string[]): Promise<string[]> {
    const made = make({ 'app/page.tsx': moduleSource('app/page.tsx', ['flex']) })
    installNext(made)
    const { result } = await runAndRead(made, { ...(pageExtensions && { pageExtensions }) })
    return result.messages.flatMap((message) =>
      message.type === 'dir-dependency' && message.dir === made.dir ? [String(message.glob)] : [],
    )
  }

  it('keeps the pattern of the default extensions when the config sets none', async () => {
    expect(await rootGlobs()).toEqual([
      '{instrumentation,instrumentation-client,mdx-components,proxy}.{cjs,cts,js,jsx,mjs,mts,ts,tsx}',
    ])
  })

  it('adds the extensions the config sets to the pattern for the root conventions', async () => {
    const [glob] = await rootGlobs(['page.tsx', 'tsx'])
    expect(glob).toContain('page.tsx')
    expect(glob).toContain('mjs')
  })

  it('the build check sees a new convention file with the configured extension', async () => {
    const made = make({
      'app/layout.page.tsx': moduleSource('app/layout.tsx', ['srOnlyFocusable']),
      'app/page.page.tsx': moduleSource('app/page.tsx', ['flex']),
      'app/q/page.page.tsx': moduleSource('app/q/page.tsx', ['grid']),
    })
    installNext(made)
    const config = { pageExtensions: ['page.tsx'] }
    const { result } = await runAndRead(made, config)
    writeBuildCss(made, result.css)
    made.write({ 'app/q/loading.page.tsx': moduleSource('app/q/loading.tsx', ['block']) })

    const printed = await runCheck(made, {}, config)

    expect(printed.error?.message).toMatch(/Nave stopped the build/u)
    expect(printed.errors.join('\n')).toContain('app/q/')
  })
})
