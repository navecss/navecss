/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- fixture sources are JSX text, whose braces are not template placeholders */
import { rmSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  installNext,
  moduleSource,
  runAndRead,
  scratchProjects,
  UNRESOLVED_TEXT,
} from './helpers/graph-fixture.ts'

const LAYOUT = `export default function Layout({ children }: { children: unknown }) {
  return <html><body>{children}</body></html>
}
`

const PAGE = `import { cx } from '@navecss/core/cx'
import { Card } from '@/components/Card'
import { ClientPart } from '@/components/ClientPart'
import { marker } from 'fake-lib'
import { minMarker } from 'fake-lib-min'

export default function Page() {
  return (
    <div className={cx('flex')}>
      {marker}
      {minMarker}
      <Card />
      <ClientPart />
    </div>
  )
}
`

const CLIENT_PART = `'use client'
import { marker } from 'fake-lib'

export function ClientPart() {
  return <span>{marker}</span>
}
`

const CORE_DEPENDENCY = { '@navecss/core': '*' }

/**
 * The package manifest of a small ESM package that depends on core.
 */
function manifest(name: string, exportsMap: object): string {
  return JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    dependencies: CORE_DEPENDENCY,
    exports: exportsMap,
  })
}

const FAKE_LIB = {
  'package.json': manifest('fake-lib', {
    '.': { 'react-server': './server.js', default: './index.js' },
  }),
  'server.js': "import { cx } from '@navecss/core/cx'\nexport const marker = cx('wFull')\n",
  'index.js': "import { cx } from '@navecss/core/cx'\nexport const marker = cx('hFull')\n",
}

// As a bundler minifies it: `cx` renamed to `e`, and `e` reused as an inner parameter.
const FAKE_LIB_MIN = {
  'package.json': manifest('fake-lib-min', { '.': './index.js' }),
  'index.js':
    'import{cx as e}from"@navecss/core/cx";const t=e=>e("grid");export const minMarker=[e("justifyBetween","textLeft"),t];\n',
  'src.js': "import { cx } from '@navecss/core/cx'\nexport const v = (name) => cx(name)\n",
}

describe('AC-nextjs-used-atoms-14: the graph resolves as Next.js does', () => {
  const make = scratchProjects()

  /**
   * The fixture: a page using `tsconfig` paths and both packages, and a client component.
   */
  function build(): ReturnType<typeof make> {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': PAGE,
      'components/Card.tsx': moduleSource('components/Card.tsx', ['rounded']),
      'components/ClientPart.tsx': CLIENT_PART,
    })
    installNext(project)
    project.install('fake-lib', FAKE_LIB)
    project.install('fake-lib-min', FAKE_LIB_MIN)
    return project
  }

  it('AC-nextjs-used-atoms-14: paths, conditions and the minified package give exactly these atoms', async () => {
    const { atoms, record } = await runAndRead(build())
    expect(atoms).toEqual(['flex', 'hFull', 'justifyBetween', 'rounded', 'textLeft', 'wFull'])
    expect(record.problems).toEqual([])
  })

  it('AC-nextjs-used-atoms-14: a server component and a client component importing a package read both its conditions', async () => {
    const { record } = await runAndRead(build())
    const files = Object.keys(record.files)
    expect(files).toContain('node_modules/fake-lib/server.js')
    expect(files).toContain('node_modules/fake-lib/index.js')
  })

  it('AC-nextjs-used-atoms-14: the file a package does not export is not read and no report names it', async () => {
    const { record } = await runAndRead(build())
    expect(JSON.stringify(record)).not.toContain('src.js')
  })

  it('AC-nextjs-used-atoms-14: control, a package that exports that file is read and reported', async () => {
    const project = build()
    project.install('fake-lib-min', {
      'package.json': manifest('fake-lib-min', { '.': './src.js' }),
    })
    const { record } = await runAndRead(project)
    expect(record.problems.map((problem) => problem.file)).toContain(
      'node_modules/fake-lib-min/src.js',
    )
  })

  it('AC-nextjs-used-atoms-14: control, without importing the packages neither of their atoms ships', async () => {
    const project = build()
    project.write({
      'app/page.tsx': `import { cx } from '@navecss/core/cx'\nimport { Card } from '@/components/Card'\n\nexport default function Page() {\n  return <div className={cx('flex')}><Card /></div>\n}\n`,
    })
    const { atoms } = await runAndRead(project)
    expect(atoms).not.toContain('wFull')
    expect(atoms).not.toContain('hFull')
    expect(atoms).not.toContain('justifyBetween')
    expect(atoms).toContain('rounded')
  })

  it('AC-nextjs-used-atoms-14: the read of a shadowed cx name is not a cx call', async () => {
    const { atoms } = await runAndRead(build())
    expect(atoms).not.toContain('grid')
    expect(atoms).toContain('justifyBetween')
  })
})

