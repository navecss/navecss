/**
 * The record lists the packages under node_modules that call `cx.dynamic()` in a file a `pages/`
 * entry reaches: Pages Router server code sees `cx.dynamic()`'s map only for a package the build
 * bundles, so the build's check needs the list.
 */
import { describe, expect, it } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const CX = "import { cx } from '@navecss/core/cx'"

/**
 * An installed package whose module calls `call` and exports the result as `value`, and whose
 * `package.json` lists `@navecss/core` in `dependencies`.
 */
function packageCalling(name: string, call: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${CX}\n\nexport const value = ${call}\n`,
  }
}

/**
 * A module that imports `value` from each package and renders it.
 */
function importing(...names: string[]): string {
  const imports = names.map((name, at) => `import { value as v${at} } from '${name}'`).join('\n')
  const used = names.map((_name, at) => `v${at}`).join(' + ')
  return `${imports}\n\nexport default function Page() {\n  return <div className={${used}} />\n}\n`
}

const DYNAMIC = "cx.dynamic('interactive')"

/**
 * Runs the plugin and returns the list the record holds.
 */
async function listed(project: Project, options: NaveOptions): Promise<readonly string[]> {
  await runAtomic(project, [], { options })
  return recordOf(project).pagesDynamicPackages
}

describe('AC-nextjs-used-atoms-39: the record lists the packages that call cx.dynamic() for the Pages Router', () => {
  it('AC-nextjs-used-atoms-39: a package imported from a pages entry that calls cx.dynamic() is listed', async () => {
    const project = makeProject({ 'pages/legacy.tsx': importing('dyn-pages') })
    project.install('dyn-pages', packageCalling('dyn-pages', DYNAMIC))
    const options = {
      keep: ['interactive' as const],
      keepFor: { 'dyn-pages': ['interactive' as const] },
    }
    expect(await listed(project, options)).toEqual(['dyn-pages'])
  })

  it('AC-nextjs-used-atoms-39: a package reached through an application module from a pages entry is listed', async () => {
    const project = makeProject({
      'pages/x.tsx': "import Wrap from '../components/Wrap'\n\nexport default Wrap\n",
      'components/Wrap.tsx': importing('dyn-pages'),
    })
    project.install('dyn-pages', packageCalling('dyn-pages', DYNAMIC))
    const options = { keepFor: { 'dyn-pages': ['interactive' as const] } }
    expect(await listed(project, options)).toEqual(['dyn-pages'])
  })

  it('AC-nextjs-used-atoms-39: a package that is also in keepFor is still listed', async () => {
    const project = makeProject({ 'pages/legacy.tsx': importing('dyn-pages') })
    project.install('dyn-pages', packageCalling('dyn-pages', DYNAMIC))
    const options = { keepFor: { 'dyn-pages': ['interactive' as const, 'focusRing' as const] } }
    const record = await listed(project, options)
    expect(record).toEqual(['dyn-pages'])
    expect(recordOf(project).atoms).toContain('interactive')
  })

  it('AC-nextjs-used-atoms-39: two packages are listed in sorted order, whatever the import order', async () => {
    const project = makeProject({ 'pages/legacy.tsx': importing('zeta-dyn', 'alpha-dyn') })
    project.install('zeta-dyn', packageCalling('zeta-dyn', DYNAMIC))
    project.install('alpha-dyn', packageCalling('alpha-dyn', DYNAMIC))
    const options = {
      keepFor: { 'alpha-dyn': ['interactive' as const], 'zeta-dyn': ['interactive' as const] },
    }
    expect(await listed(project, options)).toEqual(['alpha-dyn', 'zeta-dyn'])
  })
})

describe('AC-nextjs-used-atoms-39: what the list leaves out', () => {
  const options = { keepFor: { 'dyn-pages': ['interactive' as const] } }

  it('AC-nextjs-used-atoms-39: control, the same package imported from pages/ is listed', async () => {
    const project = makeProject({ 'pages/legacy.tsx': importing('dyn-pages') })
    project.install('dyn-pages', packageCalling('dyn-pages', DYNAMIC))
    expect(await listed(project, options)).toEqual(['dyn-pages'])
  })

  it('AC-nextjs-used-atoms-39: a package imported only from app/ is not listed', async () => {
    const project = makeProject({ 'app/page.tsx': importing('dyn-pages') })
    project.install('dyn-pages', packageCalling('dyn-pages', DYNAMIC))
    expect(await listed(project, options)).toEqual([])
    expect(Object.keys(recordOf(project).files)).toContain('node_modules/dyn-pages/index.js')
  })

  it('AC-nextjs-used-atoms-39: a package that does not call cx.dynamic() is not listed', async () => {
    const project = makeProject({ 'pages/legacy.tsx': importing('dyn-pages') })
    project.install('dyn-pages', packageCalling('dyn-pages', "cx('block')"))
    expect(await listed(project, {})).toEqual([])
    expect(Object.keys(recordOf(project).files)).toContain('node_modules/dyn-pages/index.js')
  })

  it('AC-nextjs-used-atoms-39: a pages entry calling cx.dynamic() itself lists no package', async () => {
    const project = makeProject({
      'pages/legacy.tsx': `${CX}\n\nexport default function Page() {\n  return <div className={cx.dynamic('interactive')} />\n}\n`,
    })
    expect(await listed(project, { keep: ['interactive'] })).toEqual([])
  })

  it('AC-nextjs-used-atoms-39: with no pages entry at all the list is empty', async () => {
    const project = makeProject({ 'app/page.tsx': "export default () => 'x'\n" })
    expect(await listed(project, {})).toEqual([])
  })
})
