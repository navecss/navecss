/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- fixture sources are JSX text, whose braces are not template placeholders */
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { moduleSource, runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const LAYOUT = `export default function Layout({ children }: { children: unknown }) {
  return <html><body>{children}</body></html>
}
`

// The `${name}` of a template literal, built so the file does not hold a template placeholder.
const PLACEHOLDER = `\${name}`

const COMPUTED_IMPORT = `export function load(name: string) {
  return import(\`@/components/lazy/${PLACEHOLDER}\`)
}
`

/**
 * The page: it imports the two Markdown files and carries the computed `import()`, plus any extra
 * import statements a test adds.
 */
function pageSource(extraImports = ''): string {
  return `import { cx } from '@navecss/core/cx'
import Note from '@/components/Note.mdx'
import Read from '@/components/Read.md'
import { load } from '@/lib/load'
${extraImports}
void Note
void Read
void load

export default function Page() {
  return <div className={cx('flex')} />
}
`
}

const MARKDOWN_FILES: Record<string, string> = {
  'app/docs/page.mdx': "import OnlyMdx from '@/components/OnlyMdx'\n\n# Docs\n\n<OnlyMdx />\n",
  'components/Note.mdx': '# Note\n',
  'components/Read.md': '# Read\n',
}

describe('AC-nextjs-used-atoms-16: Markdown and MDX files are met, not read', () => {
  const make = scratchProjects()

  /**
   * The fixture: the Markdown files, the module only an MDX file imports and the computed import.
   */
  function build(extraImports = ''): Project {
    return make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': pageSource(extraImports),
      ...MARKDOWN_FILES,
      'components/OnlyMdx.tsx': moduleSource('components/OnlyMdx.tsx', ['grid']),
      'components/lazy/[name].tsx': moduleSource('components/lazy/[name].tsx', ['block']),
      'lib/load.ts': COMPUTED_IMPORT,
    })
  }

  it('AC-nextjs-used-atoms-16: the layer holds neither the atom only an MDX file imports nor the computed import target', async () => {
    const { atoms } = await runAndRead(build())
    expect(atoms).toEqual(['flex'])
  })

  it('AC-nextjs-used-atoms-16: the record lists every Markdown file the graph met, relative to the project and sorted', async () => {
    const { record } = await runAndRead(build())
    expect(record.markdown).toEqual([
      'app/docs/page.mdx',
      'components/Note.mdx',
      'components/Read.md',
    ])
  })

  it('AC-nextjs-used-atoms-16: control, the module also imported by a normal page ships its atom', async () => {
    const { atoms } = await runAndRead(
      build("import OnlyMdx from '@/components/OnlyMdx'\nvoid OnlyMdx\n"),
    )
    expect(atoms).toEqual(['flex', 'grid'])
  })

  it('AC-nextjs-used-atoms-16: control, a string-literal import() of the same module ships its atom', async () => {
    const project = build()
    project.write({
      'lib/load.ts': "export function load() {\n  return import('@/components/lazy/[name]')\n}\n",
    })
    const { atoms } = await runAndRead(project)
    expect(atoms).toEqual(['block', 'flex'])
  })

  it('AC-nextjs-used-atoms-16: control, with no Markdown or MDX file the list is empty', async () => {
    const project = make({
      'app/layout.tsx': LAYOUT,
      'app/page.tsx': moduleSource('app/page.tsx', ['flex']),
      'components/OnlyMdx.tsx': moduleSource('components/OnlyMdx.tsx', ['grid']),
    })
    const { atoms, record } = await runAndRead(project)
    expect(record.markdown).toEqual([])
    expect(atoms).toEqual(['flex'])
  })
})
