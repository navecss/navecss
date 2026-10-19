/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- fixture sources are JSX text, whose braces are not template placeholders */
import type { AtomName } from '@navecss/core/atoms'

import { atoms as builtInAtoms } from '@navecss/core/atoms'
import { describe, expect, it } from 'vitest'

import {
  installNext,
  moduleSource,
  runAndRead,
  scratchProjects,
  sorted,
} from './helpers/graph-fixture.ts'
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
