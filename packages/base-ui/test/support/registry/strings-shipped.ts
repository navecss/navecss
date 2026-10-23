/**
 * The checks for the sentences the registry makes false: the CLI's source, the repository's
 * guidance and docs pages, and two ADRs. Each check takes the files as one record, so the same
 * check runs over the tree and over the base release's lines, held as literals.
 */
import {
  createSourceFile,
  forEachChild,
  isIdentifier,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  isVariableDeclaration,
  type Node,
  ScriptTarget,
} from 'typescript'

import { cleared } from './cleared.ts'
import {
  BASE_ADR_0003,
  BASE_ADR_0010,
  BASE_CLAUDE,
  BASE_CLI,
  BASE_CORE_LAYERS,
  BASE_DOCS_INDEX,
  BASE_TECH_INDEX,
} from './strings-literals-shipped.ts'
import { sectionOf } from './strings-text.ts'

export const SHIPPED_PATHS = {
  adr0003: 'docs/04-adr/0003-layer-cascade-contract.md',
  adr0010: 'docs/04-adr/0010-wrapper-package-per-headless-library.md',
  claude: 'CLAUDE.md',
  cli: 'packages/cli/src/index.ts',
  coreLayers: 'packages/core/src/layers.css',
  docsIndex: 'docs/index.md',
  techIndex: 'docs/03-tech-docs/index.md',
} as const

export type ShippedFiles = Readonly<Record<keyof typeof SHIPPED_PATHS, string>>

/**
 * Every file the criterion reads, through one reader.
 */
export const shippedFilesFrom = (read: (repoPath: string) => string): ShippedFiles =>
  Object.fromEntries(
    Object.entries(SHIPPED_PATHS).map(([key, repoPath]) => [key, read(repoPath)]),
  ) as ShippedFiles

export const textOfStringVariable = (source: string, name: string): string | undefined => {
  let found: string | undefined
  const visit = (node: Node): void => {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined &&
      (isStringLiteral(node.initializer) || isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      found = node.initializer.text
    }
    forEachChild(node, visit)
  }
  visit(createSourceFile('index.ts', source, ScriptTarget.Latest, true))
  return found
}

/**
 * The value of the CLI's `NOT_YET` constant.
 */
export const cliNotYetOf = (source: string): string | undefined =>
  textOfStringVariable(source, 'NOT_YET')

/**
 * The lines of the help text the CLI prints: the template literal that holds "Commands:".
 */
export const helpLinesOf = (source: string): string[] => {
  const texts: string[] = []
  const visit = (node: Node): void => {
    if (isNoSubstitutionTemplateLiteral(node) && node.text.includes('Commands:')) {
      texts.push(node.text)
    }
    forEachChild(node, visit)
  }
  visit(createSourceFile('index.ts', source, ScriptTarget.Latest, true))
  return (texts[0] ?? '').split('\n')
}

const linesOf = (text: string): string[] => text.split('\n')

export const cliHeaderProblems = ({ cli }: ShippedFiles): string[] => {
  const baseLines = BASE_CLI.split('\n')
  const expected = [...baseLines.slice(0, 3), cleared('C-doc'), baseLines[5]].join('\n')
  return cli.startsWith(`${expected}\n`)
    ? []
    : ['the header comment is not C-doc in place of lines 4 and 5']
}

export const notYetProblems = ({ cli }: ShippedFiles): string[] =>
  textOfStringVariable(cli, 'NOT_YET') === cleared('C-notyet') ? [] : ['NOT_YET is not C-notyet']

export const addHelpProblems = ({ cli }: ShippedFiles): string[] => {
  const lines = helpLinesOf(cli).filter((line) => /^\s+add\b/.test(line))
  return lines.length === 1 && lines[0] === cleared('C-add-help')
    ? []
    : ['the add help line is not C-add-help']
}

