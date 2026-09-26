/**
 * AC-consumer-constraints-38: every fenced code block in `SKILL.md` compiles/type-checks for
 * real, and carries none of the forms R22 describes only in prose.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { OUTPUT_PATH } from '../scripts/generate-skill.ts'
import { navePlugin } from '../src/postcss.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST_CX_PATH = path.resolve(HERE, '../dist/cx.js')

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
    // Every fence, not only cssFences: a var(--nave-*) inside a future non-css fence (a tsx
    // template literal, say) is just as much a claim about a declared property, and cssFences
    // would miss it entirely.
    for (const fence of fences) {
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

/**
 * Runs `snippet` through the REAL TypeScript compiler, importing `cx` from this package's own
 * built `dist/cx.js` (whose co-located `dist/cx.d.ts` is exactly what `@navecss/core/cx`
 * publishes), and returns whatever diagnostics come back. This is the harness AC-38's `tsc`
 * clause promises: earlier, the clause was satisfied by a regex existence-detector for
 * `cx(`/`cx.raw(` that never invoked `tsc`, `ts-morph`, or any type-checking API at all — a
 * detector for whether a fence CALLS `cx`, not for whether that call type-checks.
 */
function typeCheckAgainstPublishedCx(snippet: string): readonly ts.Diagnostic[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-skill-tsc-'))
  try {
    const file = path.join(dir, 'fixture.ts')
    const relative = path.relative(dir, DIST_CX_PATH).split(path.sep).join('/')
    const importSpecifier = relative.startsWith('.') ? relative : `./${relative}`
    writeFileSync(
      file,
      [`import { cx } from '${importSpecifier}'`, `void (${snippet})`, ''].join('\n'),
    )
    const program = ts.createProgram([file], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    })
    return ts.getPreEmitDiagnostics(program)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('AC-consumer-constraints-38: the tsc clause is a real type-check, never a regex existence-detector', () => {
  const cxFences = fences.filter((f) => /\bcx(\.raw)?\(/.test(f.content))

  it('every fence containing cx( or cx.raw( type-checks with zero diagnostics against the published cx.d.ts', () => {
    // Vacuous today (no such fence exists), same as the detector-level check above — the
    // mechanism below is what a FUTURE fence calling cx( would actually be run through.
    for (const fence of cxFences) {
      const diagnostics = typeCheckAgainstPublishedCx(fence.content)
      expect(diagnostics, fence.content).toEqual([])
    }
  })

  it('the SAME harness fails a planted fence calling cx with a name that is not an atom (the positive control)', () => {
    const diagnostics = typeCheckAgainstPublishedCx("cx('not-an-atom')")
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('the SAME harness passes a planted fence calling cx with real built-in atom names', () => {
    const diagnostics = typeCheckAgainstPublishedCx("cx('interactive', 'focusRing')")
    expect(diagnostics).toEqual([])
  })
})
