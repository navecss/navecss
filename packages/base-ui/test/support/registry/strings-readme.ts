import { fencesOf, FIXED_SENTENCES, proseOf } from '../readme.ts'
/**
 * The package README's checks for the copy section: each takes the README text (and the base
 * branch's, and the manifest's peers where it needs them) and returns its problems, so a control
 * can run the same check over a README with one thing changed. `readmeBuiltFrom` makes the README
 * the cleared bytes describe, so the checks can be run over a README that does not exist yet.
 */
import { cleared } from './cleared.ts'
import { floorsOf } from './strings-floors.ts'
import { copySectionOf } from './strings-sources.ts'
import { paragraphsOf, sectionOf } from './strings-text.ts'

export interface ReadmeContext {
  /**
  The base branch's README.
   */
  readonly base: string
  readonly peerDependencies: Readonly<Record<string, string>>
  /**
  The README under test.
   */
  readonly readme: string
}

const WHAT_IS_STYLED = '## What is styled'
const LOCAL_PREFIX = './node_modules/@navecss/base-ui/dist/registry/'

/**
 * The README the cleared bytes describe: the base's with `N` for the "On this page" line, `L1`
 * for the ladder's count line, `L2` for its third item and `S-noform` directly before the
 * "What is styled" heading. Every other line is the base's.
 */
export const readmeBuiltFrom = (base: string): string => {
  const replacements: [(line: string) => boolean, string][] = [
    [(line) => line.startsWith('On this page:'), cleared('N')],
    [(line) => line === 'There are three steps, from the lightest:', cleared('ladder-L1')],
    [(line) => line.startsWith('3. **The raw Base UI part.**'), cleared('ladder-L2')],
    [(line) => line === WHAT_IS_STYLED, `${cleared('S-noform')}\n\n${WHAT_IS_STYLED}`],
  ]
  const lines = base.split('\n')
  return lines
    .map((line) => {
      const replacement = replacements.find(([matches]) => matches(line))
      return replacement === undefined ? line : replacement[1]
    })
    .join('\n')
}

const lineNumberOfDifference = (a: readonly string[], b: readonly string[]): number => {
  const length = Math.max(a.length, b.length)
  for (let line = 0; line < length; line += 1) {
    if (a[line] !== b[line]) return line + 1
  }
  return 0
}

/**
 * Problems with every line other than the cleared blocks: the README is the base's with those
 * blocks in place, line for line. Reports the first line that differs.
 */
export const otherLinesProblems = ({ base, readme }: ReadmeContext): string[] => {
  const expected = readmeBuiltFrom(base).split('\n')
  const actual = readme.split('\n')
  const line = lineNumberOfDifference(expected, actual)
  if (line === 0) return []
  return [
    `line ${line} differs: expected ${JSON.stringify(expected[line - 1])}, found ${JSON.stringify(actual[line - 1])}`,
  ]
}

export const onThisPageProblems = ({ readme }: ReadmeContext): string[] => {
  const lines = readme.split('\n').filter((line) => line.startsWith('On this page:'))
  return lines.length === 1 && lines[0] === cleared('N') ? [] : ['the "On this page" line is not N']
}

const overridingItem = (base: string, number: number): string => {
  const lines = sectionOf(base, '## Overriding')?.split('\n') ?? []
  const item = lines.find((line) => line.startsWith(`${number}. `))
  if (item === undefined) throw new Error(`the base README has no item ${number} under Overriding`)
  return item
}

export const ladderProblems = ({ base, readme }: ReadmeContext): string[] => {
  const expected = [
    '## Overriding',
    '',
    cleared('ladder-L1'),
    '',
    overridingItem(base, 1),
    overridingItem(base, 2),
    cleared('ladder-L2'),
    '',
  ].join('\n')
  const section = sectionOf(readme, '## Overriding')
  return section?.startsWith(expected) === true
    ? []
    : ['the Overriding count line and list are not L1, the base items 1 and 2, and L2']
}

export const sectionPlacementProblems = ({ readme }: ReadmeContext): string[] =>
  readme.includes(`${cleared('S-noform')}\n\n${WHAT_IS_STYLED}\n`)
    ? []
    : ['S-noform is not directly before "## What is styled"']

export const layerSentenceProblems = ({ readme }: ReadmeContext): string[] => {
  const section = copySectionOf(readme) ?? ''
  return paragraphsOf(section).includes(cleared('S-b'))
    ? []
    : ['S-b is not its own paragraph of the section']
}

