/**
 * Reads `CONSUMER-ATOMS.md` for the tests that compare its "Compiles to:" fences with what the
 * PostCSS plugin writes: the fence that follows a label, the stylesheet above it, and the doc's
 * own atom definitions, imported from the doc's fences and never retyped. Not a test file and
 * registers no tests.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const docSrc = readFileSync(path.resolve(HERE, '../../CONSUMER-ATOMS.md'), 'utf8')

/**
 * The ```css fence immediately following the first "Compiles to:" label at or after `from`.
 */
export function extractFenceAfter(from: number): { end: number; fence: string } {
  const compilesToIndex = docSrc.indexOf('Compiles to:', from)
  expect(compilesToIndex, 'expected a "Compiles to:" label').not.toBe(-1)
  const fenceStart = docSrc.indexOf('```css', compilesToIndex)
  expect(fenceStart, 'no ```css fence follows "Compiles to:"').not.toBe(-1)
  const contentStart = docSrc.indexOf('\n', fenceStart) + 1
  const fenceEnd = docSrc.indexOf('```', contentStart)
  expect(fenceEnd, 'the ```css fence is never closed').not.toBe(-1)
  return { fence: docSrc.slice(contentStart, fenceEnd), end: fenceEnd }
}

/**
 * The ```css input fence immediately preceding `beforeIndex` (the nearest one above it).
 */
export function extractInputFenceBefore(beforeIndex: number): string {
  const fenceEnd = docSrc.lastIndexOf('```', beforeIndex)
  const fenceStartMarker = docSrc.lastIndexOf('```css', fenceEnd)
  expect(fenceStartMarker, 'expected a ```css input fence before this example').not.toBe(-1)
  const contentStart = docSrc.indexOf('\n', fenceStartMarker) + 1
  return docSrc.slice(contentStart, fenceEnd)
}

/**
 * The ```ts fence immediately following `heading`: one of the doc's own atom definitions.
 */
export function extractTsFenceAfter(heading: string): string {
  const headingIndex = docSrc.indexOf(heading)
  expect(headingIndex, `expected the heading "${heading}"`).not.toBe(-1)
  const fenceStart = docSrc.indexOf('```ts', headingIndex)
  expect(fenceStart, `no \`\`\`ts fence follows "${heading}"`).not.toBe(-1)
  const contentStart = docSrc.indexOf('\n', fenceStart) + 1
  const fenceEnd = docSrc.indexOf('```', contentStart)
  expect(fenceEnd, 'the ```ts fence is never closed').not.toBe(-1)
  return docSrc.slice(contentStart, fenceEnd)
}

/**
 * Writes `tsSource` to a throwaway file beside the tests (so its bare-specifier imports resolve
 * through the workspace's real `node_modules`) and imports it, returning its `myAtoms` export.
 * This is how the doc's own definitions are read rather than retyped: the doc's fence IS the
 * module under test.
 */
export async function loadMyAtoms(tsSource: string): Promise<Record<string, AtomDefinition>> {
  const dir = mkdtempSync(path.join(HERE, '..', '.consumer-atoms-doc-fixture-'))
  const file = path.join(dir, 'atoms.ts')
  writeFileSync(file, tsSource)
  try {
    const mod = (await import(pathToFileURL(file).href)) as {
      myAtoms: Record<string, AtomDefinition>
    }
    return mod.myAtoms
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
