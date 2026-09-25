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
import { realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

import { readSections } from './generate-atoms-doc.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const OUTPUT_PATH = path.resolve(HERE, '../nave.css-data.json')

const NAVE_DESCRIPTION_INTRO =
  'The `@nave` at-rule applies one or more of Nave’s built-in atomic utilities to the CSS ' +
  'rule it appears in. Loading this file stops an editor from reporting `@nave` as an unknown ' +
  'at-rule and shows this description on hover; it does not complete atom names.'

const EXTEND_LINE = 'Atoms registered through `extend` are valid and are not listed here.'

/**
One `- **Section:** \`name\`, \`name\`, ...` markdown list item per section, in `readSections()`'s
order. Atom names are code spans: they are literal, case-sensitive identifiers, `ATOMS.md`
already renders them the same way, and a code span stops the markdown renderer from
interpreting a name containing `_` as emphasis.
 */
function renderAtomSections(): string {
  return [...readSections()]
    .map(([section, names]) => `- **${section}:** ${names.map((name) => `\`${name}\``).join(', ')}`)
    .join('\n')
}

/**
The full `@nave` entry description: what it does, the atom-name sections as a markdown list, then
the `extend` line, as three blocks separated by a blank line.
 */
function renderDescription(): string {
  return [NAVE_DESCRIPTION_INTRO, renderAtomSections(), EXTEND_LINE].join('\n\n')
}

/**
Renders the full `nave.css-data.json` contents, formatted with the repository's own Prettier
config. `description` ships as `MarkupContent` (`kind: 'markdown'`) rather than a plain string, so
an editor renders the section list instead of escaping it into one run-on paragraph.
 */
export async function generate(): Promise<string> {
  const data = {
    version: 1.1,
    atDirectives: [
      {
        name: '@nave',
        description: { kind: 'markdown', value: renderDescription() },
      },
    ],
  }
  return format(JSON.stringify(data, undefined, 2), {
    ...(await resolveConfig(OUTPUT_PATH)),
    parser: 'json',
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
