/**
 * AC-consumer-constraints-38: every fenced code block in `SKILL.md` compiles/type-checks for
 * real, and carries none of the forms R22 describes only in prose.
 */
import type { AtRule } from 'postcss'
import type { Diagnostic } from 'typescript'

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import {
  createProgram,
  getPreEmitDiagnostics,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
} from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

import { OUTPUT_PATH } from '../scripts/generate-skill.ts'
import { navePlugin } from '../src/postcss.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST_CX_PATH = path.resolve(HERE, '../dist/cx.js')

function extractFences(markdown: string): { content: string; lang: string }[] {
  return markdown
    .matchAll(/```(\w+)\n([\s\S]*?)```/g)
    .map((m) => ({
      lang: m[1]!,
      content: m[2]!,
    }))
    .toArray()
}

const SCRIPT_FENCE_LANGS = new Set(['js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'])
const STRING_LITERAL = /(['"`])(?:\\.|(?!\1)[^\\])*\1/g
const CX_CALL = /\bcx(?:\.raw)?\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g

/**
 * Whether a script fence casts a `cx()` or `cx.raw()` argument with `as`. Only the call's own
 * argument list is read, with string literals removed first, so `as` in prose-like strings or
 * anywhere else in the fence is not a cast, and a dotted or generic target
 * (`as React.CSSProperties`, `as Array<string>[number]`) still is.
 */
function hasCxArgumentCast(content: string): boolean {
  return content
    .matchAll(CX_CALL)
    .some((call) => /\bas\s+[A-Za-z_$]/.test(call[1]!.replaceAll(STRING_LITERAL, '')))
}

const committed = readFileSync(OUTPUT_PATH, 'utf8')
const fences = extractFences(committed)
const cssFences = fences.filter((f) => f.lang === 'css')
const scriptFences = fences.filter((f) => SCRIPT_FENCE_LANGS.has(f.lang))

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
      // A comment is not a rule, e.g. the /* button.module.css */ filename comment.
      const nodes = root.nodes.filter((node) => node.type !== 'comment')
      for (const node of nodes) {
        expect(node.type, 'no bare top-level rule outside a layer').toBe('atrule')
        const atRule = node as AtRule
        expect(atRule.name).toBe('layer')
        expect(['components.consumer', 'overrides']).toContain(atRule.params)
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
    }
  })

  it('no script fence casts a cx() or cx.raw() argument with `as`', () => {
    for (const fence of scriptFences) {
      expect(hasCxArgumentCast(fence.content), fence.content).toBe(false)
    }
  })

  it('the cast check catches a dotted or generic cast inside a cx() call', () => {
    expect(hasCxArgumentCast("cx('flex' as React.CSSProperties)")).toBe(true)
    expect(hasCxArgumentCast('cx(name as Array<string>[number])')).toBe(true)
    expect(hasCxArgumentCast('cx.raw(isActive && (styles.active as string))')).toBe(true)
  })

  it('the cast check ignores `as` in a string argument, and CSS is never read as script', () => {
    expect(hasCxArgumentCast("cx.raw('save as draft')")).toBe(false)
    expect(hasCxArgumentCast("const label = 'saved as draft'\ncx('flex')")).toBe(false)
    const planted = extractFences('```css\n.a { content: "as x)"; }\n```\n')
    expect(planted.filter((f) => SCRIPT_FENCE_LANGS.has(f.lang))).toEqual([])
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
function typeCheckAgainstPublishedCx(snippet: string): readonly Diagnostic[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-skill-tsc-'))
  try {
    const file = path.join(dir, 'fixture.ts')
    const relative = path.relative(dir, DIST_CX_PATH).split(path.sep).join('/')
    const importSpecifier = relative.startsWith('.') ? relative : `./${relative}`
    writeFileSync(
      file,
      [`import { cx } from '${importSpecifier}'`, `void (${snippet})`, ''].join('\n'),
    )
    const program = createProgram([file], {
      noEmit: true,
      strict: true,
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    })
    return getPreEmitDiagnostics(program)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('AC-consumer-constraints-38: the tsc clause is a real type-check, never a regex existence-detector', () => {
  const cxFences = fences.filter((f) => /\bcx(\.raw)?\(/.test(f.content))

  // Each planted probe below spins up a real `createProgram` against the published
  // `cx.d.ts` — noticeably slower than the rest of this file's assertions and, under load,
  // close enough to vitest's 5s default to be worth running once rather than once per `it()`.
  let notAnAtomDiagnostics: readonly Diagnostic[]
  let realAtomsDiagnostics: readonly Diagnostic[]

  beforeAll(() => {
    notAnAtomDiagnostics = typeCheckAgainstPublishedCx("cx('not-an-atom')")
    realAtomsDiagnostics = typeCheckAgainstPublishedCx("cx('interactive', 'focusRing')")
  }, 120_000)

  it('every fence containing cx( or cx.raw( type-checks with zero diagnostics against the published cx.d.ts', () => {
    // Vacuous today (no such fence exists), same as the detector-level check above — the
    // mechanism below is what a FUTURE fence calling cx( would actually be run through.
    for (const fence of cxFences) {
      const diagnostics = typeCheckAgainstPublishedCx(fence.content)
      expect(diagnostics, fence.content).toEqual([])
    }
  })

  it('the SAME harness fails a planted fence calling cx with a name that is not an atom (the positive control)', () => {
    expect(notAnAtomDiagnostics.length).toBeGreaterThan(0)
  })

  it('the SAME harness passes a planted fence calling cx with real built-in atom names', () => {
    expect(realAtomsDiagnostics).toEqual([])
  })
})
