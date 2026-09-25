/**
 * AC-consumer-constraints-38: every fenced code block in `SKILL.md` compiles/type-checks for
 * real, and carries none of the forms R22 describes only in prose.
 */
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { OUTPUT_PATH } from '../scripts/generate-skill.ts'
import { navePlugin } from '../src/postcss.ts'

function extractFences(markdown: string): Array<{ lang: string; content: string }> {
  return [...markdown.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({
    lang: m[1]!,
    content: m[2]!,
  }))
}

const committed = readFileSync(OUTPUT_PATH, 'utf8')
const fences = extractFences(committed)
const cssFences = fences.filter((f) => f.lang === 'css')

describe('AC-consumer-constraints-38: every css fence compiles through the real navePlugin({ onUnknown: "error" })', () => {
  it('has at least one css fence to check', () => {
    expect(cssFences.length).toBeGreaterThan(0)
  })

  it('compiles with zero warnings, and the output contains no @nave', async () => {
    for (const fence of cssFences) {
      const result = await postcss([navePlugin({ onUnknown: 'error' })]).process(fence.content, {
        from: undefined,
      })
      expect(result.warnings(), fence.content).toHaveLength(0)
      expect(result.css).not.toContain('@nave ')
    }
  })

  it('every var(--nave-*) in any fence names a custom property declared in the tokens/css build output', async () => {
    const { readDeclaredPropertyNames } = await import('../scripts/generate-skill.ts')
    const declared = new Set(readDeclaredPropertyNames())
    for (const fence of [...cssFences]) {
      for (const match of fence.content.matchAll(/var\((--nave-[\w-]+)/g)) {
        expect(declared.has(match[1]!), `${match[1]} in fence`).toBe(true)
      }
    }
  })

  it('every top-level rule in every css fence sits inside @layer components.consumer or @layer overrides', () => {
    for (const fence of cssFences) {
      const root = postcss.parse(fence.content)
      for (const node of root.nodes) {
        if (node.type === 'comment') continue // e.g. the /* button.module.css */ filename comment
        expect(node.type, 'no bare top-level rule outside a layer').toBe('atrule')
        if (node.type === 'atrule') {
          expect(node.name).toBe('layer')
          expect(['components.consumer', 'overrides']).toContain(node.params)
        }
      }
    }
  })

  it('no fence contains a class selector or string literal beginning nave-, or a cx.raw() call on a built-in atom name', async () => {
    const { atomClassMap } = await import('../src/atoms.ts')
    const atomNames = new Set(Object.keys(atomClassMap))
    for (const fence of fences) {
      expect(fence.content).not.toMatch(/\.nave-[\w-]/)
      expect(fence.content).not.toMatch(/['"]nave-[\w-]*['"]/)
      for (const match of fence.content.matchAll(/cx\.raw\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        expect(atomNames.has(match[1]!), `cx.raw('${match[1]}') names a built-in atom`).toBe(false)
      }
      expect(fence.content).not.toMatch(/\bas\s+\w+\s*\)/) // no `as` cast on a cx argument
    }
  })

  /**
   * No fence today contains a `cx(`/`cx.raw(` call at all (the guide's one example fence is
   * CSS), so this AC's `tsc` clause holds VACUOUSLY over the real tree — checked here by
   * asserting the empty set, and self-tested against a detector so the vacuous pass is not
   * mistaken for a detector that never runs.
   */
  it('has no fence containing cx( or cx.raw( today (the tsc clause holds vacuously)', () => {
    const cxFences = fences.filter((f) => /\bcx(\.raw)?\(/.test(f.content))
    expect(cxFences).toEqual([])
  })

  it('the cx( detector used above does find a planted fence calling cx()', () => {
    const planted = [{ lang: 'tsx', content: "cx('interactive')" }]
    expect(planted.filter((f) => /\bcx(\.raw)?\(/.test(f.content))).toHaveLength(1)
  })

  it('no fence contains a template-literal slot whose expression is a logical AND', () => {
    const AND_SLOT = /\$\{[^}]*&&[^}]*\}/
    for (const fence of fences) expect(fence.content).not.toMatch(AND_SLOT)

    // Positive control: the detector does catch the form R22 describes only in prose.
    const planted = '`${isActive && styles.active}`'
    expect(AND_SLOT.test(planted)).toBe(true)
  })
})
