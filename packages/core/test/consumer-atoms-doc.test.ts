/**
 * CONSUMER-ATOMS.md's "Using consumer atoms" example ships a hand-written "Compiles to:"
 * fence showing what `@nave interactive focusRing transition primaryButton;` expands to.
 * Nothing checked that fence against the atom map it claims to describe, so it went stale
 * the moment `interactive` gained `-webkit-user-select: none` (the atom map's own fix for
 * the property being inert on WebKit) — the doc kept showing the pre-fix output, claiming
 * the compiler no longer produces what it actually produces.
 *
 * This test extracts the fence and asserts every declaration of the three BUILT-IN atoms
 * named in the directive (`interactive`, `focusRing`, `transition` — `primaryButton` is the
 * doc's own consumer-defined example atom, not part of `atoms.ts`) appears in it, in the
 * atom map's own declaration order, so the next atom-map edit cannot silently stale this
 * doc again.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const docSrc = readFileSync(path.resolve(HERE, '../CONSUMER-ATOMS.md'), 'utf8')

const DIRECTIVE_LINE = '@nave interactive focusRing transition primaryButton;'
const BUILT_IN_ATOMS_IN_DIRECTIVE_ORDER = ['interactive', 'focusRing', 'transition'] as const

/** Extracts the ```css fence that immediately follows "Compiles to:" after the directive. */
function extractCompilesToFence(): string {
  const directiveIndex = docSrc.indexOf(DIRECTIVE_LINE)
  expect(
    directiveIndex,
    'the documented directive line is missing from CONSUMER-ATOMS.md',
  ).not.toBe(-1)

  const compilesToIndex = docSrc.indexOf('Compiles to:', directiveIndex)
  expect(compilesToIndex, 'no "Compiles to:" label follows the directive').not.toBe(-1)

  const fenceStart = docSrc.indexOf('```css', compilesToIndex)
  expect(fenceStart, 'no ```css fence follows "Compiles to:"').not.toBe(-1)
  const contentStart = docSrc.indexOf('\n', fenceStart) + 1
  const fenceEnd = docSrc.indexOf('```', contentStart)
  expect(fenceEnd, 'the ```css fence is never closed').not.toBe(-1)

  return docSrc.slice(contentStart, fenceEnd)
}

/** The fence's first `.root { ... }` rule — the atoms' base `declarations`, not a pseudo/media block. */
function extractRootDeclarations(fenceCss: string): { prop: string; value: string }[] {
  const root = postcss.parse(fenceCss)
  let rootRule: postcss.Rule | undefined
  root.walkRules((rule) => {
    if (rootRule === undefined && rule.selector === '.root') rootRule = rule
  })
  expect(rootRule, 'the fence has no top-level .root rule').toBeDefined()

  return rootRule!.nodes
    .filter((n): n is postcss.Declaration => n.type === 'decl')
    .map((decl) => ({ prop: decl.prop, value: decl.value }))
}

describe('CONSUMER-ATOMS.md "Compiles to:" fence stays in sync with the atom map', () => {
  it('contains every declaration of interactive, focusRing and transition, in atom-map order', () => {
    const fenceCss = extractCompilesToFence()
    const rootDeclarations = extractRootDeclarations(fenceCss)

    // Build the expected sequence straight from the atom map, in the order the directive
    // names the atoms, and within each atom, in the object's own key order.
    const expected: { prop: string; value: string }[] = []
    for (const atomName of BUILT_IN_ATOMS_IN_DIRECTIVE_ORDER) {
      const declarations = atoms[atomName].declarations ?? {}
      for (const [prop, value] of Object.entries(declarations)) {
        expected.push({ prop, value: String(value) })
      }
    }
    // Fixture guard: if the atom map ever ships these three atoms with no base
    // declarations at all, the loop below is vacuously true and proves nothing.
    expect(expected.length).toBeGreaterThan(0)

    let searchFrom = 0
    for (const { prop, value } of expected) {
      const foundAt = rootDeclarations.findIndex(
        (decl, index) => index >= searchFrom && decl.prop === prop && decl.value === value,
      )
      expect(
        foundAt,
        `expected "${prop}: ${value};" at or after position ${searchFrom} in the fence's .root block, found: ${JSON.stringify(rootDeclarations)}`,
      ).toBeGreaterThanOrEqual(searchFrom)
      searchFrom = foundAt + 1
    }
  })

  it('shows no built-in declaration the atom map does not produce (the removal direction)', () => {
    const rootDeclarations = extractRootDeclarations(extractCompilesToFence())

    const expected: { prop: string; value: string }[] = []
    for (const atomName of BUILT_IN_ATOMS_IN_DIRECTIVE_ORDER) {
      const declarations = atoms[atomName].declarations ?? {}
      for (const [prop, value] of Object.entries(declarations)) {
        expected.push({ prop, value })
      }
    }
    expect(expected.length).toBeGreaterThan(0)

    // The compiler emits the directive's atoms in order, so the built-ins occupy the FIRST
    // expected.length declarations of .root and `primaryButton` (the doc's own consumer atom)
    // owns the tail. Equality over that prefix is what the subsequence check above cannot do:
    // it catches a declaration REMOVED from the atom map while the fence keeps advertising it.
    expect(rootDeclarations.slice(0, expected.length)).toEqual(expected)
  })
})
