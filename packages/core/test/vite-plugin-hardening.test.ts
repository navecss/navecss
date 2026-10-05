/**
 * Review hardening for the Vite plugin and the code it shares with the PostCSS plugin: a nested
 * `extend` shape the validators used to skip, the fold and the finding line with multi-line text, a
 * source map's `sourceRoot` and a position it does not cover, the Lightning CSS warning filter's
 * boundary, the validators' reading of an escaped comment opener inside a string, and the extend
 * module cache.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../src/atoms.ts'

import { formatFinding } from '../src/directive/findings.ts'
import { foldLocated } from '../src/directive/fold.ts'
import { applyExtendModule } from '../src/postcss-extend-module.ts'
import { validateExtendAtoms } from '../src/validate-extend-atoms.ts'
import { validateExtendAtomsHostFree } from '../src/validate-extend-host-free.ts'
import { dropLightningNaveWarning } from '../src/vite-logger.ts'
import { runHook } from './helpers/vite-hook.ts'

const isRefused = (
  validate: (extend: Record<string, AtomDefinition>) => void,
  extend: unknown,
): boolean => {
  try {
    validate(extend as Record<string, AtomDefinition>)
    return false
  } catch {
    return true
  }
}

describe('a nested extend shape that is not a plain object is refused, not rendered', () => {
  const shapes: readonly (readonly [string, unknown])[] = [
    [
      'an array of declarations in a pseudo',
      { x: { declarations: {}, pseudos: { ':hover': ['a; } body { x: y'] } } },
    ],
    [
      'a string of declarations in a pseudo',
      { x: { declarations: {}, pseudos: { ':hover': '}' } } },
    ],
    ['a pseudos map that is an array', { x: { declarations: {}, pseudos: ['a'] } }],
    ['a media map that is a string', { x: { declarations: {}, media: 'x' } }],
    ['a media block that is a string', { x: { declarations: {}, media: { '(x)': '}' } } }],
    [
      'a media block whose declarations are an array',
      { x: { declarations: {}, media: { '(x)': { declarations: ['a; }'] } } } },
    ],
    [
      'a container block whose pseudos are a string',
      { x: { declarations: {}, container: { '(x)': { pseudos: 'a' } } } },
    ],
  ]

  it.each(shapes)('%s, in both validators', (_name, extend) => {
    expect(isRefused(validateExtendAtoms, extend)).toBe(true)
    expect(isRefused(validateExtendAtomsHostFree, extend)).toBe(true)
  })

  it('still lets an empty or absent nested map through', () => {
    const ok = { x: { declarations: {}, pseudos: {}, media: { '(x)': { declarations: {} } } } }

    expect(isRefused(validateExtendAtoms, ok)).toBe(false)
    expect(isRefused(validateExtendAtomsHostFree, ok)).toBe(false)
  })

  it('the Vite plugin refuses an array of pseudo declarations before it can be spliced', async () => {
    await expect(
      runHook({
        code: '.a { @nave evil; }',
        options: {
          extend: {
            evil: { declarations: {}, pseudos: { ':hover': ['a; } body { x: y'] } },
          } as never,
        },
      }),
    ).rejects.toThrow(/is an array, not a plain object/)
  })
})

describe('a malformed nested value that JSON cannot print is still refused with the validator’s own error', () => {
  const circular: unknown[] = []
  circular.push(circular)

  it.each([
    ['a BigInt inside an array', [1n]],
    ['a circular array', circular],
  ])('%s', (_name, bad) => {
    const extend = { x: { declarations: {}, pseudos: { ':hover': bad } } }

    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      expect(() => validate(extend as never)).toThrow(
        /is an array, not a plain object\. Write it as/,
      )
    }
  })
})

describe('the fold keeps a multi-line text whole', () => {
  it('keeps the lines of a quoted token and takes only a real Available line as the suffix', () => {
    const report = foldLocated([
      { text: '@nave: unexpected "a\nb"; a directive takes only atom names', line: 1, column: 1 },
      {
        text: '@nave: unknown atom "x". If it is an atom of your own.\nAvailable: flex, block',
        line: 3,
        column: 1,
      },
    ])

    expect(report.split('\n')).toEqual([
      '@nave: unexpected "a',
      'b"; a directive takes only atom names',
      '1 more in this stylesheet:',
      '3:1: unknown atom "x". If it is an atom of your own.',
      'Available: flex, block',
    ])
  })
})

describe('a finding stays one line', () => {
  it('collapses a multi-line selector', () => {
    const line = formatFinding({
      file: 'a.css',
      line: 2,
      column: 3,
      text: '@nave flex',
      selector: '.a,\n  .b',
    })

    expect(line).toBe('a.css:2:3: @nave flex (in .a, .b)')
  })
})

describe('a diagnostic’s position through the source map', () => {
  const CSS = '.x {\n  color: red;\n  @nave nope;\n}'

  it('resolves a relative source against the map’s sourceRoot', async () => {
    const run = await runHook({
      code: CSS,
      incomingMap: {
        sources: ['src.scss'],
        sourceRoot: '/proj',
        mappings: 'AAAA;AACA;AACA',
      },
    })

    expect(run.error!.loc!.file).toBe('/proj/src.scss')
    expect(run.error!.message).toContain('/proj/src.scss:')
  })

  it('says so when the map does not reach the line a problem is on', async () => {
    const run = await runHook({
      code: CSS,
      id: '/proj/compiled.css',
      incomingMap: { sources: ['a.scss'], mappings: 'AAAA' },
    })

    expect(run.error!.message).toContain(
      '(position in /proj/compiled.css as processed; the source map does not cover it)',
    )
  })
})

/**
 * What a logger passed through `dropLightningNaveWarning` still receives after `messages` are warned.
 */
