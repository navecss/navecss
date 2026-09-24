/**
 * `.` carried `types`/`style`/`import` and no `default`, so a resolver whose condition set has
 * neither `import` nor `style` — `require()`'s own default set, and the class of bundler this
 * was measured against with esbuild — finds no matching condition and refuses the package
 * outright. `./package.json` and `./tokens.json` were absent from `exports` entirely, so a
 * subpath lookup for either threw the same way.
 *
 * Resolved via Node's own self-reference algorithm (`createRequire` rooted at this package's
 * own `package.json`), which walks the real `exports` map with no bundler in the loop — the
 * standards-based form of the esbuild/`require.resolve` measurement this fix responds to, and
 * the same mechanism `js-entry-loads.test.ts` already trusts for `import`-condition subpaths.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..')
const req = createRequire(path.join(PACKAGE_ROOT, 'package.json'))

describe('the bare specifier resolves under a `require`-only (no `import`/`style`) condition set', () => {
  it('`@navecss/tokens` resolves to the JS entry, not ERR_PACKAGE_PATH_NOT_EXPORTED', () => {
    expect(() => req.resolve('@navecss/tokens')).not.toThrow()
    expect(req.resolve('@navecss/tokens')).toBe(path.join(PACKAGE_ROOT, 'dist', 'tokens.js'))
  })
})

describe('resolver-machinery subpaths are reachable', () => {
  it('`@navecss/tokens/package.json` resolves to the real manifest', () => {
    expect(req.resolve('@navecss/tokens/package.json')).toBe(
      path.join(PACKAGE_ROOT, 'package.json'),
    )
  })

  it('`@navecss/tokens/tokens.json` resolves to the shipped rung-5 source', () => {
    expect(req.resolve('@navecss/tokens/tokens.json')).toBe(path.join(PACKAGE_ROOT, 'tokens.json'))
  })
})

describe('every JS subpath resolves under a `require`-only condition set', () => {
  it('`@navecss/tokens/js` resolves to the JS entry', () => {
    expect(req.resolve('@navecss/tokens/js')).toBe(path.join(PACKAGE_ROOT, 'dist', 'tokens.js'))
  })

  it('`@navecss/tokens/breakpoints` resolves to the breakpoints entry', () => {
    expect(req.resolve('@navecss/tokens/breakpoints')).toBe(
      path.join(PACKAGE_ROOT, 'dist', 'breakpoints.js'),
    )
  })

  it('`@navecss/tokens/build` resolves to the build facade', () => {
    expect(req.resolve('@navecss/tokens/build')).toBe(
      path.join(PACKAGE_ROOT, 'dist', 'lib', 'facade.js'),
    )
  })
})

describe('the export map is internally consistent', () => {
  it('every object entry with an `import` condition also carries a matching `default`', () => {
    const pkg = req('@navecss/tokens/package.json') as {
      exports: Record<string, unknown>
    }

    const conditional = Object.entries(pkg.exports).filter(
      (pair): pair is [string, { default?: string; import: string }] =>
        typeof pair[1] === 'object' && pair[1] !== null && 'import' in pair[1],
    )
    const mismatched = conditional
      .filter(([, entry]) => entry.default !== entry.import)
      .map(([key]) => key)

    expect(conditional.map(([key]) => key)).toContain('.')
    expect(mismatched).toEqual([])
  })
})

describe('the bare specifier stays loadable, not just resolvable', () => {
  it('requiring the resolved path returns a module whose `tokens` export is defined', () => {
    const resolved = req.resolve('@navecss/tokens')
    const mod = req(resolved) as { tokens?: unknown }
    expect(mod.tokens).toBeDefined()
  })
})

describe('the root export never resolves to a stylesheet', () => {
  it("no condition value under exports['.'] ends in .css", () => {
    const pkg = req('@navecss/tokens/package.json') as {
      exports: { '.': Record<string, string> }
    }

    const rootConditions = Object.entries(pkg.exports['.'])

    for (const [condition, value] of rootConditions) {
      expect(value.endsWith('.css'), `${condition} points at ${value}`).toBe(false)
    }
  })

  it('`@navecss/tokens/css` resolves to the generated stylesheet', () => {
    expect(req.resolve('@navecss/tokens/css')).toBe(path.join(PACKAGE_ROOT, 'dist', 'tokens.css'))
  })
})

describe('the JS entry names the stylesheet import a CSS tool would otherwise miss', () => {
  it('the second line of the built `dist/tokens.js` points a misresolving CSS tool at `@navecss/tokens/css`', () => {
    const built = readFileSync(path.join(PACKAGE_ROOT, 'dist', 'tokens.js'), 'utf8')
    const secondLine = built.split('\n', 2)[1]

    expect(secondLine?.startsWith('//')).toBe(true)
    expect(secondLine).toContain("@import '@navecss/tokens/css'")
  })
})
