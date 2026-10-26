/**
 * The resolver keeps a query or a fragment inside the path it returns (`./ui?v=1` gives
 * `ui.ts?v=1`), so the graph cuts it off. It cuts only what is not part of a file's name: a file
 * whose name holds `#` is read as itself, and a query that holds `/` is cut like any other.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createResolver, withoutQuery } from '../src/resolve.ts'
import { createProject } from './helpers/project.ts'
import { installNext, runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const FILE = 'export const x = 1\n'

describe('the files an import resolves to when its specifier has a query or a fragment', () => {
  const projects: ReturnType<typeof createProject>[] = []
  afterEach(() => {
    for (const project of projects) project.remove()
    projects.length = 0
  })

  /**
   * The files `specifier` resolves to from the project's `components/q.ts`.
   */
  function resolved(specifier: string): string[] {
    const project = createProject({
      'components/ui.ts': FILE,
      'components/a#b.ts': FILE,
      'components/e.ts': FILE,
      'components/e#f.ts': FILE,
      'components/h#dir/index.ts': FILE,
    })
    projects.push(project)
    const resolver = createResolver(project.dir, ['production'])
    return resolver
      .resolve(path.join(project.dir, 'components/q.ts'), specifier, false)
      .files.map((file) => path.relative(project.dir, file))
  }

  it.each([
    ['a query', './ui?v=1', 'components/ui.ts'],
    ['a fragment', './ui#frag', 'components/ui.ts'],
    ['a query that holds a slash', './ui?v=a/b', 'components/ui.ts'],
    ['a query that holds a slash and a hash', './ui?v=a/b#c', 'components/ui.ts'],
  ])('cuts %s off the file', (_row, specifier, expected) => {
    expect(resolved(specifier)).toEqual([expected])
  })

  it.each([
    ['a file named with a hash', './a#b', 'components/a#b.ts'],
    ['a file named with a hash beside one without', './e#f', 'components/e#f.ts'],
    ['a directory named with a hash', './h#dir', 'components/h#dir/index.ts'],
  ])('keeps %s as the file it is', (_row, specifier, expected) => {
    expect(resolved(specifier)).toEqual([expected])
  })
})

describe('the graph reads a module whose file name holds a hash', () => {
  const make = scratchProjects()

  it('ships the atom the module names, and reports nothing', async () => {
    const project = make({
      'app/layout.tsx':
        'export default function Layout({ children }: { children: unknown }) {\n  return <html><body>{children}</body></html>\n}\n',
      'app/page.tsx':
        "import { a } from '../components/a#b'\n\nexport default function Page() {\n  return <div className={a} />\n}\n",
      'components/a#b.ts': "import { cx } from '@navecss/core/cx'\nexport const a = cx('grid')\n",
    })
    installNext(project)

    const { atoms, record } = await runAndRead(project)

    expect(atoms).toEqual(['grid'])
    expect(record.problems).toEqual([])
  })
})

describe('withoutQuery', () => {
  it('cuts at the last mark whose head is a file, with backslashes in the path', () => {
    // On a system whose separator is `/`, a backslash is a character of the name: the path below
    // is one file name, which is how a Windows path reads to a code that splits on `/` alone.
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'prune-query-')))
    const name = String.raw`C:\p\h#dir\ui.ts`
    try {
      writeFileSync(path.join(directory, name), FILE)

      expect(withoutQuery(path.join(directory, `${name}?v=1`))).toBe(path.join(directory, name))
      expect(withoutQuery(path.join(directory, name))).toBe(path.join(directory, name))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
