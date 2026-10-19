/**
 * A template literal with no substitution names one module, as a string literal does, and
 * webpack and Turbopack bundle it statically: `import(`./Heavy`)` and `require(`./Heavy`)` are
 * edges of the graph.
 */
import { describe, expect, it } from 'vitest'

import { installNext, moduleSource, runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const project = scratchProjects()

const HEAVY = { 'app/Heavy.tsx': moduleSource('app/Heavy.tsx', ['grid']) }

describe('a template literal with no substitution is an edge', () => {
  it.each([
    ["import('./Heavy') (control)", "const Heavy = dynamic(() => import('./Heavy'))"],
    ['import(`./Heavy`)', 'const Heavy = dynamic(() => import(`./Heavy`))'],
    ['require(`./Heavy`)', 'const Heavy = require(`./Heavy`).default'],
  ])('%s: the module it names is read', async (_label, line) => {
    const app = project({
      ...HEAVY,
      'app/page.tsx': `import dynamic from 'next/dynamic'\n\n${line}\n\nexport default function Page() {\n  return <Heavy />\n}\n`,
    })
    installNext(app)
    const { atoms, record } = await runAndRead(app)
    expect(Object.keys(record.files)).toContain('app/Heavy.tsx')
    expect(atoms).toContain('grid')
  })
})