function warnings(...messages: string[]): string[] {
  const received: string[] = []
  const logger = { warn: (message: string) => void received.push(message) }
  dropLightningNaveWarning(logger)
  for (const message of messages) logger.warn(message)
  return received
}

describe('the Lightning CSS warning filter’s boundary', () => {
  it('drops the @nave warning and keeps another at-rule’s, including one that extends the name', () => {
    expect(
      warnings(
        '[vite:css][lightningcss] Unknown at rule: @nave',
        '[vite:css][lightningcss] Unknown at rule: @naveé',
        '[vite:css][lightningcss] Unknown at rule: @nave-x',
        '[vite:css][lightningcss] Unknown at rule: @foo',
      ),
    ).toEqual([
      '[vite:css][lightningcss] Unknown at rule: @naveé',
      '[vite:css][lightningcss] Unknown at rule: @nave-x',
      '[vite:css][lightningcss] Unknown at rule: @foo',
    ])
  })

  it('wrapping one logger twice leaves the first wrapper in place and still filters correctly', () => {
    const received: string[] = []
    const logger = { warn: (message: string) => void received.push(message) }

    dropLightningNaveWarning(logger)
    const wrapped = logger.warn
    dropLightningNaveWarning(logger)
    logger.warn('[vite:css][lightningcss] Unknown at rule: @nave')
    logger.warn('[vite:css][lightningcss] Unknown at rule: @foo')

    expect(logger.warn).toBe(wrapped)
    expect(received).toEqual(['[vite:css][lightningcss] Unknown at rule: @foo'])
  })

  it('a logger whose warn was replaced after wrapping is wrapped again', () => {
    const replacement: string[] = []
    const logger = { warn: (_message: string) => {} }

    dropLightningNaveWarning(logger)
    logger.warn = (message: string) => void replacement.push(message)
    dropLightningNaveWarning(logger)
    logger.warn('[vite:css][lightningcss] Unknown at rule: @nave')
    logger.warn('[vite:css][lightningcss] Unknown at rule: @foo')

    expect(replacement).toEqual(['[vite:css][lightningcss] Unknown at rule: @foo'])
  })
})

describe('an escaped comment opener inside a string is plain text to both validators', () => {
  it.each([
    ['a declaration value', { x: { declarations: { content: String.raw`"a\/*b"` } } }],
    [
      'an attribute selector',
      { x: { declarations: {}, pseudos: { '[a="\\/*"]': { color: 'red' } } } },
    ],
  ])('%s is accepted by both', (_name, extend) => {
    expect(isRefused(validateExtendAtoms, extend)).toBe(false)
    expect(isRefused(validateExtendAtomsHostFree, extend)).toBe(false)
  })

  it('outside a string it is still refused by both', () => {
    const extend = { x: { declarations: { color: String.raw`red\/* c */` } } }

    expect(isRefused(validateExtendAtoms, extend)).toBe(true)
    expect(isRefused(validateExtendAtomsHostFree, extend)).toBe(true)
  })

  it('an unquoted url with no comment opener in it is accepted in a prelude, by both', () => {
    const extend = {
      x: {
        declarations: {},
        container: { 'style(--x: url(a))': { declarations: { color: 'red' } } },
      },
    }

    expect(isRefused(validateExtendAtoms, extend)).toBe(
      isRefused(validateExtendAtomsHostFree, extend),
    )
  })
})

describe('the extend module cache does not keep one entry per edit', () => {
  it('holds one entry for a file however many times it changes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'nave-extend-cache-'))
    try {
      const file = path.join(dir, 'atoms.json')
      const cache = new Map<string, Promise<Record<string, AtomDefinition>>>()
      for (const margin of ['1px', '2px', '3px']) {
        writeFileSync(file, JSON.stringify({ a: { declarations: { margin } } }))
        await applyExtendModule(file, cache, () => {})
      }

      expect(cache.size).toBe(1)
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})
