/**
 * CONSUMER-ATOMS.md's two "Compiles to:" fences claim to show what the PostCSS plugin
 * actually emits. `consumer-atoms-doc.test.ts` checks that the built-in atoms' declarations
 * are present and in order, but not the output's SHAPE: pseudo-class, `@media` and
 * `@container` blocks are nested inside the rule with `&` (ADR 0001, native CSS nesting), not
 * hoisted out as sibling rules, and the doc previously showed the pre-ADR-0001 hoisted form.
 *
 * This test runs the real `navePlugin()` transform on each example's own input fence, with the
 * consumer atom definitions read out of the doc's own "Defining consumer atoms" fences (never
 * retyped here), formats the result with the repository's own Prettier config (the doc's
 * fences are formatted, not raw PostCSS output), and asserts the result is byte-identical to
 * the fence that follows "Compiles to:". Reading the definitions from the doc, rather than a
 * hand-typed copy, is what makes this a real guarantee: a value changed in the doc's
 * definition fence without regenerating its "Compiles to" fence reds this test (see the last
 * `it` below), where a hand-typed copy could not have noticed.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import postcss from 'postcss'
import prettier from 'prettier'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../src/atoms.ts'
import { navePlugin } from '../src/postcss.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const docSrc = readFileSync(path.resolve(HERE, '../CONSUMER-ATOMS.md'), 'utf8')

const PRETTIER_OPTIONS = {
  parser: 'css' as const,
  semi: false,
  singleQuote: true,
  trailingComma: 'all' as const,
  printWidth: 100,
  tabWidth: 2,
}

/** The ```css fence immediately following the first "Compiles to:" label at or after `from`. */
function extractFenceAfter(from: number): { fence: string; end: number } {
  const compilesToIndex = docSrc.indexOf('Compiles to:', from)
  expect(compilesToIndex, 'expected a "Compiles to:" label').not.toBe(-1)
  const fenceStart = docSrc.indexOf('```css', compilesToIndex)
  expect(fenceStart, 'no ```css fence follows "Compiles to:"').not.toBe(-1)
  const contentStart = docSrc.indexOf('\n', fenceStart) + 1
  const fenceEnd = docSrc.indexOf('```', contentStart)
  expect(fenceEnd, 'the ```css fence is never closed').not.toBe(-1)
  return { fence: docSrc.slice(contentStart, fenceEnd), end: fenceEnd }
}

/** The ```css input fence immediately preceding `beforeIndex` (the nearest one above it). */
function extractInputFenceBefore(beforeIndex: number): string {
  const fenceEnd = docSrc.lastIndexOf('```', beforeIndex)
  const fenceStartMarker = docSrc.lastIndexOf('```css', fenceEnd)
  expect(fenceStartMarker, 'expected a ```css input fence before this example').not.toBe(-1)
  const contentStart = docSrc.indexOf('\n', fenceStartMarker) + 1
  return docSrc.slice(contentStart, fenceEnd)
}

/** The ```ts fence immediately following `heading` — one of the doc's own atom definitions. */
function extractTsFenceAfter(heading: string): string {
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
 * Writes `tsSource` to a throwaway file beside this test (so its bare-specifier imports
 * resolve through the workspace's real `node_modules`) and imports it, returning its
 * `myAtoms` export. This is how the doc's own definitions are read rather than retyped: the
 * doc's fence IS the module under test.
 */
async function loadMyAtoms(tsSource: string): Promise<Record<string, AtomDefinition>> {
  const dir = mkdtempSync(path.join(HERE, '.consumer-atoms-doc-fixture-'))
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

/** Strips the doc's leading filename comment (e.g. "button.module.css"): it is a label for
 * the reader, not part of the CSS the plugin is meant to transform. */
function stripFilenameComment(css: string): string {
  return css.replace(/^\s*\/\*[^*]*\*\/\s*\n/, '')
}

async function compile(input: string, extend: Record<string, AtomDefinition>): Promise<string> {
  const result = await postcss([navePlugin({ extend })]).process(stripFilenameComment(input), {
    from: undefined,
  })
  return (await prettier.format(result.css, PRETTIER_OPTIONS)).trimEnd()
}

describe('CONSUMER-ATOMS.md "Compiles to:" fences match the real plugin output', () => {
  it('"Using consumer atoms" example matches the real navePlugin() output, nesting included', async () => {
    const directiveIndex = docSrc.indexOf('@nave interactive focusRing transition primaryButton;')
    expect(directiveIndex, 'the documented directive line is missing').not.toBe(-1)

    const input = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
    const { fence } = extractFenceAfter(directiveIndex)

    const myAtoms = await loadMyAtoms(extractTsFenceAfter('## Defining consumer atoms'))
    const compiled = await compile(input, { primaryButton: myAtoms.primaryButton! })
    expect(compiled).toBe(fence.trimEnd())
  })

  it('the container-query "Usage" example matches the real navePlugin() output, nesting included', async () => {
    const directiveIndex = docSrc.indexOf('@nave adaptiveCard;')
    expect(directiveIndex, 'the documented directive line is missing').not.toBe(-1)

    const input = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
    const { fence } = extractFenceAfter(directiveIndex)

    const myAtoms = await loadMyAtoms(
      extractTsFenceAfter('### Consumer atoms with container queries'),
    )
    const compiled = await compile(input, { adaptiveCard: myAtoms.adaptiveCard! })
    expect(compiled).toBe(fence.trimEnd())
  })

  it('reds when the definition fence changes without the "Compiles to:" fence being regenerated', async () => {
    const directiveIndex = docSrc.indexOf('@nave interactive focusRing transition primaryButton;')
    const input = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
    const { fence } = extractFenceAfter(directiveIndex)

    const mutatedSource = extractTsFenceAfter('## Defining consumer atoms').replace(
      "background: 'var(--nave-color-action-primary-hover)',",
      "background: 'var(--nave-color-feedback-danger)',",
    )
    expect(mutatedSource, 'the mutation target text was not found in the fence').not.toBe(
      extractTsFenceAfter('## Defining consumer atoms'),
    )

    const myAtoms = await loadMyAtoms(mutatedSource)
    const compiled = await compile(input, { primaryButton: myAtoms.primaryButton! })

    // The stale "Compiles to:" fence still shows the un-mutated hover value, so a definition
    // fence edited without regenerating its output fence is caught, not silently accepted.
    expect(compiled).not.toBe(fence.trimEnd())
  })
})
