/**
 * The record of a CSS Module whose JavaScript does not parse (AC-used-atoms-61): no atoms, since
 * its text can hold the inlined stylesheet, and one problem that names the class map.
 */
import { describe, expect, it } from 'vitest'

import type { TransformContext } from '../src/vite-types.ts'

import { recordWithoutCalls } from '../src/vite-css-module-record.ts'
import { createExtendSource } from '../src/vite-extend.ts'
import { resolveUsedOptions } from '../src/vite-options.ts'
import { CLASS_MAP_NOT_PARSED } from '../src/vite-unread-record.ts'
import { createUsedContext } from '../src/vite-used.ts'

// The stand-in parse throws on it, as on a class map a later plugin broke.
const CLASS_MAP = {
  code: 'const __vite__css = ".s .nave-hidden{}"\nexport const box = "_b nave-flex"',
  id: '/src/a.module.css',
  pkg: undefined,
}

const ctx = {
  parse: () => {
    throw new SyntaxError('Unexpected token')
  },
} as unknown as TransformContext

describe('AC-used-atoms-61 — a CSS Module whose JavaScript does not parse', () => {
  it('is recorded with no atoms and one problem that names the class map', () => {
    const context = createUsedContext(resolveUsedOptions({}), createExtendSource(undefined))

    const record = recordWithoutCalls(context, ctx, CLASS_MAP)

    expect([...record!.atoms]).toEqual([])
    expect(record!.problems.map((problem) => problem.text)).toEqual([CLASS_MAP_NOT_PARSED])
    expect(record!.problems[0]!.text).not.toContain('TypeScript')
  })

  it('reports the problem when its package is listed in keepFor, which stands in for reading calls', () => {
    const context = createUsedContext(
      resolveUsedOptions({ keepFor: { '@acme/ui': ['flex'] } }),
      createExtendSource(undefined),
    )

    const record = recordWithoutCalls(context, ctx, { ...CLASS_MAP, pkg: '@acme/ui' })

    expect(record!.problems).toHaveLength(1)
    expect(record!.suppressed).toHaveLength(0)
  })
})
