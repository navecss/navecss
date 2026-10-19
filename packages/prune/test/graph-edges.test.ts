/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- fixture sources are JSX text, whose braces are not template placeholders */
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import {
  moduleSource,
  runAndRead,
  scratchProjects,
  UNRESOLVED_TEXT,
} from './helpers/graph-fixture.ts'

const LAYOUT = `export default function Layout({ children }: { children: unknown }) {
  return <html><body>{children}</body></html>
}
`

/**
 * A page whose third line imports `specifier`, the layout every project here shares, and nothing
 * else: the import is the only thing a test varies.
 */
function pageImporting(specifier: string, name: string): string {
  return `import { cx } from '@navecss/core/cx'

import { ${name} } from '${specifier}'

export default function Page() {
  return <div className={cx('flex')}><${name} /></div>
}
`
}

describe('AC-nextjs-used-atoms-15: an unresolved specifier is a recorded problem', () => {
  const make = scratchProjects()

  it('AC-nextjs-used-atoms-15: the problem names the specifier with its quotes, at its opening quote', async () => {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': pageImporting('@/ui/card', 'Card'),
    })
    const { record } = await runAndRead(project)
    expect(record.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        construct: "'@/ui/card'",
        text: UNRESOLVED_TEXT,
        file: 'app/page.tsx',
        line: 3,
        column: 22,
      }),
    ])
  })

  it('AC-nextjs-used-atoms-15: the plugin still returns the trimmed layer', async () => {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': pageImporting('@/ui/card', 'Card'),
    })
    const { atoms } = await runAndRead(project)
    expect(atoms).toEqual(['flex'])
  })

  it('AC-nextjs-used-atoms-15: control, once the file exists there is no problem and its atom ships', async () => {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': pageImporting('@/ui/card', 'Card'),
      'ui/card.tsx': moduleSource('ui/card.tsx', ['wFull']).replace(
        'export default function Module',
        'export function Card',
      ),
    })
    const { atoms, record } = await runAndRead(project)
    expect(record.problems).toEqual([])
    expect(atoms).toEqual(['flex', 'wFull'])
  })
})

describe('AC-nextjs-used-atoms-15: a file the graph selects and cannot parse is a recorded problem', () => {
  const make = scratchProjects()

  /**
   * A project whose page imports `components/Broken.tsx`, holding `text`.
   */
  function withBroken(text: string): Project {
    return make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': pageImporting('@/components/Broken', 'Broken'),
      'components/Broken.tsx': text,
    })
  }

  it('AC-nextjs-used-atoms-15: the problem sits in the unparsable file', async () => {
    const { record } = await runAndRead(withBroken('export function Broken() {\n  return <div\n'))
    expect(record.problems).toHaveLength(1)
    const [problem] = record.problems
    expect(problem).toMatchObject({ kind: 'unreadable', file: 'components/Broken.tsx' })
    expect(problem!.line).toBeGreaterThanOrEqual(1)
    expect(problem!.column).toBeGreaterThanOrEqual(1)
  })

  it('AC-nextjs-used-atoms-15: the rest of the graph is still read and the layer trimmed', async () => {
    const { atoms } = await runAndRead(withBroken('export function Broken() {\n  return <div\n'))
    expect(atoms).toEqual(['flex'])
  })

  it('AC-nextjs-used-atoms-15: control, the same import of a parsable file records no problem', async () => {
    const source = moduleSource('components/Broken.tsx', ['wFull']).replace(
      'export default function Module',
      'export function Broken',
    )
    const { atoms, record } = await runAndRead(withBroken(source))
    expect(record.problems).toEqual([])
    expect(atoms).toEqual(['flex', 'wFull'])
  })
})

interface LeafRow {
  readonly row: string
  /**
   * Adds the row's files to the project: the component `components/Row.tsx` that the page
   * imports, and for the built-in row also the route handler `app/api/x/route.ts`.
   */
  readonly setup: (project: Project) => void
  /**
   * The atoms the layer holds when every file the row adds has been read.
   */
  readonly atoms: readonly string[]
}

const ROW_COMPONENT = (imports: string): string =>
  `${imports}import { cx } from '@navecss/core/cx'\n\nexport function Row() {\n  return <div className={cx('wFull')} />\n}\n`