export const ejectHelpProblems = ({ cli }: ShippedFiles): string[] => {
  const lines = helpLinesOf(cli)
  const named = lines.filter((line) => /eject/i.test(line))
  return [
    ...(lines.length > 1 ? [] : ['the help text was not found']),
    ...named.map((line) => `a help line names eject: ${line.trim()}`),
  ]
}

export const claudeLineProblems = ({ claude }: ShippedFiles): string[] => {
  const lines = linesOf(claude).filter((line) => line.startsWith('packages/cli/'))
  return lines.length === 1 && lines[0] === cleared('D-claude42')
    ? []
    : ['the packages/cli/ architecture line is not D-claude42']
}

const lineProblems = (text: string, lineNumber: number, block: string): string[] =>
  linesOf(text)[lineNumber - 1] === block ? [] : [`line ${lineNumber} is not ${block.slice(0, 40)}`]

export const docsIndexProblems = ({ docsIndex }: ShippedFiles): string[] => [
  ...lineProblems(docsIndex, 47, cleared('D-index47')),
  ...lineProblems(docsIndex, 23, cleared('D-index23')),
]

export const techIndexProblems = ({ techIndex }: ShippedFiles): string[] =>
  lineProblems(techIndex, 12, cleared('D-tech12'))

export const STALE_PHRASES = [
  'the component registry does not exist',
  'stubs until the registry exists',
  'the `navecss add` flow',
  'component registry: `navecss add ...`',
] as const

export const staleSentenceProblems = (files: ShippedFiles): string[] =>
  Object.entries(files)
    .filter(([key]) => key !== 'coreLayers')
    .flatMap(([key, text]) =>
      STALE_PHRASES.filter((phrase) => text.includes(phrase)).map(
        (phrase) => `${SHIPPED_PATHS[key as keyof typeof SHIPPED_PATHS]} still says "${phrase}"`,
      ),
    )

const WORDS_THE_UPDATE_AVOIDS =
  /\b(?:own|owns|owned|owner|owners|ownership|eject|ejects|ejected|ejecting)\b/i

/**
 * The text of ADR 0010's `## Update:` section that speaks of the registry, if it has one.
 */
