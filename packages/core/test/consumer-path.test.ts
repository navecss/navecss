/**
 * Consumer-path smoke check.
 *
 * C1 shipped a broken entry point that no unit test could have caught: every
 * import in the published CSS graph resolved only from `src/`. This test walks
 * the real export map and the real @import graph the way a consumer's bundler
 * does, so that class of breakage cannot recur.
 *
 * Traceability: C1 (broken entry point), C13 (tokens layer double-wrap).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGES = path.resolve(HERE, '../..')

interface ExportTarget {
  [condition: string]: ExportTarget | string
}

/** Picks the CSS/ESM target out of an export-map entry, honouring conditions. */
function pickTarget(entry: ExportTarget | string): string {
  if (typeof entry === 'string') return entry
  for (const condition of ['style', 'import', 'default']) {
    const value = entry[condition]
    if (value !== undefined) return pickTarget(value)
  }
  throw new Error(`no resolvable condition in ${JSON.stringify(entry)}`)
}

/** Resolves a bare `@navecss/*` specifier through that package's export map. */
function resolveWorkspace(specifier: string): string {
  const [, name, ...rest] = specifier.split('/')
  const packageDir = path.join(PACKAGES, name!)
  const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
    exports: ExportTarget
  }
  const subpath = rest.length > 0 ? `./${rest.join('/')}` : '.'
  const entry = manifest.exports[subpath]
  if (entry === undefined) throw new Error(`${specifier} is not in the export map`)
  return path.join(packageDir, pickTarget(entry))
}

function resolveImport(specifier: string, importerDir: string): string {
  return specifier.startsWith('.')
    ? path.resolve(importerDir, specifier)
    : resolveWorkspace(specifier)
}

const IMPORT_RE = /@import\s+url\(\s*['"]([^'"]+)['"]\s*\)([^;]*);/g

/** Recursively inlines the @import graph, failing loud on a missing target. */
function flatten(file: string, seen = new Set<string>()): string {
  if (seen.has(file)) return ''
  seen.add(file)

  expect(existsSync(file), `${file} does not exist`).toBe(true)
  const css = readFileSync(file, 'utf8')

  return css.replaceAll(IMPORT_RE, (_match, specifier: string) =>
    flatten(resolveImport(specifier, path.dirname(file)), seen),
  )
}

interface CustomPropertyDeclaration {
  /** The declared custom-property name. */
  name: string
  /** Whether any block open at this point is a `prefers-reduced-motion` query. */
  conditional: boolean
}

/**
 * Walks the CSS by brace depth and returns every custom-property declaration with the one
 * fact this file needs about it: whether it sits inside a `prefers-reduced-motion` block.
 *
 * A depth walk rather than a regex, deliberately. The previous version of the duplicate
 * check below hand-counted a brace SHAPE (`\n\s*\}\n\s*\}`) to find the end of a block in
 * a GENERATED file, so collapsing that block's two closing braces onto one line silently
 * moved the cut point past the whole semantic-colour `:root`; and it was unanchored to
 * which block it matched, so the second `prefers-reduced-motion` block in the flattened
 * CSS (reset.css owns one too) was decided by `@import` order.
 */
function scanCustomPropertyDeclarations(css: string): CustomPropertyDeclaration[] {
  const declarations: CustomPropertyDeclaration[] = []
  const openBlocks: string[] = []
  let buffer = ''

  const flush = (): void => {
    const match = /^\s*(--[\w-]+)\s*:/.exec(buffer)
    if (match !== null) {
      declarations.push({
        name: match[1]!,
        conditional: openBlocks.some((prelude) => prelude.includes('prefers-reduced-motion')),
      })
    }
    buffer = ''
  }

  for (const char of css.replaceAll(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      openBlocks.push(buffer.trim())
      buffer = ''
    } else if (char === '}') {
      flush()
      openBlocks.pop()
    } else if (char === ';') {
      flush()
    } else {
      buffer += char
    }
  }

  return declarations
}

