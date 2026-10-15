import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DIST_DIR, filesUnder, manifest, readDist, SRC_DIR } from './support/dist.ts'
import { FEEDBACK_SUBPATHS } from './support/feedback-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import { COMPLETION_SUBPATHS, SINGLE_COMPONENT, SUBPATHS } from './support/subpaths.ts'

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

describe("AC-base-ui-bridge-13, AC-base-ui-overlay-completion-43 and AC-base-ui-feedback-navigation-46: 'use client' survives, per file", () => {
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

  it('has a source module and a built module with the directive for the index and the parts of each of the six', () => {
    const modules = COMPLETION_SUBPATHS.flatMap((subpath) => [
      `${subpath}/index`,
      `${subpath}/parts.generated`,
    ])
    expect(modules.filter((module) => !sources.includes(`${module}.ts`))).toEqual([])
    expect(modules.filter((module) => !built.includes(`${module}.js`))).toEqual([])
    expect(
      modules.filter((module) => {
        const file = `${module}.js`
        return built.includes(file) && !hasDirective(readDist(file))
      }),
    ).toEqual([])
    expect(SINGLE_COMPONENT.has('menubar')).toBe(true)
  })

  it('AC-base-ui-feedback-navigation-46: has a source module, a built module with the directive and a declaration file for the index and the parts of each of the seven', () => {
    const declarations = filesUnder(DIST_DIR, ['.d.ts'])
    const modules = FEEDBACK_SUBPATHS.flatMap((subpath) => [
      `${subpath}/index`,
      `${subpath}/parts.generated`,
    ])
    expect(modules).toHaveLength(14)
    expect(modules.filter((module) => !sources.includes(`${module}.ts`))).toEqual([])
    expect(modules.filter((module) => !built.includes(`${module}.js`))).toEqual([])
    expect(modules.filter((module) => !declarations.includes(`${module}.d.ts`))).toEqual([])
    expect(
      modules.filter((module) => {
        const file = `${module}.js`
        return built.includes(file) && !hasDirective(readDist(file))
      }),
    ).toEqual([])
    // The source modules begin with the directive too: the build keeps what the source has.
    expect(
      modules.filter(
        (module) =>
          sources.includes(`${module}.ts`) &&
          !hasDirective(readFileSync(path.join(SRC_DIR, `${module}.ts`), 'utf8')),
      ),
    ).toEqual([])
  })

  it('control: a module whose first statement is not the directive is reported', () => {
    expect(hasDirective("'use client'\nexport const a = 1")).toBe(true)
    expect(hasDirective("/* generated */\n'use client'\nexport const a = 1")).toBe(true)
    expect(hasDirective("export const a = 1\n'use client'")).toBe(false)
  })

  it('AC-base-ui-feedback-navigation-46, control: the seven bundled with esbuild lose the directive', async () => {
    const result = await build({
      absWorkingDir: PACKAGE_DIR,
      bundle: true,
      stdin: {
        contents: `export { Toast } from ${JSON.stringify(path.join(DIST_DIR, 'toast/index.js'))}`,
        resolveDir: PACKAGE_DIR,
      },
      external: ['react', 'react-dom', '@base-ui/react', '@base-ui/react/*'],
      format: 'esm',
      logLevel: 'silent',
      write: false,
    })
    expect(hasDirective(result.outputFiles[0]?.text ?? '')).toBe(false)
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
 * A subpath of Base UI that this package wraps: one of the 36 components (the seven of the feedback
 * and navigation release among them). Base UI exports more
 * besides its root and internals (21 at 1.8.0, 20 at the 1.3.0 floor: hooks, utilities and types,
 * and components this package does not wrap), and a wrapper has no reason to import any of them.
 */
const isComponentSubpath = (specifier: string): boolean =>
  [...SUBPATHS, ...FEEDBACK_SUBPATHS].some((subpath) => specifier === `@base-ui/react/${subpath}`)

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
