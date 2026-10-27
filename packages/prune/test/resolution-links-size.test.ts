/**
 * The links through `node_modules` that the record keeps grow with the number of directories and
 * the number of packages, not with their product: a project of a few thousand directories and a
 * hundred packages must not leave tens of thousands of entries for the build's check to read.
 */
import { describe, expect, it } from 'vitest'

import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const DIRECTORIES = 60
const PACKAGES = 24

/**
 * A project of `DIRECTORIES` nested directories, each holding a module that imports most of
 * `PACKAGES` packages installed at the project root.
 */
function largeProject(): ReturnType<typeof makeProject> {
  const names = Array.from({ length: PACKAGES }, (_, at) => `pkg${String(at)}`)
  const files: Record<string, string> = {}
  const imports: string[] = []
  for (let at = 0; at < DIRECTORIES; at += 1) {
    const directory = `src/g${String(at % 6)}/m${String(at)}`
    const used = names
      .slice(0, PACKAGES - (at % 4))
      .map((name, id) => `import v${String(id)} from '${name}'`)
    files[`${directory}/mod.tsx`] = [...used, 'export const value = v0', ''].join('\n')
    imports.push(`import '../${directory}/mod'`)
  }
  files['app/page.tsx'] =
    `${imports.join('\n')}\n\nexport default function Page() {\n  return null\n}\n`
  const project = makeProject(files)
  for (const name of names) {
    project.install(name, {
      'package.json': JSON.stringify({ name, main: 'index.js' }),
      'index.js': 'export default 1\n',
    })
  }
  return project
}

describe('AC-nextjs-used-atoms-31: the record keeps few links for many importers', () => {
  it('AC-nextjs-used-atoms-31: the entries stay within three times the directories plus the packages', async () => {
    const project = largeProject()

    await runAtomic(project, [], { options: {} })

    const { links } = recordOf(project)
    const count = Object.keys(links).length
    // Control: the packages were found, so the case was reached.
    expect(Object.keys(links).filter((link) => link.endsWith('/pkg0'))).not.toEqual([])
    expect(count).toBeLessThanOrEqual(3 * (DIRECTORIES + PACKAGES))
  })
})
