import type { ShippedFiles } from './strings-shipped.ts'

/**
 * The files the cleared blocks describe, made from the base branch's, so the checks of the
 * shipped sentences can be run over files that do not exist yet.
 */
import { cleared } from './cleared.ts'

const linesOf = (text: string): string[] => text.split('\n')

const replaceLine = (text: string, isTarget: (line: string) => boolean, block: string): string => {
  const lines = linesOf(text)
  if (lines.filter((line) => isTarget(line)).length !== 1)
    throw new Error(`one line should match for ${block.slice(0, 30)}`)
  return lines.map((line) => (isTarget(line) ? block : line)).join('\n')
}

const replaceLineNumber = (text: string, lineNumber: number, block: string): string => {
  const lines = linesOf(text)
  lines[lineNumber - 1] = block
  return lines.join('\n')
}

/**
 * The files the cleared blocks describe, made from the base branch's: the CLI's header, `NOT_YET`
 * and help lines, the architecture line of `CLAUDE.md` and the three docs lines. The two ADRs
 * are ENG's words, so they are left as the base has them.
 */
export const shippedFilesBuiltFrom = (base: ShippedFiles): ShippedFiles => {
  const baseCli = linesOf(base.cli)
  const withHeader = [...baseCli.slice(0, 3), cleared('C-doc'), ...baseCli.slice(5)].join('\n')
  const withNotYet = replaceLine(
    withHeader,
    (line) => line.startsWith('const NOT_YET = '),
    `const NOT_YET = "${cleared('C-notyet')}"`,
  )
  const withAdd = replaceLine(withNotYet, (line) => /^\s+add\b/.test(line), cleared('C-add-help'))
  const cli = linesOf(withAdd)
    .filter((line) => !/^\s+eject\s+Export/.test(line))
    .join('\n')
  return {
    ...base,
    claude: replaceLine(
      base.claude,
      (line) => line.startsWith('packages/cli/'),
      cleared('D-claude42'),
    ),
    cli,
    docsIndex: replaceLineNumber(
      replaceLineNumber(base.docsIndex, 47, cleared('D-index47')),
      23,
      cleared('D-index23'),
    ),
    techIndex: replaceLineNumber(base.techIndex, 12, cleared('D-tech12')),
  }
}