describe('AC-nextjs-used-atoms-14: paths set in jsconfig.json alone', () => {
  const make = scratchProjects()

  /**
   * A JavaScript-only project: `jsconfig.json` holds the paths and there is no `tsconfig.json`.
   */
  function buildJavaScript(): ReturnType<typeof make> {
    const project = make({
      'jsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } },
      }),
      'app/layout.jsx':
        'export default function Layout({ children }) {\n  return <html><body>{children}</body></html>\n}\n',
      'app/page.jsx': `import { cx } from '@navecss/core/cx'\nimport Card from '@/components/Card'\n\nexport default function Page() {\n  return <div className={cx('flex')}><Card /></div>\n}\n`,
      'components/Card.jsx': moduleSource('components/Card.jsx', ['grid']),
    })
    rmSync(path.join(project.dir, 'tsconfig.json'))
    return project
  }

  it('AC-nextjs-used-atoms-14: the alias resolves and the layer holds flex and grid', async () => {
    const { atoms, record } = await runAndRead(buildJavaScript())
    expect(atoms).toEqual(['flex', 'grid'])
    expect(record.problems).toEqual([])
  })

  it('AC-nextjs-used-atoms-14: control, with no paths anywhere the alias is an unresolved import', async () => {
    const project = buildJavaScript()
    project.write({ 'jsconfig.json': JSON.stringify({ compilerOptions: {} }) })
    const { atoms, record } = await runAndRead(project)
    expect(atoms).toEqual(['flex'])
    expect(record.problems).toEqual([
      expect.objectContaining({ construct: "'@/components/Card'", text: UNRESOLVED_TEXT }),
    ])
  })
})

describe('AC-nextjs-used-atoms-14: control, the alias needs paths', () => {
  const make = scratchProjects()

  it('AC-nextjs-used-atoms-14: with paths removed from tsconfig.json the import is unresolved and its atom is absent', async () => {
    const project = make({
      'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'preserve' } }),
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': `import { cx } from '@navecss/core/cx'\n\nimport { Card } from '@/components/Card'\n\nexport default function Page() {\n  return <div className={cx('flex')}><Card /></div>\n}\n`,
      'components/Card.tsx': moduleSource('components/Card.tsx', ['rounded']),
    })
    const { atoms, record } = await runAndRead(project)
    expect(atoms).toEqual(['flex'])
    expect(record.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        construct: "'@/components/Card'",
        text: UNRESOLVED_TEXT,
        file: 'app/page.tsx',
        line: 3,
        column: 22,
      }),
    ])
  })

  it('AC-nextjs-used-atoms-14: control, with paths set the same project reads the component', async () => {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': `import { cx } from '@navecss/core/cx'\n\nimport { Card } from '@/components/Card'\n\nexport default function Page() {\n  return <div className={cx('flex')}><Card /></div>\n}\n`,
      'components/Card.tsx': moduleSource('components/Card.tsx', ['rounded']),
    })
    const { atoms, record } = await runAndRead(project)
    expect(atoms).toEqual(['flex', 'rounded'])
    expect(record.problems).toEqual([])
  })
})
