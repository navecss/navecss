/**
 * A config whose `extends` names a path with no extension, beside a directory of that name:
 * TypeScript reads `base.json`, since a directory is not a file. The resolver the plugin reads the
 * code with does not, so the plugin resolves the config's `paths` itself and hands the resolver no
 * config.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createResolver } from '../src/resolve.ts'
import { scratchProjects } from './helpers/graph-fixture.ts'

const make = scratchProjects()

const APP_CONFIG = JSON.stringify({ extends: './base', compilerOptions: { jsx: 'preserve' } })

/**
 * A project whose config extends `./base`, with `base.json` and a `base/` directory side by side.
 */
function projectExtending(
  base: object,
  files: Record<string, string> = {},
): ReturnType<typeof make> {
  return make({
    'tsconfig.json': APP_CONFIG,
    'base.json': JSON.stringify(base),
    'base/readme.txt': 'notes\n',
    'app/page.tsx': '',
    'ui/Card.tsx': '',
    ...files,
  })
}

function filesOf(
  project: ReturnType<typeof make>,
  specifier: string,
  from = 'app/page.tsx',
): string[] {
  const resolver = createResolver(project.dir, ['production'])
  return [...resolver.resolve(path.join(project.dir, from), specifier, false).files]
}

describe('AC-nextjs-used-atoms-04: an extended config beside a directory of that name', () => {
  it('AC-nextjs-used-atoms-04: a paths alias set in the extended file resolves', () => {
    const project = projectExtending({ compilerOptions: { paths: { '@/*': ['./*'] } } })
    expect(filesOf(project, '@/ui/Card')).toEqual([path.join(project.dir, 'ui/Card.tsx')])
  })

  it('AC-nextjs-used-atoms-04: a relative import resolves', () => {
    const project = projectExtending({ compilerOptions: { paths: { '@/*': ['./*'] } } })
    expect(filesOf(project, '../ui/Card')).toEqual([path.join(project.dir, 'ui/Card.tsx')])
  })

  it('AC-nextjs-used-atoms-04: a package imported by name resolves', () => {
    const project = projectExtending({ compilerOptions: { paths: { '@/*': ['./*'] } } })
    project.install('fake-lib', {
      'package.json': JSON.stringify({ name: 'fake-lib', version: '1.0.0', main: './index.js' }),
      'index.js': 'module.exports = {}\n',
    })
    expect(filesOf(project, 'fake-lib')).toEqual([
      path.join(project.dir, 'node_modules/fake-lib/index.js'),
    ])
  })

  it('AC-nextjs-used-atoms-04: a baseUrl set in the extended file resolves a bare specifier', () => {
    const project = projectExtending({ compilerOptions: { baseUrl: '.' } })
    expect(filesOf(project, 'ui/Card')).toEqual([path.join(project.dir, 'ui/Card.tsx')])
  })

  it('AC-nextjs-used-atoms-04: the first target of an alias that exists is the one it resolves to', () => {
    const project = projectExtending(
      { compilerOptions: { paths: { '@/*': ['./a/*', './b/*'] } } },
      { 'b/ui/Card.tsx': '' },
    )
    expect(filesOf(project, '@/ui/Card')).toEqual([path.join(project.dir, 'b/ui/Card.tsx')])
    project.write({ 'a/ui/Card.tsx': '' })
    expect(filesOf(project, '@/ui/Card')).toEqual([path.join(project.dir, 'a/ui/Card.tsx')])
  })

  it('AC-nextjs-used-atoms-04: control, an alias the config does not set stays unresolved', () => {
    const project = projectExtending({ compilerOptions: { paths: { '@/*': ['./*'] } } })
    expect(filesOf(project, '~/ui/Card')).toEqual([])
  })

  it('AC-nextjs-used-atoms-04: control, the same config with no directory beside it resolves the alias', () => {
    const project = projectExtending({ compilerOptions: { paths: { '@/*': ['./*'] } } })
    project.write({ 'tsconfig.json': JSON.stringify({ extends: './base.json' }) })
    expect(filesOf(project, '@/ui/Card')).toEqual([path.join(project.dir, 'ui/Card.tsx')])
  })
})
