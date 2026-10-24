/**
 * What a `paths` pattern captures from a specifier, and where it puts the capture in each target:
 * the capture goes in as written, whatever characters it holds.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { PathAlias } from '../src/path-aliases.ts'

import { resolverConfigs } from '../src/config-chain.ts'
import { aliasCandidates, pathAliasesOf } from '../src/path-aliases.ts'
import { scratchProjects } from './helpers/graph-fixture.ts'

const alias = (pattern: string, ...targets: string[]): PathAlias => ({ pattern, targets })

describe('the targets an alias sends a specifier to', () => {
  it('puts what the star captured where the target has its star', () => {
    expect(aliasCandidates([alias('@/*', '/app/*', '/lib/*/index')], '@/ui/Card')).toEqual([
      '/app/ui/Card',
      '/lib/ui/Card/index',
    ])
  })

  it('captures between a prefix and a suffix', () => {
    expect(aliasCandidates([alias('~/*.js', '/src/*')], '~/ui/Card.js')).toEqual(['/src/ui/Card'])
  })

  it('leaves a target with no star as it is', () => {
    expect(aliasCandidates([alias('card', '/app/ui/Card')], 'card')).toEqual(['/app/ui/Card'])
  })

  it('puts a capture that looks like a replacement pattern in as written', () => {
    expect(aliasCandidates([alias('@/*', '/app/*')], "@/a$&b$1c$'d$`e$$f")).toEqual([
      "/app/a$&b$1c$'d$`e$$f",
    ])
  })

  it('replaces only the first star of a target', () => {
    expect(aliasCandidates([alias('@/*', '/a/*/b/*')], '@/x')).toEqual(['/a/x/b/*'])
  })

  it('gives nothing for a specifier the pattern does not match', () => {
    expect(aliasCandidates([alias('@/*', '/app/*')], 'other/ui')).toEqual([])
  })

  it('gives the target as it is, whole, for a specifier equal to the prefix', () => {
    expect(aliasCandidates([alias('@/*', '/app/*')], '@/')).toEqual(['/app/'])
  })
})

describe('the config a project reads its aliases from', () => {
  const make = scratchProjects()

  /**
   * The `paths` target and the `rootDir` of the config in `text`, as the chain reader reads them.
   */
  function readFrom(text: string): { candidates: string[]; config: unknown; dir: string } {
    const project = make({ 'tsconfig.json': text })
    const configs = resolverConfigs(project.dir)
    return {
      config: configs[0]?.config,
      candidates: aliasCandidates(pathAliasesOf(configs), '@/ui/Card'),
      dir: project.dir,
    }
  }

  it('reads a string that holds a comma and a closing bracket or brace as written', () => {
    const { config, candidates, dir } = readFrom(
      '{ "compilerOptions": { "rootDir": "./x,}y", "paths": { "@/*": ["./src/a,]/*"] } } }',
    )

    expect(config).toEqual({
      compilerOptions: { rootDir: './x,}y', paths: { '@/*': ['./src/a,]/*'] } },
    })
    expect(candidates).toEqual([path.join(dir, 'src/a,]/ui/Card')])
  })

  it('drops a trailing comma before a brace or a bracket, whatever lies between', () => {
    const { config } = readFrom(
      '{ "a": [1, 2 , ], "b": { "c": 3 // note\n , /* gap */ }, /* end */ }',
    )

    expect(config).toEqual({ a: [1, 2], b: { c: 3 } })
  })

  it('keeps a comma inside a string and drops the real trailing comma after it', () => {
    const { config } = readFrom('{ "a": ["x,", "y,",], "b": "z,", }')

    expect(config).toEqual({ a: ['x,', 'y,'], b: 'z,' })
  })
})
