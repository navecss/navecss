/**
 * Generates `ATOMS.md`: every built-in atom, grouped by the section comments `src/atoms.ts`
 * already uses, in source order. Declarations and pseudo/media/container keys come from the
 * live `atoms` object (`src/atoms.ts`), never re-typed, so a change to an atom's shape cannot
 * silently leave the doc stale; section membership and atom order come from the source FILE
 * TEXT, because that grouping exists only as a comment and carries no runtime trace.
 *
 * Run: node scripts/generate-atoms-doc.ts  (writes ATOMS.md)
 * Checked for drift by test/atoms-doc-drift.test.ts, which imports `generate` and diffs it
 * against the committed file rather than re-deriving the rule.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

import { type AtomDefinition, type AtomName, atoms, toClassName } from '../src/atoms.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ATOMS_SRC = path.resolve(HERE, '../src/atoms.ts')
export const OUTPUT_PATH = path.resolve(HERE, '../ATOMS.md')

const SECTION_HEADING = /^\s*\/\/ ── (.+?) ─+$/
const ATOM_KEY = /^ {2}(\w+): \{$/

/**
 * Thrown by `readSections()` when the atom names its section walk collected do not match
 * `Object.keys(atoms)` exactly. The walk reads a comment-and-indentation shape from source
 * TEXT, not the runtime object, so an atom written outside that shape (a quoted key, a key
 * sharing a line, a key before any section heading) is invisible to it; refusing here is what
 * stops `generate()` from silently emitting an `ATOMS.md` with fewer rows than atoms shipped.
 */
export class AtomsDocSectionMismatchError extends Error {
  constructor(missing: readonly string[], extra: readonly string[]) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`missing from a section: ${missing.join(', ')}`)
    if (extra.length > 0) parts.push(`sectioned but not a live atom: ${extra.join(', ')}`)
    super(
      `generate-atoms-doc: sectioned atom names do not match Object.keys(atoms) (${parts.join('; ')})`,
    )
    this.name = 'AtomsDocSectionMismatchError'
  }
}

/**
 * Cross-checks the atom names a section walk collected against the live atom names, throwing
 * `AtomsDocSectionMismatchError` on any mismatch. Split out of `readSections()` so that walk
 * stays a plain line-by-line parse; this is the one piece that reasons about the RESULT.
 */
function assertSectionsMatchLiveAtoms(
  sections: ReadonlyMap<string, readonly AtomName[]>,
  liveNames: readonly string[],
): void {
  const sectioned = new Set<string>(sections.values().toArray().flat())
  const live = new Set<string>(liveNames)
  const missing = live.difference(sectioned)
  const extra = sectioned.difference(live)
  if (missing.size > 0 || extra.size > 0) {
    throw new AtomsDocSectionMismatchError([...missing], [...extra])
  }
}

/**
 * Walks `src/atoms.ts` between the `atoms = {` opening and its closing `} as const...` line,
 * grouping each top-level atom key under the nearest preceding `// ── Section ──` comment, in
 * source order. This is the one piece of information the runtime `atoms` object cannot carry:
 * section membership is a comment, not a value. Because the walk sees TEXT, not the object, it
 * ends by cross-checking what it collected against `liveNames`
 * (`assertSectionsMatchLiveAtoms`) rather than let a table silently come up short.
 *
 * `sourceText` and `liveNames` default to the real file and the real `atoms` object; a test
 * can pass its own to exercise the refusal without touching either.
 */
export function readSections(
  sourceText: string = readFileSync(ATOMS_SRC, 'utf8'),
  liveNames: readonly string[] = Object.keys(atoms),
): Map<string, AtomName[]> {
  const lines = sourceText.split('\n')
  const startIndex = lines.findIndex((line) => line.trim() === 'export const atoms = {')
  const endIndex = lines.findIndex(
    (line, i) => i > startIndex && line.includes('as const satisfies'),
  )
  if (startIndex === -1 || endIndex === -1) {
    throw new Error('generate-atoms-doc: could not locate the `atoms = { ... }` block in atoms.ts')
  }

  const sections = new Map<string, AtomName[]>()
  let currentSection = ''
  const atomsBlockLines = lines.slice(startIndex + 1, endIndex)
  for (const line of atomsBlockLines) {
    const heading = SECTION_HEADING.exec(line)
    if (heading) {
      currentSection = heading[1]!
      if (!sections.has(currentSection)) sections.set(currentSection, [])
      continue
    }
    const key = ATOM_KEY.exec(line)
    if (key) {
      if (currentSection === '') {
        throw new Error(`generate-atoms-doc: atom "${key[1]}" precedes any section heading`)
      }
      sections.get(currentSection)!.push(key[1] as AtomName)
    }
  }

  assertSectionsMatchLiveAtoms(sections, liveNames)
  return sections
}

