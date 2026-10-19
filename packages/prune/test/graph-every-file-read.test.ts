/**
 * Every file the graph parses goes through the reader: no search of its text decides first
 * whether it could name an atom, since an escape hides a name from a search and not from the parse.
 */
import { describe, expect, it } from 'vitest'

import { runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const project = scratchProjects()

const ESCAPED = String.raw`'\u006eave-grid'`

describe('a class written whole is read whatever its text looks like', () => {
  it('control: the escaped form holds no nave- a search of the text could find', () => {
    expect(ESCAPED).not.toContain('nave-')
  })

  it.each([
    ['written plain (control)', "'nave-grid'"],
    ['written with a JavaScript escape', ESCAPED],
  ])('a nave- class %s ships its atom', async (_label, literal) => {
    const { atoms } = await runAndRead(
      project({
        'app/page.tsx': `export default function Page() {\n  return <main className={${literal}} />\n}\n`,
      }),
    )
    expect(atoms).toContain('grid')
  })
})
