import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DIST_DIR, filesUnder, manifest, readDist, SRC_DIR } from './support/dist.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import { SUBPATHS } from './support/subpaths.ts'

const byName = (a: string, b: string): number => a.localeCompare(b)

/**
 * Whether a module's first statement is the `'use client'` directive: leading whitespace and
 * comments are skipped one at a time, so no pattern has to match across them.
 */
const hasDirective = (code: string): boolean => {
  let rest = code.trimStart()
  while (rest.startsWith('//') || rest.startsWith('/*')) {
    const end = rest.startsWith('//') ? rest.indexOf('\n') : rest.indexOf('*/') + 1
    rest = end <= 0 ? '' : rest.slice(end + 1).trimStart()
  }
  return /^(['"])use client\1/.test(rest)
}

describe("AC-base-ui-bridge-13: 'use client' survives, per file", () => {
  const sources = filesUnder(SRC_DIR, ['.ts', '.tsx'])
  const built = filesUnder(DIST_DIR, ['.js'])

  it('has exactly one built module for every source module, at the same path', () => {
    expect(built.toSorted(byName)).toEqual(
      sources.map((file) => file.replace(/\.tsx?$/, '.js')).toSorted(byName),
    )
  })

  it('begins every built module with the directive', () => {
    expect(built.filter((file) => !hasDirective(readDist(file)))).toEqual([])
  })

  it('control: the same source bundled with esbuild loses the directive', async () => {
    // A consumer's entry that imports the package: the modules' own directives are not the
    // bundle's, which is what a bundler that merges the files does to them.
    const result = await build({
      absWorkingDir: PACKAGE_DIR,
      bundle: true,
      stdin: {
        contents: `export { Dialog } from ${JSON.stringify(path.join(DIST_DIR, 'dialog/index.js'))}`,
        resolveDir: PACKAGE_DIR,
      },
      external: ['react', 'react-dom', '@base-ui/react', '@base-ui/react/*'],
      format: 'esm',
      logLevel: 'silent',
      write: false,
    })
    const text = result.outputFiles[0]?.text ?? ''
    expect(hasDirective(text)).toBe(false)
  })
})

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g

const importsOf = (code: string): string[] =>
  code
    .matchAll(IMPORT_SPECIFIER)
    .map((match) => match[2] ?? '')
    .toArray()

/**
 * A subpath of Base UI that this package wraps: one of the 23 v1 components. Base UI exports 21
 * more besides its root and internals (hooks, utilities and types, and components this package
 * does not wrap), and a wrapper has no reason to import any of them.
 */
const isComponentSubpath = (specifier: string): boolean =>
  SUBPATHS.some((subpath) => specifier === `@base-ui/react/${subpath}`)

/**
 * The specifiers that reach into Base UI beyond the subpaths this package wraps.
 */
const nonPublicBaseUiImports = (code: string): string[] =>
  importsOf(code).filter(
    (specifier) => specifier.startsWith('@base-ui/react') && !isComponentSubpath(specifier),
  )

const hash = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

describe('AC-base-ui-bridge-36: provenance and packaging', () => {
  const built = filesUnder(DIST_DIR, ['.js'])

  it('imports Base UI only through the subpaths it wraps', () => {
    expect(built.flatMap((file) => nonPublicBaseUiImports(readDist(file)))).toEqual([])
  })

  it('names no module of Base UI beyond the subpaths it wraps in any declaration either', () => {
    const declarations = filesUnder(DIST_DIR, ['.d.ts'])
    const reached = declarations.flatMap((file) =>
      readDist(file)
        .matchAll(/@base-ui\/react(?:\/[\w./-]*)?/g)
        .map((match) => match[0])
        .filter((specifier) => !isComponentSubpath(specifier))
        .toArray(),
    )
    expect(reached).toEqual([])
  })

  it('carries no source of Base UI or React: they are imported, never inlined', () => {
    const inlined = built.filter((file) =>
      /useRenderElement|react\.element|react\.transitional/.test(readDist(file)),
    )
    expect(inlined).toEqual([])
  })

  it('is licensed MIT, with a LICENSE byte-identical to the repository LICENSE', () => {
    expect(manifest().license).toBe('MIT')
    expect(hash(path.join(PACKAGE_DIR, 'LICENSE'))).toBe(
      hash(path.join(PACKAGE_DIR, '../../LICENSE')),
    )
  })

  it('control: a planted internal import is reported', () => {
    expect(
      nonPublicBaseUiImports(
        "import { useRenderElement } from '@base-ui/react/internals/useRenderElement'",
      ),
    ).toEqual(['@base-ui/react/internals/useRenderElement'])
  })

  it.each(['unstable-use-media-query', 'merge-props', 'use-render', 'types', 'csp-provider'])(
    'control: a planted import of the subpath %s, which this package does not wrap, is reported',
    (subpath) => {
      expect(nonPublicBaseUiImports(`export { thing } from '@base-ui/react/${subpath}'`)).toEqual([
        `@base-ui/react/${subpath}`,
      ])
    },
  )

  it('control: a planted import of a subpath this package wraps is not reported', () => {
    expect(nonPublicBaseUiImports("import { Dialog } from '@base-ui/react/dialog'")).toEqual([])
  })
})

describe('AC-base-ui-bridge-05: no declaration names a class', () => {
  it('has no class name and no atom name in any built declaration file', () => {
    const declarations = filesUnder(DIST_DIR, ['.d.ts'])
    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.filter((file) => /nave-base-ui-|baseUi[A-Z]/.test(readDist(file)))).toEqual(
      [],
    )
  })
})

describe('AC-base-ui-bridge-40: the built package loads through require() (ADR 0007)', () => {
  it('requires a subpath of the built package and yields the Dialog namespace', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['-e', "process.stdout.write(Object.keys(require('@navecss/base-ui/dialog')).join())"],
      { cwd: PACKAGE_DIR },
    )
    expect(stdout).toBe('Dialog')
  })
})
