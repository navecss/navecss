/**
 * The shape every copied CSS Module has: the two header comments, Nave's layer order statement as
 * the first statement, then one `@layer components.consumer` block, with one declaration per line.
 * The order statement is read from the built stylesheet and the header's second line from
 * `LICENSE`, so neither is typed into a test.
 */
import type { ChildNode, Root } from 'postcss'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

import type { LoadedRegistry } from './load.ts'

import { PACKAGE_DIR, readStylesheet } from '../stylesheet.ts'
import { HEADER } from './cleared.ts'
import { modulesOf } from './css-rules.ts'

/**
 * The first statement of the built stylesheet, as written in it.
 */
export const orderStatement = (): string => {
  const first = postcss.parse(readStylesheet()).first
  if (first?.type !== 'atrule' || first.name !== 'layer' || first.nodes !== undefined) {
    throw new Error('the built stylesheet does not open with a layer order statement')
  }
  return `@layer ${first.params};`
}

/**
 * The copyright year and holder `LICENSE` states, which the header's second line repeats.
 */
export const licenseHolder = (): { holder: string; year: string } => {
  const license = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8')
  const match = /^Copyright \(c\) (\d{4}) (.+)$/m.exec(license)
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('LICENSE has no readable copyright line')
  }
  return { holder: match[2], year: match[1] }
}

/**
 * The two comment lines a copied CSS file opens with.
 */
export const cssHeader = (): string => {
  const { holder, year } = licenseHolder()
  return `/* ${HEADER.line1} */\n/* ${HEADER.line2(year, holder)} */\n`
}

const layerStatements = (root: Root): number => {
  let count = 0
  root.walkAtRules('layer', (rule) => {
    if (rule.nodes === undefined) count += 1
  })
  return count
}

const declarationLines = (root: Root): number[] => {
  const lines: number[] = []
  root.walkDecls((declaration) => {
    lines.push(declaration.source?.start?.line ?? 0)
  })
  return lines
}

const sharedLines = (lines: readonly number[]): number[] =>
  [...new Set(lines)].filter((line) => lines.filter((other) => other === line).length > 1)

const statementProblems = (
  label: string,
  statements: readonly ChildNode[],
  order: string,
): string[] => {
  const problems: string[] = []
  const [statement, block, ...rest] = statements
  if (statement?.type !== 'atrule' || `@layer ${statement.params};` !== order) {
    problems.push(`${label}: the first statement after the header is not the order statement`)
  }
  const isBlock = block?.type === 'atrule' && block.name === 'layer' && block.nodes !== undefined
  if (!isBlock || block.params !== 'components.consumer') {
    problems.push(`${label}: the second statement is not the @layer components.consumer block`)
  }
  if (rest.length > 0) problems.push(`${label}: ${rest.length} statement(s) after the block`)
  return problems
}

const topLevelProblems = (label: string, root: Root, order: string): string[] => {
  const comments = root.nodes.filter((node) => node.type === 'comment')
  const statements = root.nodes.filter((node) => node.type !== 'comment')
  const header =
    comments.length === 2
      ? []
      : [`${label}: ${comments.length} top-level comments, expected the two header lines`]
  return [...header, ...statementProblems(label, statements, order)]
}

const blockProblems = (label: string, root: Root): string[] => {
  const block = root.nodes.find(
    (node) => node.type === 'atrule' && node.params === 'components.consumer',
  )
  if (block?.type !== 'atrule') return []
  const strays = (block.nodes ?? []).filter(
    (node) => node.type !== 'rule' && node.type !== 'comment',
  )
  return strays.length > 0
    ? [`${label}: the layer block holds a ${strays[0]?.type} outside a rule`]
    : []
}

/**
 * Every shape problem of one module's text.
 */
export const moduleShapeOf = (label: string, content: string): string[] => {
  const order = orderStatement()
  const header = cssHeader()
  if (!content.startsWith(header)) return [`${label}: does not begin with the header lines`]
  const afterHeader = content.slice(header.length).trimStart()
  const problems: string[] = []
  if (!afterHeader.startsWith(`${order}\n`)) {
    problems.push(`${label}: the order statement does not follow the header byte for byte`)
  }
  const root = postcss.parse(content)
  problems.push(...topLevelProblems(label, root, order), ...blockProblems(label, root))
  if (layerStatements(root) !== 1) {
    problems.push(`${label}: ${layerStatements(root)} block-less @layer statements, expected 1`)
  }
  const shared = sharedLines(declarationLines(root))
  for (const line of shared) {
    problems.push(`${label}: line ${line} holds more than one declaration`)
  }
  return problems
}

/**
 * Every shape problem over the registry's modules.
 */
export const moduleShapeProblems = (registry: LoadedRegistry): string[] => {
  const { found, problems } = modulesOf(registry)
  return [...problems, ...found.flatMap((module) => moduleShapeOf(module.label, module.content))]
}

export const layerNamesOf = (statement: string): string[] =>
  statement
    .replace(/^@layer /, '')
    .replace(/;$/, '')
    .split(', ')

/**
 * The module with two names of its order statement exchanged: first appearance fixes the layer
 * order, so this is the edit that must be caught.
 */
export const withOneLayerNameMoved = (content: string): string => {
  const order = orderStatement()
  const names = layerNamesOf(order)
  const third = names[2]
  const fourth = names[3]
  if (third === undefined || fourth === undefined) {
    throw new Error('the statement has too few names')
  }
  const moved = names.with(2, fourth).with(3, third)
  return content.replace(order, () => `@layer ${moved.join(', ')};`)
}

/**
 * The module with its first two declarations that sit on separate lines joined onto one.
 */
export const withTwoDeclarationsOnOneLine = (content: string): string =>
  content.replace(/;\n\s+(?=[a-z-]+: )/, '; ')

/**
 * The module with a second block-less layer statement appended.
 */
export const withASecondStatement = (content: string): string => `${content}\n@layer overrides;\n`
