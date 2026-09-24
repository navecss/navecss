/**
 * R8/R9: direct coverage for `src/package-root.ts`.
 *
 * A review found that `findPackageRoot` had no test in either direction. Its
 * correctness across the two depths was demonstrated only transitively (`facade.test.ts`
 * exercises it from `src/`, `bin.test.ts` from `dist/lib/`), which does establish the
 * property the docblock's "no depth assumption baked in either way" claim needs — but the
 * two ways the walk can END SOMEWHERE THAT IS NOT THIS PACKAGE were unexercised, and both
 * of them fire at MODULE LOAD, structurally outside `bin.ts`'s `try` and so outside R4's
 * exit-code mapping. Every case below plants its own scratch tree; nothing here reads or
 * writes the real package.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { findPackageRoot, OWN_PACKAGE_NAME } from '../src/package-root.ts'

/**
 * A scratch tree shaped exactly like this package as installed: a root `package.json`
 * declaring `OWN_PACKAGE_NAME`, plus the two real depths a module runs from.
 */
function scratchPackage(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'navecss-package-root-'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: OWN_PACKAGE_NAME, type: 'module', version: '0.0.0' }),
  )
  mkdirSync(path.join(root, 'src', 'theming'), { recursive: true })
  mkdirSync(path.join(root, 'dist', 'lib', 'theming'), { recursive: true })
  return root
}

function moduleUrlAt(...segments: string[]): string {
  return pathToFileURL(path.join(...segments)).href
}

describe('findPackageRoot resolves both real depths (AC-token-build-08 covers: R9; R8)', () => {
  it("resolves this package's root from a SOURCE-location module (src/theming/, one level of nesting)", () => {
    const root = scratchPackage()
    expect(findPackageRoot(moduleUrlAt(root, 'src', 'theming', 'tokens-source.ts'))).toBe(root)
  })

  it('resolves the same root from a COMPILED-location module (dist/lib/theming/, one level deeper)', () => {
    const root = scratchPackage()
    expect(findPackageRoot(moduleUrlAt(root, 'dist', 'lib', 'theming', 'tokens-source.js'))).toBe(
      root,
    )
  })

  it('resolves the same root from both depths in one tree — the "no depth assumption either way" property, asserted rather than inferred', () => {
    const root = scratchPackage()
    expect(findPackageRoot(moduleUrlAt(root, 'src', 'facade.ts'))).toBe(
      findPackageRoot(moduleUrlAt(root, 'dist', 'lib', 'facade.js')),
    )
  })
})

describe('findPackageRoot walks past a package.json that is not this package', () => {
  // A review probed this on a real scratch install: with a nearest-ancestor walk,
  // planting `dist/package.json` or `dist/lib/package.json` (the standard dual-publish
  // `{"type":"module"}` marker, which nothing in this repo forbids a later slice from adding)
  // took the compiled bin to exit 1 with a raw `ENOENT` for `<root>/dist/tokens.json` and a
  // Node stack, thrown at module load. Matching on the NAME is what walks past it.
  it.each(['dist', path.join('dist', 'lib')])(
    'a nameless %s/package.json marker does not capture the walk',
    (markerDir) => {
      const root = scratchPackage()
      writeFileSync(path.join(root, markerDir, 'package.json'), JSON.stringify({ type: 'module' }))
      expect(findPackageRoot(moduleUrlAt(root, 'dist', 'lib', 'theming', 'tokens-source.js'))).toBe(
        root,
      )
    },
  )

  it('a nearer package.json belonging to a DIFFERENT package does not capture the walk either', () => {
    const root = scratchPackage()
    writeFileSync(
      path.join(root, 'dist', 'package.json'),
      JSON.stringify({ name: '@navecss/core', type: 'module' }),
    )
    expect(findPackageRoot(moduleUrlAt(root, 'dist', 'lib', 'facade.js'))).toBe(root)
  })

  it('an unparsable nearer package.json is walked past rather than becoming a second failure mode', () => {
    const root = scratchPackage()
    writeFileSync(path.join(root, 'dist', 'package.json'), '{ not json')
    expect(findPackageRoot(moduleUrlAt(root, 'dist', 'lib', 'facade.js'))).toBe(root)
  })
})

describe('findPackageRoot refuses rather than returning a confidently wrong root', () => {
  // The other end of the same defect: bundling `./build` into a consumer's own output moves
  // `import.meta.url` into THEIR tree, where a nearest-ancestor walk succeeds and returns the
  // CONSUMER's root. `attw` reports `./build` green under the `bundler` resolution mode, so
  // this is invited rather than hypothetical. It was never silent (every read then ENOENTs),
  // but the consumer saw a raw ENOENT for a path inside their own project with nothing naming
  // the cause.
  it("throws when no ancestor declares this package's name, naming the cause rather than ENOENT-ing later", () => {
    const consumerRoot = mkdtempSync(path.join(tmpdir(), 'navecss-consumer-'))
    writeFileSync(
      path.join(consumerRoot, 'package.json'),
      JSON.stringify({ name: 'some-consumer-app', type: 'module' }),
    )
    mkdirSync(path.join(consumerRoot, 'build'), { recursive: true })

    expect(() => findPackageRoot(moduleUrlAt(consumerRoot, 'build', 'bundle.js'))).toThrow(
      /bundled into another package's output/,
    )
  })

  it('names the package it was looking for, so the message is actionable without reading this source', () => {
    const consumerRoot = mkdtempSync(path.join(tmpdir(), 'navecss-consumer-'))
    writeFileSync(path.join(consumerRoot, 'package.json'), JSON.stringify({ name: 'app' }))

    expect(() => findPackageRoot(moduleUrlAt(consumerRoot, 'bundle.js'))).toThrow(
      new RegExp(OWN_PACKAGE_NAME.replaceAll('/', String.raw`\/`)),
    )
  })

  it('keeps the remedy beside the constraint, so a reword cannot leave a bare "cannot be bundled"', () => {
    const consumerRoot = mkdtempSync(path.join(tmpdir(), 'navecss-consumer-'))
    writeFileSync(path.join(consumerRoot, 'package.json'), JSON.stringify({ name: 'app' }))

    expect(() => findPackageRoot(moduleUrlAt(consumerRoot, 'bundle.js'))).toThrow(
      /cannot be bundled; import them as external instead/,
    )
  })
})
