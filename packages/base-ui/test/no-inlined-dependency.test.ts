import { readFileSync } from 'node:fs'
/**
 * AC-base-ui-bridge-36 covers: R10.
 *
 * No build inlines a third-party dependency. This package compiles with `tsc`, one output file per
 * source file, so nothing is bundled and the property holds by construction; this test is what
 * keeps it true. It reads every external (non-relative, non-Node-builtin) import specifier out of
 * `src/` and asserts each one is still a live `from '<specifier>'` import in the built `dist/*.js`.
 * A type-only import is erased on purpose and is not read. The check is generic, so a new external
 * import in `src/` is covered the day it lands.
 */
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DIST_DIR, filesUnder, readDist, SRC_DIR } from './support/dist.ts'

// A value import or export: `import type` is left out, since it leaves no import in the output.
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?!\s+type\b)(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g

const isExternal = (specifier: string): boolean =>
  !specifier.startsWith('.') &&
  !specifier.startsWith('/') &&
  !isBuiltin(specifier.startsWith('node:') ? specifier.slice(5) : specifier)

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

const specifiersIn = (file: string): string[] =>
  readFileSync(path.join(SRC_DIR, file), 'utf8')
    .matchAll(IMPORT_RE)
    .map((match) => match[1] ?? '')
    .filter((specifier) => isExternal(specifier))
    .toArray()

const sourceSpecifiers = [
  ...new Set(filesUnder(SRC_DIR, ['.ts']).flatMap((file) => specifiersIn(file))),
].toSorted((a, b) => a.localeCompare(b))

const distText = filesUnder(DIST_DIR, ['.js'])
  .map((file) => readDist(file))
  .join('\n')

describe('AC-base-ui-bridge-36: no build inlines a third-party dependency', () => {
  it('has external imports to guard: React and the Base UI subpaths', () => {
    expect(sourceSpecifiers).toContain('react')
    expect(sourceSpecifiers.some((specifier) => specifier.startsWith('@base-ui/react/'))).toBe(true)
  })

  it.each(sourceSpecifiers)('keeps "%s" external in dist/, never inlined', (specifier) => {
    expect(distText).toMatch(new RegExp(String.raw`from\s*['"]${escapeRegExp(specifier)}['"]`))
  })
})
