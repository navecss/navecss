/**
 * Traceability: C5 (invalid @property registrations).
 *
 * A registered custom property with a non-universal syntax is dropped whole by
 * the browser unless its initial-value is computationally independent. rem is
 * not: it resolves against the root font size. Registering those anyway made
 * the file's own "type safety" claim false for every font-size token.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/tokens.css')
const css = readFileSync(CSS, 'utf8')

const registrations = css
  .matchAll(/@property (--[\w-]+) \{([^}]*)\}/g)
  .map(([, name, body]) => ({ body: body!, name: name! }))
  .toArray()

describe('C5 — @property registrations are valid or absent', () => {
  it('registers no colour OUTPUT: --nave-color-tint is the one legal registered colour, and it is an INPUT (G1/R13)', () => {
    // The rename to `--nave-`-prefixed names made the old predicate (no registration
    // starting `--color-`) vacuous: every registration starts `--nave-` now, so it was
    // trivially true for all of them and the clause this test's own title claims — never
    // a colour OUTPUT — was asserted by nothing. The live shape of that clause is a
    // registration in the `--nave-color-` namespace that is not the tint input.
    const colourOutputs = registrations
      .map((r) => r.name)
      .filter((name) => name.startsWith('--nave-color-') && name !== '--nave-color-tint')
    expect(colourOutputs).toEqual([])
  })

  it('registers no legacy unprefixed name at all (R26: every emitted custom property carries --nave-)', () => {
    expect(registrations.every((r) => r.name.startsWith('--nave-'))).toBe(true)
  })

  it('gives every registration an initial-value', () => {
    for (const { body, name } of registrations) {
      expect(body, `${name} has no initial-value`).toContain('initial-value:')
    }
  })

  it('never registers a syntax it cannot give an initial-value for', () => {
    expect(css).not.toContain("syntax: '*'")
  })

  it('never uses a font-relative initial-value', () => {
    for (const { body, name } of registrations) {
      expect(body, `${name} initial-value is font-relative`).not.toMatch(
        /initial-value:[^;]*\d(rem|em|ex|ch|lh)\b/,
      )
    }
  })

  it('drops the font-size tokens from registration but keeps the custom properties', () => {
    expect(registrations.some((r) => r.name.startsWith('--nave-font-size-'))).toBe(false)
    expect(css).toContain('--nave-font-size-md:')
  })
})
