/**
 * The places the build check watches for a `paths` alias or a `baseUrl`: a file created at a target
 * the resolver tries earlier than the one it used changes what the specifier reaches, so the check
 * stops the build and names the directory.
 */
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { writeBuildCss } from './helpers/build-output.ts'
import { listen, NOTHING, runCheck } from './helpers/hook-run.ts'
import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const CX = "import { cx } from '@navecss/core/cx'"

const PAGE = 'export default function Page() {\n  return <div className={value} />\n}\n'
const pageImporting = (specifier: string): string =>
  `import { value } from '${specifier}'\n\n${PAGE}`
const moduleOf = (atom: string): string => `${CX}\n\nexport const value = cx('${atom}')\n`

async function built(project: Project): Promise<void> {
  listen()
  const result = await runAtomic(project, [], { options: {} })
  writeBuildCss(project, result.css)
}

async function stoppedWith(project: Project): Promise<string> {
  const printed = await runCheck(project)
  expect(printed.error).toBeInstanceOf(Error)
  return printed.errors[0] ?? ''
}

describe('the paths watch', () => {
  it('targets relative to a baseUrl that is not the config directory are watched there', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'preserve', baseUrl: './src', paths: { '@/*': ['a/*', 'b/*'] } },
      }),
      'src/b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'src/a/ui/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): src/a/ui/ changed after')
  })

  it('a file created in the middle of a three-entry fallback list stops it naming that directory', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'preserve', paths: { '@/*': ['./a/*', './b/*', './c/*'] } },
      }),
      'c/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'b/ui/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): b/ui/ changed after')
  })

  it('a file created earlier in the fallback list of an alias with no star stops it', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'preserve', paths: { 'card-alias': ['./a/Card', './b/Card'] } },
      }),
      'b/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('card-alias'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'a/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): a/ changed after')
  })

  it('a file created earlier in the fallback list of an alias that starts with # stops it', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'preserve', paths: { '#card': ['./a/Card', './b/Card'] } },
      }),
      'b/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('#card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'a/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): a/ changed after')
  })
})

describe('the places a fallback list or a baseUrl can send a specifier', () => {
  it('a file created earlier in a fallback list written with ${configDir} stops it', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          jsx: 'preserve',
          paths: { '@/*': ['${configDir}/a/*', '${configDir}/b/*'] },
        },
      }),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'a/ui/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): a/ui/ changed after')
  })

  it('a file created at the baseUrl under the name of an installed package stops it', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'preserve', baseUrl: '.' } }),
      'app/page.tsx': pageImporting('dep'),
    })
    project.install('dep', {
      'package.json': JSON.stringify({
        name: 'dep',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        dependencies: { '@navecss/core': '*' },
      }),
      'index.js': moduleOf('flex'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'dep.ts': moduleOf('grid') })

    // A fresh run now reads dep.ts, so the layer on disk is out of date.
    expect(await stoppedWith(project)).toContain('withNave(): ')
  })
})
