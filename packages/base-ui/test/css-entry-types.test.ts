/**
 * A project that sits where a consumer's does (TypeScript's defaults, no ambient types, bundler
 * resolution) imports the CSS entry points of every published package for their side effect, and
 * has to compile. TypeScript 6 checks a side-effect import by default, so a CSS-only export with no
 * `types` condition is refused with TS2882.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'

const CSS_ENTRY_POINTS = [
  '@navecss/tokens/css',
  '@navecss/core',
  '@navecss/core/layers',
  '@navecss/core/no-tokens',
  '@navecss/core/reset',
  '@navecss/core/atomic',
  '@navecss/core/standalone',
  '@navecss/base-ui/styles.css',
]

const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) rmSync(directory, { force: true, recursive: true })
})

const compile = (source: string): { code: number | null; output: string } => {
  const base = path.join(PACKAGE_DIR, 'test')
  mkdirSync(base, { recursive: true })
  const directory = mkdtempSync(path.join(base, '.css-entry-types-'))
  scratch.push(directory)
  writeFileSync(path.join(directory, 'plain.css'), 'a { color: red }\n')
  writeFileSync(path.join(directory, 'index.ts'), source)
  writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        strict: true,
        target: 'ES2022',
        types: [],
      },
      files: ['index.ts'],
    }),
  )
  const { status, stdout } = spawnSync(
    process.execPath,
    [path.join(PACKAGE_DIR, 'node_modules/typescript/bin/tsc'), '-p', directory],
    { encoding: 'utf8', maxBuffer: 20_000_000 },
  )
  return { code: status, output: stdout }
}

describe('the CSS entry points of the published packages, imported for their side effect', () => {
  it('a stylesheet with no declaration is refused, so the check this file relies on is in force', () => {
    const { code, output } = compile("import './plain.css'\n")
    expect(code).not.toBe(0)
    expect(output).toContain('TS2882')
  })

  it.each(CSS_ENTRY_POINTS)('%s compiles under the default side-effect import check', (entry) => {
    const { code, output } = compile(`import '${entry}'\n`)
    expect({ code, output }).toEqual({ code: 0, output: '' })
  })
})
