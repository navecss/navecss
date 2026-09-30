/**
 * Two pinning rows for shapes the shipped behaviour already gets right:
 * a nested extend-atom `@media` block carrying its own pseudo, and the
 * `Available:` list still naming a consumer's own extend atoms when no
 * hint applies. Each is demonstrated against a scratch mutant that reds
 * it, so the pin is not vacuous.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'
import type { formatDiagnostic as FormatDiagnostic } from '../../src/directive/diagnostics-format.ts'
import type { plan as Plan } from '../../src/directive/plan.ts'

import { navePlugin } from '../../src/postcss.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..', '..', 'src')

const run = async (css: string, options?: Parameters<typeof navePlugin>[0]): Promise<string> => {
  const result = await postcss([navePlugin(options)]).process(css, { from: undefined })
  return result.css
}

describe('a nested extend-atom media block keeps its own pseudo', () => {
  it('emits the pseudo inside its own media condition, in the shipped order', async () => {
    const extend: Record<string, AtomDefinition> = {
      b: { declarations: {}, media: { '(x)': { pseudos: { ':hover': { c: 'd' } } } } },
    }

    const result = await run('.a { @nave b; }', { extend })

    expect(result.replaceAll(/\s+/g, ' ')).toBe('.a { @media (x) { &:hover { c: d } } }')
  })

  it('reds under a mutant that drops a conditional block’s own pseudos', async () => {
    const scratch = mkdtempSync(path.join(path.resolve(SRC, '..'), '.nave-resolve-scratch-'))
    try {
      cpSync(SRC, path.join(scratch, 'src'), { recursive: true })

      const resolvePath = path.join(scratch, 'src', 'directive', 'resolve.ts')
      const source = readFileSync(resolvePath, 'utf8')
      const broken = source.replace(
        'const pseudos = resolvePseudoBlocks(block.pseudos)',
        'const pseudos: never[] = []',
      )
      expect(broken).not.toBe(source)
      writeFileSync(resolvePath, broken)

      const { plan } = (await import(
        `${pathToFileURL(path.join(scratch, 'src', 'directive', 'plan.ts')).href}?scratch=${Date.now()}`
      )) as { plan: typeof Plan }

      const extend = {
        b: { declarations: {}, media: { '(x)': { pseudos: { ':hover': { c: 'd' } } } } },
      }
      const result = plan(
        'b',
        { isStyleRuleParent: true, isInsideKeyframes: false, isFollowingNestedNode: false },
        { extend },
      )

      // The mutant drops every conditional block's pseudos, so an atom whose
      // only content in that block WAS a pseudo now emits nothing at all —
      // the opposite of the pinned shape above.
      expect(result.blocks).toEqual([])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe('the Available list still names a consumer’s own extend atoms with no hint', () => {
  it('lists brandBox when nothing is close enough to hint at', async () => {
    const extend: Record<string, AtomDefinition> = { brandBox: { declarations: { color: 'red' } } }

    await expect(run('.x { @nave zzqqxxww; }', { extend })).rejects.toThrow(
      /\nAvailable: .*\bbrandBox\b/,
    )
  })

  it('reds under a mutant that builds the Available list from built-in atoms alone', async () => {
    const scratch = mkdtempSync(path.join(path.resolve(SRC, '..'), '.nave-vocabulary-scratch-'))
    try {
      cpSync(SRC, path.join(scratch, 'src'), { recursive: true })

      const formatPath = path.join(scratch, 'src', 'directive', 'diagnostics-format.ts')
      const source = readFileSync(formatPath, 'utf8')
      const broken = source.replace(
        'function vocabulary(extend: ExtendMap): string[] {',
        'function vocabulary(_extend: ExtendMap): string[] {\n  const extend = {}',
      )
      expect(broken).not.toBe(source)
      writeFileSync(formatPath, broken)

      const { formatDiagnostic } = (await import(
        `${pathToFileURL(formatPath).href}?scratch=${Date.now()}`
      )) as { formatDiagnostic: typeof FormatDiagnostic }

      const extend = { brandBox: { declarations: { color: 'red' } } }
      const text = formatDiagnostic(
        { code: 'unknown-atom', name: 'zzqqxxww', offset: 0, endOffset: 0 },
        { extend },
      )

      expect(text).not.toMatch(/\bbrandBox\b/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