const LEAF_ROWS: readonly LeafRow[] = [
  {
    row: 'builtin',
    setup: (project) => {
      project.write({
        'app/api/x/route.ts': `import fs from 'node:fs'
import path from 'path'
import { cx } from '@navecss/core/cx'

export function GET() {
  return Response.json({ fs: typeof fs, sep: path.sep, cls: cx('textLeft') })
}
`,
        'components/Row.tsx': ROW_COMPONENT(''),
      })
    },
    atoms: ['flex', 'textLeft', 'wFull'],
  },
  {
    row: 'package leaf',
    setup: (project) => {
      project.install('server-only', {
        'package.json': JSON.stringify({
          name: 'server-only',
          version: '0.0.1',
          exports: { '.': { 'react-server': './empty.js', default: './index.js' } },
        }),
        'empty.js': '',
        'index.js': "throw new Error('server only')\n",
      })
      project.write({ 'components/Row.tsx': ROW_COMPONENT("import 'server-only'\n") })
    },
    atoms: ['flex', 'wFull'],
  },
  {
    row: 'stylesheet',
    setup: (project) => {
      project.write({
        'components/x.css': '.x { color: red }\n',
        'components/Row.tsx': ROW_COMPONENT("import './x.css'\n"),
      })
    },
    atoms: ['flex', 'wFull'],
  },
  {
    row: 'image',
    setup: (project) => {
      project.write({
        'components/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" />\n',
        'components/Row.tsx': ROW_COMPONENT("import logo from './logo.svg'\n\nvoid logo\n"),
      })
    },
    atoms: ['flex', 'wFull'],
  },
  {
    row: 'JSON',
    setup: (project) => {
      project.write({
        'components/data.json': '{ "a": 1 }\n',
        'components/Row.tsx': ROW_COMPONENT("import data from './data.json'\n\nvoid data\n"),
      })
    },
    atoms: ['flex', 'wFull'],
  },
  {
    row: 'type-only',
    setup: (project) => {
      project.write({
        'components/types.d.ts': 'export interface T { a: number }\n',
        'components/Row.tsx': ROW_COMPONENT(
          "import type { T } from './types'\nexport type { T } from './types'\n\n",
        ),
      })
    },
    atoms: ['flex', 'wFull'],
  },
  {
    row: 'unrelated package',
    setup: (project) => {
      project.install('plain-x', {
        'package.json': JSON.stringify({ name: 'plain-x', version: '1.0.0', main: 'index.js' }),
        'index.js': "try { require('optional-x') } catch {}\n",
      })
      project.write({ 'components/Row.tsx': ROW_COMPONENT("import 'plain-x'\n") })
    },
    atoms: ['flex', 'wFull'],
  },
]

const PAGE_WITH_ROW = `import { cx } from '@navecss/core/cx'

import { Row } from '@/components/Row'

export default function Page() {
  return <div className={cx('flex')}><Row /></div>
}
`

describe('AC-nextjs-used-atoms-15: leaves and unrelated packages record no problem', () => {
  const make = scratchProjects()

  it.each(LEAF_ROWS)(
    'AC-nextjs-used-atoms-15: the $row row records no problem and its files are read',
    async ({ setup, atoms: expected }) => {
      const project = make({ 'app/layout.tsx': LAYOUT, 'app/page.tsx': PAGE_WITH_ROW })
      setup(project)
      const { atoms, record } = await runAndRead(project)
      expect(record.problems).toEqual([])
      expect(atoms).toEqual(expected)
    },
  )
})

describe('AC-nextjs-used-atoms-15: an unresolved specifier inside a package that carries cx calls is a problem', () => {
  const make = scratchProjects()
  const OPTIONAL = "try { require('optional-x') } catch {}\n"

  /**
   * A project whose component imports `plain` after the page reads it.
   */
  function withPackage(name: string, dependencyKey: string, depends: string): Project {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': PAGE_WITH_ROW,
      'components/Row.tsx': ROW_COMPONENT(`import '${name}'\n`),
    })
    project.install(name, {
      'package.json': JSON.stringify({
        name,
        version: '1.0.0',
        main: 'index.js',
        [dependencyKey]: { [depends]: '*' },
      }),
      'index.js': OPTIONAL,
    })
    return project
  }

  it('AC-nextjs-used-atoms-15: a package that lists core records one problem in its own file', async () => {
    const project = withPackage('nave-x', 'dependencies', '@navecss/core')
    const { record } = await runAndRead(project)
    expect(record.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        construct: "'optional-x'",
        text: UNRESOLVED_TEXT,
        file: 'node_modules/nave-x/index.js',
        line: 1,
        column: 15,
      }),
    ])
  })

  it('AC-nextjs-used-atoms-15: a package that lists a cxModules package records one problem in its own file', async () => {
    const project = withPackage('shell-x', 'peerDependencies', '@acme/ds')
    project.install('@acme/ds', {
      'package.json': JSON.stringify({
        name: '@acme/ds',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        dependencies: { '@navecss/core': '*' },
      }),
      'index.js': "export { cx } from '@navecss/core/cx'\n",
    })
    const { record } = await runAndRead(project, { options: { cxModules: ['@acme/ds'] } })
    expect(record.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        construct: "'optional-x'",
        file: 'node_modules/shell-x/index.js',
        line: 1,
        column: 15,
      }),
    ])
  })

  it('AC-nextjs-used-atoms-15: control, the same package is plain when no cxModules option names its peer', async () => {
    const project = withPackage('shell-x', 'peerDependencies', '@acme/ds')
    const { atoms, record } = await runAndRead(project)
    expect(record.problems).toEqual([])
    expect(atoms).toEqual(['flex', 'wFull'])
  })
})
