/**
 * Generates `nave.css-data.json`: a VS Code CSS custom-data file (format version 1.1) declaring
 * the `@nave` at-rule. An editor that loads it stops reporting `@nave` as an unknown at-rule and
 * shows this file's `description` on hover over `@nave`; it completes no atom name, since
 * argument completion needs an editor extension this file does not provide.
 *
 * The atom-name list inside the description is read from `src/atoms.ts` through the same section
 * walk `generate-atoms-doc.ts` performs for `ATOMS.md` (`readSections`), so the two documents
 * cannot list a different atom set and neither has to re-type it.
 *
 * Run: node scripts/generate-css-data.ts  (writes nave.css-data.json)
 * Checked for drift by test/css-data-drift.test.ts, which imports `generate` and diffs it
 * against the committed file rather than re-deriving the rule.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

import type { AtomName } from '../src/atoms.ts'

import { readSections } from './generate-atoms-doc.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const OUTPUT_PATH = path.resolve(HERE, '../nave.css-data.json')

const NAVE_DESCRIPTION_INTRO =
  'The `@nave` at-rule applies one or more of Nave’s built-in atomic utilities to the CSS ' +
  'rule it appears in. Loading this file stops an editor from reporting `@nave` as an unknown ' +
  'at-rule and shows this description on hover; it does not complete atom names.'

const EXTEND_LINE = 'Atoms registered through `extend` are valid and are not listed here.'

/**
 * Every built-in atom name the description lists, in the same section groups and order as
 * `ATOMS.md` (`readSections()`), flattened. Exported so a test can assert this set against
 * `Object.keys(atoms)` without re-parsing the rendered description text.
 */
export function listedAtomNames(): AtomName[] {
  return readSections().values().toArray().flat()
}

/**
One `Section: name, name, ...` line per section, in `readSections()`'s order.
 */
function renderAtomSections(): string {
  return [...readSections()].map(([section, names]) => `${section}: ${names.join(', ')}`).join('\n')
}

/**
The full `@nave` entry description: what it does, the atom-name sections, then the `extend` line.
 */
function renderDescription(): string {
  return [NAVE_DESCRIPTION_INTRO, '', renderAtomSections(), '', EXTEND_LINE].join('\n')
}

/**
Renders the full `nave.css-data.json` contents, formatted with the repository's own Prettier
config.
 */
export async function generate(): Promise<string> {
  const data = {
    version: 1.1,
    atDirectives: [
      {
        name: '@nave',
        description: renderDescription(),
      },
    ],
  }
  return format(JSON.stringify(data, undefined, 2), {
    ...(await resolveConfig(OUTPUT_PATH)),
    parser: 'json',
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUTPUT_PATH, await generate())
  console.log(`Wrote ${OUTPUT_PATH}`)
}
