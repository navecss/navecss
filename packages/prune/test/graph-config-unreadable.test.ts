/**
 * A config the build cannot read is the problem the report names, once, at the config file: the
 * imports that do not depend on it are read as usual, and the ones that might are not reported as
 * unresolvable.
 */
import { describe, expect, it } from 'vitest'

import { runAndRead, scratchProjects, UNRESOLVED_TEXT } from './helpers/graph-fixture.ts'

const make = scratchProjects()

const PAGE = `import { cx } from '@navecss/core/cx'
import { Plain } from '../ui/Plain'
import { Card } from '@/ui/Card'

export default function Page() {
  return <div className={cx('flex')}><Plain /><Card /></div>
}
`

const PLAIN = `import { cx } from '@navecss/core/cx'

export const Plain = () => <i className={cx('grid')} />
`

function projectWith(files: Record<string, string>): ReturnType<typeof make> {
  return make({ 'app/page.tsx': PAGE, 'ui/Plain.tsx': PLAIN, ...files })
}

describe('AC-nextjs-used-atoms-04: a config that cannot be read', () => {
  it('AC-nextjs-used-atoms-04: an extends that names no file is one problem, at the config', async () => {
    const { atoms, record } = await runAndRead(
      projectWith({ 'tsconfig.json': JSON.stringify({ extends: './missing' }) }),
    )
    expect(record.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        file: 'tsconfig.json',
        text: expect.stringContaining("extends './missing'") as unknown,
      }),
    ])
    expect(atoms).toEqual(['flex', 'grid'])
  })

  it('AC-nextjs-used-atoms-04: an extended file that is not JSON is one problem, at that file', async () => {
    const { record } = await runAndRead(
      projectWith({
        'tsconfig.json': JSON.stringify({ extends: './base' }),
        'base.json': '{ "compilerOptions": ',
        'base/readme.txt': 'notes\n',
      }),
    )
    expect(record.problems).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        file: 'base.json',
        text: expect.stringContaining('JSON') as unknown,
      }),
    ])
  })

  it('AC-nextjs-used-atoms-04: a config that is not JSON is one problem, at the config', async () => {
    const { record } = await runAndRead(projectWith({ 'tsconfig.json': '{ "compilerOptions": ' }))
    expect(record.problems).toEqual([
      expect.objectContaining({ kind: 'unreadable', file: 'tsconfig.json' }),
    ])
  })

  it('AC-nextjs-used-atoms-04: control, a config the build reads leaves no problem for the same imports', async () => {
    const { atoms, record } = await runAndRead(
      projectWith({
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
        'ui/Card.tsx': PLAIN.replace('grid', 'rounded'),
      }),
    )
    expect(record.problems).toEqual([])
    expect(atoms).toEqual(['flex', 'grid', 'rounded'])
  })

  it('AC-nextjs-used-atoms-04: control, a relative import of a file that is not there is still unresolved', async () => {
    const { record } = await runAndRead(
      projectWith({
        'tsconfig.json': JSON.stringify({ extends: './missing' }),
        'app/page.tsx': PAGE.replace('../ui/Plain', '../ui/Gone'),
      }),
    )
    expect(record.problems.map((problem) => problem.text)).toContain(UNRESOLVED_TEXT)
    expect(record.problems.map((problem) => problem.file)).toContain('tsconfig.json')
  })
})