export const registryUpdateOf = (adr: string): string | undefined =>
  adr
    .split(/^(?=## Update:)/m)
    .filter((part) => part.startsWith('## Update:'))
    .map((part) => part.split(/^## (?!Update:)/m, 1)[0] ?? '')
    .find((part) => /registry/i.test(part))

export const adr0010Problems = ({ adr0010 }: ShippedFiles): string[] => {
  const update = registryUpdateOf(adr0010)
  if (update === undefined) return ['ADR 0010 has no "## Update:" section about the registry']
  const anchors: [string, RegExp][] = [
    ['says how the registry is generated', /generat/i],
    ['says where it is served', /jsDelivr/i],
    ['says where it ships', /dist\/registry/],
    ['names CSS Modules', /CSS Modules/],
    ['gives the reason: no standard', /no standard/i],
    ['gives the reason: class names', /class names?/i],
    ['gives the reason: per file', /per[- ]file/i],
    ['says hosts without CSS Modules use the package', /without CSS Modules/i],
    ['records a decision', /decision|decided/i],
  ]
  return [
    ...anchors
      .filter(([, anchor]) => !anchor.test(update))
      .map(([what]) => `the Update section does not say: ${what}`),
    ...(WORDS_THE_UPDATE_AVOIDS.exec(update)
      ?.slice(0, 1)
      .map((word) => `the Update section uses the word "${word}"`) ?? []),
  ]
}

const CONSUMER_ROW = '| `components.consumer`'

export const adr0003Problems = ({ adr0003 }: ShippedFiles): string[] => {
  const row = linesOf(adr0003).find((line) => line.startsWith(CONSUMER_ROW))
  const writers = row?.split('|', 4)[3] ?? ''
  const start = adr0003.indexOf('**2. The contract holds under one precondition')
  const end = adr0003.indexOf('**3. ', start)
  const precondition = start === -1 ? '' : adr0003.slice(start, end === -1 ? undefined : end)
  const problems: string[] = []
  if (!/registry/i.test(writers))
    problems.push('the components.consumer row names no registry copy')
  if (!writers.includes('consumer'))
    problems.push('the components.consumer row no longer names the consumer')
  for (const [what, anchor] of [
    ['a registry copy', /registry/i],
    ['the order statement', /order statement/i],
    ['the header', /header/i],
  ] as const) {
    if (!anchor.test(precondition))
      problems.push(`the precondition paragraph does not name ${what}`)
  }
  return problems
}

const NAVE_LAYERS = [
  'tokens.defaults',
  'tokens.presets',
  'reset',
  'atomic',
  'components.nave',
  'components.consumer',
  'overrides',
]

const NAVE_STATEMENT = `@layer ${NAVE_LAYERS.join(', ')};`

const ORDER_STATEMENT = /^@layer tokens\.defaults, .*;$/gm

const layerNamesOf = (adr: string): string[] =>
  linesOf(sectionOf(adr, '## Decision') ?? '')
    .map((line) => /^\| `([\w.]+)`\s*\|/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)

export const layersProblems = ({ adr0003, coreLayers }: ShippedFiles): string[] => {
  const problems: string[] = []
  const statements = adr0003.match(ORDER_STATEMENT) ?? []
  if (statements.length === 0) problems.push('ADR 0003 has no order statement')
  if (statements.some((statement) => statement !== NAVE_STATEMENT)) {
    problems.push('ADR 0003 states a different order')
  }
  if (layerNamesOf(adr0003).join(',') !== NAVE_LAYERS.join(',')) {
    problems.push('ADR 0003 names the layers differently from the seven, in order')
  }
  const coreStatement = coreLayers.replaceAll(/\/\*[\s\S]*?\*\//g, '').trim()
  if (coreStatement !== NAVE_STATEMENT) problems.push('@navecss/core layers.css differs')
  return problems
}

/**
 * Every check of the criterion, by the clause it holds. `redsAtBase` marks the ones whose line
 * stands differently at the base release, so the control can feed them `BASE_SHIPPED`.
 */
export const SHIPPED_CHECKS: Readonly<
  Record<
    string,
    {
      readonly check: (files: ShippedFiles) => string[]
      readonly redsAtBase: boolean
    }
  >
> = {
  'the CLI header carries C-doc in place of lines 4 and 5': {
    check: cliHeaderProblems,
    redsAtBase: true,
  },
  'NOT_YET is C-notyet': { check: notYetProblems, redsAtBase: true },
  'the add help line is C-add-help': { check: addHelpProblems, redsAtBase: true },
  'no help line names eject': { check: ejectHelpProblems, redsAtBase: true },
  'CLAUDE.md has D-claude42': { check: claudeLineProblems, redsAtBase: true },
  'docs/index.md lines 47 and 23 are D-index47 and D-index23': {
    check: docsIndexProblems,
    redsAtBase: true,
  },
  'docs/03-tech-docs/index.md line 12 is D-tech12': { check: techIndexProblems, redsAtBase: true },
  'no file still holds a stale sentence': { check: staleSentenceProblems, redsAtBase: true },
  'ADR 0010 has the Update section': { check: adr0010Problems, redsAtBase: true },
  'ADR 0003 names the copy in its row and its precondition': {
    check: adr0003Problems,
    redsAtBase: true,
  },
  "the layer order and names are Nave's seven in order": {
    check: layersProblems,
    redsAtBase: false,
  },
}

/**
 * The same files as the base release (`e3f7c153`) had them, from the literals the controls hold.
 */
export const BASE_SHIPPED: ShippedFiles = {
  adr0003: BASE_ADR_0003,
  adr0010: BASE_ADR_0010,
  claude: BASE_CLAUDE,
  cli: BASE_CLI,
  coreLayers: BASE_CORE_LAYERS,
  docsIndex: BASE_DOCS_INDEX,
  techIndex: BASE_TECH_INDEX,
}
