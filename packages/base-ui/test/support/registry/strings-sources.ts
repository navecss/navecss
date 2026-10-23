/**
 * The strings of the package README, the CLI and the repository's docs that the criteria read:
 * the "Copy a component" section, the override ladder's third step, the CLI's two lines, and
 * the cleared lines of the CLI.
 */
import type { LabeledString } from './strings-tripwire.ts'

import { readReadme } from '../readme.ts'
import { cleared } from './cleared.ts'
import { cliNotYetOf, helpLinesOf } from './strings-shipped.ts'
import { sectionOf } from './strings-text.ts'

export const COPY_HEADING = '## Copy a component into your project'

/**
 * The README's "Copy a component into your project" section, from its heading to the next `## `
 * heading. Undefined while the README lacks it.
 */
export const copySectionOf = (readme: string): string | undefined => sectionOf(readme, COPY_HEADING)

/**
 * The third item of `## Overriding`'s list. Undefined while the README lacks a third item.
 */
export const ladderStep3Of = (readme: string): string | undefined => {
  const overriding = sectionOf(readme, '## Overriding')
  const lines = overriding?.split('\n') ?? []
  const start = lines.findIndex((line) => line.startsWith('3. '))
  if (start === -1) return undefined
  const rest = lines.slice(start + 1)
  const stop = rest.findIndex((line) => line === '' || /^\d+\. /.test(line))
  return [lines[start], ...(stop === -1 ? rest : rest.slice(0, stop))].join('\n')
}

/**
 * The strings the tripwire reads outside the registry: the README section and ladder step as the
 * README has them, the CLI's `NOT_YET` and `add` help line as the repository will have them, and
 * the two cleared CLI lines.
 */
export const documentStrings = (cliSource: string): LabeledString[] => {
  const readme = readReadme()
  const section = copySectionOf(readme)
  if (section === undefined) throw new Error(`README.md has no "${COPY_HEADING}" section`)
  const step3 = ladderStep3Of(readme)
  if (step3 === undefined) throw new Error('README.md has no third item under "## Overriding"')
  return [
    { label: 'README copy section', text: section },
    { label: 'README override step 3', text: step3 },
    { label: 'C-notyet', text: cleared('C-notyet') },
    { label: 'C-add-help', text: cleared('C-add-help') },
    { label: 'packages/cli/src/index.ts NOT_YET', text: cliNotYetOf(cliSource) ?? '' },
    ...helpLinesOf(cliSource)
      .filter((line) => /^\s+add\b/.test(line))
      .map((text) => ({ label: 'packages/cli/src/index.ts add help line', text })),
  ]
}