describe('C1 — the documented one-line setup resolves end to end', () => {
  const entry = resolveWorkspace('@navecss/core')

  it('resolves @navecss/core to a file that exists', () => {
    expect(existsSync(entry), `${entry} does not exist`).toBe(true)
  })

  it('reaches the atomic layer through the import graph', () => {
    expect(flatten(entry)).toContain('.nave-focus-ring')
  })

  it('reaches the reset and the token custom properties', () => {
    const css = flatten(entry)

    expect(css).toContain('box-sizing: border-box')
    // G1 (spec R26): every custom property Nave emits is
    // prefixed --nave-; the legacy unprefixed --color-* name no longer exists.
    expect(css).toContain('--nave-color-surface-base')
    expect(css).not.toContain('--color-surface-base')
  })

  it('declares the layer order contract before anything else', () => {
    const css = readFileSync(entry, 'utf8')

    // G1 (spec R30a): tokens.defaults, tokens.presets, reset, atomic, ...
    expect(css).toContain(
      '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;',
    )
  })
})

describe('C13 — every self-layered entry point is wrapped exactly once', () => {
  it('does not add layer(tokens.defaults) on top of the token file own @layer tokens.defaults', () => {
    const entry = resolveWorkspace('@navecss/core')
    const tokensCss = readFileSync(resolveWorkspace('@navecss/tokens/css'), 'utf8')

    // tokens.css owns its layer so that standalone consumers of
    // @navecss/tokens/css are layered correctly too. index.css therefore
    // imports it plain; a layer() here would nest it as tokens.defaults.tokens.defaults.
    expect(tokensCss).toContain('@layer tokens.defaults {')
    expect(readFileSync(entry, 'utf8')).not.toMatch(/@import[^;]*tokens\/css[^;]*layer\(/)
  })

  // reset.css and atomic.css are published subpath exports
  // (./reset, ./atomic) and are now self-layered for the same reason
  // tokens.css always was — a consumer importing either one directly, without
  // going through index.css, must still get the layer membership. index.css
  // therefore imports both plain; a layer() keyword there would double-wrap
  // them (reset.reset, atomic.atomic).
  it('self-layers dist/reset.css under @layer reset and imports it plain', () => {
    const entry = resolveWorkspace('@navecss/core')
    const resetCss = readFileSync(resolveWorkspace('@navecss/core/reset'), 'utf8')

    expect(resetCss).toContain('@layer reset {')
    expect(readFileSync(entry, 'utf8')).not.toMatch(/@import[^;]*reset\.css[^;]*layer\(/)
  })

  it('self-layers dist/atomic.css under @layer atomic and imports it plain', () => {
    const entry = resolveWorkspace('@navecss/core')
    const atomicCss = readFileSync(resolveWorkspace('@navecss/core/atomic'), 'utf8')

    expect(atomicCss).toContain('@layer atomic {')
    expect(readFileSync(entry, 'utf8')).not.toMatch(/@import[^;]*atomic\.css[^;]*layer\(/)
  })

  it('reopens tokens.defaults for the G1 colour layer without duplicating any single custom property', () => {
    // G1 (spec R9/R11/R37): the theming pipeline emits its own @layer tokens.defaults
    // block (semantic colour) alongside the DTCG reader's (everything else), both
    // inside dist/tokens.css. Re-opening a named @layer is valid CSS (the blocks
    // merge in encounter order); what matters is no single custom property is
    // declared twice within the SAME unconditional :root, which would make source
    // order decide. A property legitimately gets a SECOND, conditional declaration
    // inside `@media (prefers-reduced-motion: reduce)` (every reducible
    // --nave-motion-duration-* token does this by design, invisible to this
    // check before the match was widened to cover the whole --nave- namespace).
    //
    // That exception used to be a text `replace()` that cut the block out before
    // counting, which made it a caveat rather than a check: whatever sat inside the
    // excised region was never examined by anything (reduced-motion.test.ts only ever
    // matches --nave-motion-duration-\w+, so a non-motion property smuggled in there
    // was invisible to both). It is now stated positively, which is what actually
    // constrains the exception: the names declared more than once are EXACTLY the
    // reducible motion durations, every extra declaration of one is conditional, and
    // nothing else lives in the conditional region at all.
    const css = flatten(resolveWorkspace('@navecss/core'))
    const blocks = css.match(/@layer tokens\.defaults \{/g)
    expect(blocks!.length).toBeGreaterThanOrEqual(1)

    const declarations = scanCustomPropertyDeclarations(css)
    expect(declarations.length).toBeGreaterThan(0)

    const counts = new Map<string, number>()
    for (const { name } of declarations) counts.set(name, (counts.get(name) ?? 0) + 1)
    const byName = (a: string, b: string): number => a.localeCompare(b)
    const declaredTwice = [...counts]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
      .toSorted(byName)
    const conditional = declarations.filter((d) => d.conditional)
    const conditionalNames = [...new Set(conditional.map((d) => d.name))].toSorted(byName)

    // The reducible set is real and non-empty, so neither list can be trivially satisfied
    // by a build that stopped emitting the override altogether.
    expect(conditionalNames.length).toBeGreaterThan(0)
    // Nothing but a reducible motion duration is declared inside the conditional region.
    expect(conditional.filter((d) => !d.name.startsWith('--nave-motion-duration-'))).toEqual([])
    // And the set of names declared more than once is exactly that same set: any other
    // repeated name is a genuine same-:root duplicate and fails here, naming itself.
    expect(declaredTwice).toEqual(conditionalNames)

    for (const name of declaredTwice) {
      const unconditional = declarations.filter((d) => d.name === name && !d.conditional)
      expect(
        unconditional.length,
        `${name} is declared ${unconditional.length} times outside prefers-reduced-motion`,
      ).toBe(1)
    }
  })
})

describe('the @layer order statement is byte-identical across every entry point', () => {
  // A repeated @layer statement is idempotent for names already known, but a
  // second statement that DISAGREES with the first is silently inert (first
  // to load governs, later copies change nothing and report nothing). Every
  // additional copy is another chance to drift into a guarantee that
  // depends on load order, so this is an equality check rather than a
  // per-file presence check (an architecture reviewer's call).
  const ORDER_STATEMENT_RE =
    /@layer tokens\.defaults, tokens\.presets, reset, atomic, components\.nave, components\.consumer, overrides;/

  function extractOrderStatement(css: string, label: string): string {
    const match = ORDER_STATEMENT_RE.exec(css)
    expect(match, `${label} does not contain the @layer order statement`).not.toBeNull()
    return match![0]
  }

  it('agrees across index.css, layers.css, no-tokens.css, reset.css, atomic.css and tokens.css', () => {
    const files: Record<string, string> = {
      'index.css': readFileSync(resolveWorkspace('@navecss/core'), 'utf8'),
      'layers.css': readFileSync(resolveWorkspace('@navecss/core/layers'), 'utf8'),
      'no-tokens.css': readFileSync(resolveWorkspace('@navecss/core/no-tokens'), 'utf8'),
      'reset.css': readFileSync(resolveWorkspace('@navecss/core/reset'), 'utf8'),
      'atomic.css': readFileSync(resolveWorkspace('@navecss/core/atomic'), 'utf8'),
      'tokens.css': readFileSync(resolveWorkspace('@navecss/tokens/css'), 'utf8'),
    }

    const statements = Object.fromEntries(
      Object.entries(files).map(([label, css]) => [label, extractOrderStatement(css, label)]),
    )

    const [firstLabel, firstStatement] = Object.entries(statements)[0]!
    for (const [label, statement] of Object.entries(statements)) {
      expect(statement, `${label} disagrees with ${firstLabel}`).toBe(firstStatement)
    }
  })
})

describe('C4 — color-scheme matches the shipped palette', () => {
  it('is emitted by the tokens layer as light dark, and the reset no longer declares it (G1 spec R25)', () => {
    const reset = readFileSync(resolveWorkspace('@navecss/core/reset'), 'utf8')
    const tokensCss = readFileSync(resolveWorkspace('@navecss/tokens/css'), 'utf8')

    expect(reset).not.toMatch(/color-scheme\s*:/)
    expect(tokensCss).toContain('color-scheme: light dark;')
  })
})