/**
The atom's base declarations as inline-code `prop: value;` entries, `<br>`-joined. Exported so
`generate-skill.ts` renders the same atom entries in `SKILL.md` without re-typing this shape
(AC-consumer-constraints-32: identical in content to `ATOMS.md`'s row).
 */
export function renderDeclarations(declarations: Record<string, string>): string {
  const entries = Object.entries(declarations)
  if (entries.length === 0) return '—'
  return entries.map(([prop, value]) => `\`${prop}: ${value};\``).join('<br>')
}

/**
One variant entry: its selector/condition beside the declarations it applies, so a reader never
has to cross-reference `atoms.ts` to see what a `:focus-visible` or `@media` variant actually
does (a selector-only list previously let `focusRing`'s row show its resting `outline: none;`
with no hint that the `:focus-visible` variant restores it).
 */
function renderVariantEntry(selector: string, declarations: Record<string, string>): string {
  return `\`${selector}\` — ${renderDeclarations(declarations)}`
}

/**
Every variant entry a `media`/`container` block of `kind` (`@media` or `@container`) contributes:
the block's own entry, THEN one entry per pseudo-class nested inside it (selector
`` `${kind} ${query} ${pseudo}` ``). The block's own entry is skipped when it has no declarations
and DOES have nested pseudos, so a block that exists only to hold pseudos never emits an empty
`— —` row.
 */
function renderMediaBlockVariants(
  kind: '@container' | '@media',
  blocks: NonNullable<AtomDefinition['media']>,
): string[] {
  const parts: string[] = []
  for (const [query, block] of Object.entries(blocks)) {
    const hasDeclarations = Object.keys(block.declarations ?? {}).length > 0
    if (hasDeclarations || !block.pseudos) {
      parts.push(renderVariantEntry(`${kind} ${query}`, block.declarations ?? {}))
    }
    if (block.pseudos) {
      parts.push(
        ...Object.entries(block.pseudos).map(([pseudo, declarations]) =>
          renderVariantEntry(`${kind} ${query} ${pseudo}`, declarations),
        ),
      )
    }
  }
  return parts
}

/**
The atom's pseudo-class, `@media` and `@container` variants — including a pseudo-class nested
inside a `media`/`container` block — each beside the declarations it applies, `<br>`-joined.
 */
export function renderVariants(atom: AtomDefinition): string {
  const parts: string[] = []
  if (atom.pseudos) {
    parts.push(
      ...Object.entries(atom.pseudos).map(([selector, declarations]) =>
        renderVariantEntry(selector, declarations),
      ),
    )
  }
  if (atom.media) parts.push(...renderMediaBlockVariants('@media', atom.media))
  if (atom.container) parts.push(...renderMediaBlockVariants('@container', atom.container))
  return parts.length === 0 ? '—' : parts.join('<br>')
}

const PAIRING_NOTES: Partial<Record<AtomName, string>> = {
  truncate:
    'pairs with `minW0` on a flex or grid child, or the text never has a width to truncate against',
}

/**
Renders the full `ATOMS.md` markdown, formatted with the repository's own Prettier config.
 */
export async function generate(): Promise<string> {
  const sections = readSections()
  const lines: string[] = [
    '# ATOMS.md',
    '',
    'Generated from `src/atoms.ts`; do not edit by hand.',
    '',
    'Every built-in atom Nave ships: the name as written in `@nave` and `cx()`, the global class',
    'it emits, the declarations it applies, and its pseudo-class, `@media` or `@container`',
    'variants, if any.',
    '',
  ]

  for (const [section, names] of sections) {
    lines.push(
      `## ${section}`,
      '',
      '| Atom | Class | Declarations | Variants |',
      '| ---- | ----- | ------------ | -------- |',
    )
    for (const name of names) {
      const atom: AtomDefinition = atoms[name]
      lines.push(
        `| \`${name}\` | \`${toClassName(name)}\` | ${renderDeclarations(atom.declarations)} | ${renderVariants(atom)} |`,
      )
    }
    lines.push('')
  }

  const pairingNotes = Object.entries(PAIRING_NOTES)
  if (pairingNotes.length > 0) {
    lines.push('## Pairing notes', '')
    for (const [name, note] of pairingNotes) {
      lines.push(`- \`${name}\`: ${note}`)
    }
    lines.push('')
  }

  const markdown = `${lines.join('\n').trimEnd()}\n`
  return format(markdown, {
    ...(await resolveConfig(OUTPUT_PATH)),
    parser: 'markdown',
  })
}

// Compare REALPATHS rather than a raw `file://` URL built from process.argv[1] (that older form
// silently writes nothing under a spaced or symlinked invocation path; see build-css.ts's isMain
// for the full rationale).
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

if (isMain) {
  writeFileSync(OUTPUT_PATH, await generate())
  console.log(`Wrote ${OUTPUT_PATH}`)
}
