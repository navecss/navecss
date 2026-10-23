import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  countsOf,
  lightningProblems,
  transformModule,
  withoutAGuard,
} from './support/registry/css-lightning.ts'
import { modulesOf } from './support/registry/css-rules.ts'
import { loadRegistry } from './support/registry/load.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const devDependency = (directory: string): string | undefined =>
  (
    JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>
    }
  ).devDependencies?.lightningcss

describe('AC-base-ui-registry-23: the CSS Modules transform keeps the ring, the guard, the outline declarations and the layer order', () => {
  it('uses the exact lightningcss version @navecss/core pins', () => {
    const pinned = devDependency(path.join(PACKAGE_DIR, '../core'))
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/)
    expect(devDependency(PACKAGE_DIR)).toBe(pinned)
  })

  it('keeps every focus rule, guard and outline declaration of every module, inside components.consumer, and the layer order', () => {
    const { found, problems } = modulesOf(loadRegistry())
    expect(problems).toEqual([])
    const results = found.map((module) => ({
      counts: countsOf(module.content),
      problems: lightningProblems(
        module.label,
        module.content,
        transformModule(module.label, module.content),
      ),
    }))
    expect(results.flatMap((result) => result.problems)).toEqual([])
    expect(results.reduce((sum, result) => sum + result.counts.focusRules, 0)).toBeGreaterThan(0)
    expect(results.reduce((sum, result) => sum + result.counts.guards, 0)).toBeGreaterThan(0)
    expect(results.reduce((sum, result) => sum + result.counts.outlines, 0)).toBeGreaterThan(0)
  })

  it('reds a module whose guard was removed before the transform, one guard fewer in the output', () => {
    const { found } = modulesOf(loadRegistry())
    const module = found.find((candidate) => countsOf(candidate.content).guards > 0)
    if (module === undefined) throw new Error('no module has a guard')
    const output = transformModule(module.label, withoutAGuard(module.content))
    expect(countsOf(output.css).guards).toBe(countsOf(module.content).guards - 1)
    const problems = lightningProblems(module.label, module.content, output)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(module.label)
    expect(problems.join('\n')).toContain('guards')
  })
})
