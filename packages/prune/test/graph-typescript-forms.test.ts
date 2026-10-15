/**
 * AC-nextjs-used-atoms-09, the package's own rows: the reader learns TypeScript through
 * `oxc-parser`, which keeps a node for each pair of parentheses unless it is told not to. Each
 * form reads as its types-stripped copy, and a Nave class built from a parenthesised piece is
 * refused, not read clean.
 */
import { describe, expect, it } from 'vitest'

import { runAndRead, scratchProjects, sorted } from './helpers/graph-fixture.ts'

const HEAD = `import { cx } from '@navecss/core/cx'\ntype AtomName = import('@navecss/core/atoms').AtomName\nconst on = Math.random() > 0.5\n`

/**
 * One page whose body is `body`, with the head every row shares, beside a layout.
 */
function pageWith(body: string): Record<string, string> {
  return {
    'app/layout.tsx': 'export default function Layout() { return null }\n',
    'app/page.tsx': `${HEAD}${body}\nexport default function Page() { return null }\n`,
  }
}

const READ_AS_AUTHORED: readonly [string, string, string[]][] = [
  ['as const', "export const a = cx('flex' as const)", ['flex']],
  ['satisfies', "export const a = cx('flex' satisfies AtomName)", ['flex']],
  ['non-null', "const c = 'flex'\nexport const a = cx(c!)", ['flex']],
  ['assertion on a binding', "const v = 'grid' as AtomName\nexport const a = cx(v)", ['grid']],
  [
    'assertion inside a condition',
    "export const a = cx(on ? 'flex' : ('grid' as const))",
    ['flex', 'grid'],
  ],
  ['annotated binding', "const v: AtomName = 'grid'\nexport const a = cx(v)", ['grid']],
  ['typeof cx in a type', 'export type T = typeof cx', []],
  ['Parameters<typeof cx>', 'export type T = Parameters<typeof cx>[0]', []],
  ['a type named cx', "type cx = string\nexport const a: cx = 'x'", []],
  ['an interface member named cx', 'export interface P { cx: string }', []],
]

describe('AC-nextjs-used-atoms-09: each form reads as its types-stripped copy', () => {
  const make = scratchProjects()

  it.each(READ_AS_AUTHORED)('%s', async (_name, body, expected) => {
    const project = make(pageWith(body))
    const { atoms, record } = await runAndRead(project)
    expect(record.problems).toEqual([])
    expect(sorted(atoms)).toEqual(sorted(expected))
  })

  it('angle-bracket assertion (a .ts file) reads as its stripped copy', async () => {
    const project = make({
      ...pageWith(''),
      'app/api/x/route.ts': `${HEAD}export const a = cx(<AtomName>'flex')\n`,
    })
    const { atoms, record } = await runAndRead(project)
    expect(record.problems).toEqual([])
    expect(sorted(atoms)).toEqual(['flex'])
  })

  it('control: a value under an assertion that is not a literal is still refused', async () => {
    const project = make(pageWith('export const a = (variant: string) => cx(variant as AtomName)'))
    const { record } = await runAndRead(project)
    expect(record.problems.map((problem) => problem.kind)).toEqual(['argument'])
  })
})

describe('AC-nextjs-used-atoms-09: a parenthesised piece of a Nave class is refused', () => {
  const make = scratchProjects()

  it.each([
    ['a plain parenthesised piece', "export const a = ('nave-') + tone"],
    ['a parenthesised assertion', "export const a = ('nave-' as string) + tone"],
  ])('%s is a concatenation problem', async (_name, body) => {
    const project = make(pageWith(`const tone = 'flex'\n${body}`))
    const { record } = await runAndRead(project)
    expect(record.problems.map((problem) => problem.kind)).toEqual(['concatenation'])
  })

  it('control: the same piece without parentheses is refused the same way', async () => {
    const project = make(pageWith("const tone = 'flex'\nexport const a = 'nave-' + tone"))
    const { record } = await runAndRead(project)
    expect(record.problems.map((problem) => problem.kind)).toEqual(['concatenation'])
  })
})