export const fenceOrderProblems = ({ readme }: ReadmeContext): string[] => {
  const fences = fencesOf(copySectionOf(readme) ?? '')
  const first = fences[0]
  if (first === undefined) return ['the section has no command fence']
  const problems: string[] = []
  if (!first.body.includes(LOCAL_PREFIX)) {
    problems.push(`the first command fence is not the ${LOCAL_PREFIX} form`)
  }
  const remote = fences.findIndex(
    ({ body }) => body.includes('cdn.jsdelivr.net') || body.includes('registry add'),
  )
  if (remote !== -1 && remote < fences.findIndex(({ body }) => body.includes(LOCAL_PREFIX))) {
    problems.push('a jsDelivr or registries fence comes before the installed-package fence')
  }
  return problems
}

const ADDRESS = /(?:https?:\/\/|\.\/node_modules\/)[^\s'`)]+/g

export const addressProblems = ({ readme }: ReadmeContext): string[] => {
  const section = copySectionOf(readme) ?? ''
  const addresses = section.match(ADDRESS) ?? []
  const problems = addresses
    .filter((address) => !address.includes('/dist/registry/'))
    .map((address) => `${address} has no /dist/registry/`)
  if (addresses.length === 0) problems.push('the section has no address')
  return problems
}

export const versionPlacementProblems = ({ readme }: ReadmeContext): string[] => {
  const problems: string[] = []
  if (/@navecss\/base-ui@\d/.test(readme))
    problems.push('a literal @navecss/base-ui@<digits> appears')
  const fences = fencesOf(copySectionOf(readme) ?? '')
  if (fences.length === 0) problems.push('the section has no command fence')
  for (const { body } of fences) {
    const isRemote = body.includes('cdn.jsdelivr.net')
    const isVersioned = body.includes('<version>')
    if (isVersioned && !isRemote)
      problems.push('<version> appears in a fence that is not a jsDelivr one')
    if (isRemote && !isVersioned) problems.push('a jsDelivr fence has no <version>')
  }
  return problems
}

export const fileListProblems = ({ readme }: ReadmeContext): string[] => {
  const section = copySectionOf(readme) ?? ''
  const subpath = /base-ui-([\w-]+)\.json/.exec(section)?.[1]
  if (subpath === undefined) return ['the section names no item address']
  const listed = section
    .split('\n')
    .map((line) => /^- `([^`]+)`/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
  const expected = [
    `nave-${subpath}.ts`,
    `nave-${subpath}.parts.ts`,
    `nave-${subpath}.wrap.ts`,
    `nave-${subpath}.module.css`,
    'NAVECSS-LICENSE',
  ]
  const problems =
    listed.join('\n') === expected.join('\n') ? [] : [`the file list is ${listed.join(', ')}`]
  if (section.includes('--diff')) problems.push('the section points at --diff')
  return problems
}

export const floorSentenceProblems = ({ peerDependencies, readme }: ReadmeContext): string[] => {
  const floors = floorsOf(peerDependencies)
  const paragraph = paragraphsOf(copySectionOf(readme) ?? '').find((candidate) =>
    candidate.includes('A copy needs'),
  )
  if (paragraph === undefined) return ['no paragraph says what a copy needs']
  return [
    `\`@base-ui/react\` ${floors.baseUi}`,
    `\`@navecss/tokens\` ${floors.tokens}`,
    `React ${floors.react}`,
  ]
    .filter((words) => !paragraph.includes(words))
    .map((words) => `the floor sentence lacks "${words}"`)
}

export const nonAffiliationProblems = ({ readme }: ReadmeContext): string[] => {
  const line = FIXED_SENTENCES.find((sentence) => sentence.name === 'non-affiliation')?.text ?? ''
  return paragraphsOf(proseOf(readme)).includes(line)
    ? []
    : ['the non-affiliation line is not its own paragraph']
}

/**
 * Every README check, by the name of the clause it holds.
 */
export const README_CHECKS: Readonly<Record<string, (context: ReadmeContext) => string[]>> = {
  'the "On this page" line is N': onThisPageProblems,
  'the Overriding count line and list': ladderProblems,
  'S-noform sits directly before "What is styled"': sectionPlacementProblems,
  'S-b is its own paragraph of the section': layerSentenceProblems,
  "every other line is the base README's": otherLinesProblems,
  "the first command fence is the installed package's": fenceOrderProblems,
  'every address has /dist/registry/': addressProblems,
  '<version> sits only in the jsDelivr and registries fences': versionPlacementProblems,
  'the file list is in the item order and there is no --diff': fileListProblems,
  'the floor sentence is worded from peerDependencies': floorSentenceProblems,
  'the non-affiliation line is its own paragraph': nonAffiliationProblems,
}

export { COPY_HEADING as SECTION_HEADING } from './strings-sources.ts'
