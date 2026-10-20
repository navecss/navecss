/**
 * Running `@navecss/stylelint-config` over the registry's CSS Modules the way a consumer does, with
 * every disable report on, and reading what the copied `outline: none` declarations promise: each is
 * preceded on a line of its own by the cleared disable comment, and a ring follows it in the atom's
 * rule.
 */
import type { Declaration, Rule } from 'postcss'

import config from '@navecss/stylelint-config'
import path from 'node:path'
import postcss from 'postcss'
import * as prettier from 'prettier'
import stylelint from 'stylelint'

import type { LoadedRegistry } from './load.ts'

import { focusRingAtoms } from '../../../styles/atoms.ts'
import { PACKAGE_DIR } from '../stylesheet.ts'
import { cleared } from './cleared.ts'
import { modulesOf } from './css-rules.ts'

export const GUARD_RULE = 'declaration-property-value-disallowed-list'

export interface ModuleText {
  readonly atomNames: readonly string[]
  readonly label: string
  readonly text: string
}

export interface Report {
  readonly column: number
  readonly line: number
  readonly rule: string
  readonly text: string
}

/**
 * Everything stylelint reports for a module's text, the disable reports included, as one list.
 */
export const lintModule = async (label: string, code: string): Promise<Report[]> => {
  const result = await stylelint.lint({
    code,
    codeFilename: path.join(PACKAGE_DIR, 'dist/registry', label),
    config,
    reportDescriptionlessDisables: true,
    reportInvalidScopeDisables: true,
    reportNeedlessDisables: true,
  })
  const [first] = result.results
  if (first === undefined) throw new Error(`stylelint returned nothing for ${label}`)
  if (first.ignored === true) throw new Error(`stylelint ignored ${label}`)
  return [
    ...first.parseErrors.map((error) => ({
      column: 0,
      line: 0,
      rule: 'parse',
      text: error.text,
    })),
    ...first.invalidOptionWarnings.map((warning) => ({
      column: 0,
      line: 0,
      rule: 'invalid-option',
      text: warning.text,
    })),
    ...first.warnings.map((warning) => ({
      column: warning.column,
      line: warning.line,
      rule: warning.rule,
      text: warning.text,
    })),
  ]
}

/**
 * The modules of a registry as text, one per styled subpath that has an item.
 */
export const moduleTexts = (
  registry: LoadedRegistry,
): { found: ModuleText[]; problems: string[] } => {
  const { found, problems } = modulesOf(registry)
  return {
    found: found.map((module) => ({
      atomNames: module.atomNames,
      label: module.label,
      text: module.content,
    })),
    problems,
  }
}

/**
 * The module as Prettier prints it with its default options.
 */
export const prettified = (text: string): Promise<string> =>
  prettier.format(text, { parser: 'css' })

/**
 * What stylelint reports over every module, as problems naming the module and the line.
 */
export const reportedProblems = async (modules: readonly ModuleText[]): Promise<string[]> => {
  const problems: string[] = []
  for (const module of modules) {
    const reports = await lintModule(module.label, module.text)
    for (const report of reports) {
      problems.push(`${module.label}:${report.line}: ${report.rule}: ${report.text}`)
    }
  }
  return problems
}

/**
 * The modules with every line the cleared disable comment occupies removed.
 */
export const withoutDisableComments = (text: string): string =>
  text
    .split('\n')
    .filter((line) => line.trim() !== cleared('W-outline'))
    .join('\n')

const isOutlineNone = (declaration: Declaration): boolean =>
  declaration.prop === 'outline' && declaration.value === 'none'

export const outlineNoneDeclarations = (text: string): Declaration[] => {
  const found: Declaration[] = []
  postcss.parse(text).walkDecls((declaration) => {
    if (isOutlineNone(declaration)) found.push(declaration)
  })
  return found
}

/**
 * The declarations that set `outline` to zero, which no module may carry.
 */
export const outlineZeroDeclarations = (text: string): Declaration[] => {
  const found: Declaration[] = []
  postcss.parse(text).walkDecls('outline', (declaration) => {
    if (/^0(?:px)?$/.test(declaration.value)) found.push(declaration)
  })
  return found
}

/**
 * The focusable atoms a module uses.
 */
export const focusableAtomsOf = (atomNames: readonly string[]): string[] =>
  atomNames.filter((name) => focusRingAtoms.includes(name))

export const disableCommentLines = (text: string): { line: number; text: string }[] =>
  text
    .split('\n')
    .map((lineText, index) => ({ line: index + 1, text: lineText }))
    .filter((entry) => entry.text.includes('stylelint-disable'))

const commentProblems = (module: ModuleText): string[] => {
  const lines = module.text.split('\n')
  return disableCommentLines(module.text).flatMap((entry) => {
    const next = lines[entry.line]?.trimStart() ?? ''
    const problems: string[] = []
    if (entry.text.trim() !== cleared('W-outline')) {
      problems.push(
        `${module.label}:${entry.line}: a disable comment that is not the cleared one, or not alone on its line`,
      )
    }
    if (!next.startsWith('outline: none;')) {
      problems.push(
        `${module.label}:${entry.line}: the line after the disable comment is not outline: none;`,
      )
    }
    return problems
  })
}

/**
 * Whether `node` is an atom's class rule: a rule whose selector starts with `.` directly in the
 * module's `@layer` block.
 */
const isClassRule = (node: postcss.Node | postcss.Document | undefined): boolean =>
  node?.type === 'rule' &&
  (node as Rule).selector.startsWith('.') &&
  node.parent?.type === 'atrule' &&
  (node.parent as postcss.AtRule).name === 'layer'

/**
 * The child of the atom's class rule that holds the declaration: the declaration itself, or the
 * `&` rule directly in the class rule that holds it and nothing but comments beside it. Comments
 * are allowed because this reads the module after the disable comment is written.
 */
const holderOf = (declaration: Declaration): postcss.ChildNode | undefined => {
  const rule = declaration.parent as Rule | undefined
  if (rule?.type !== 'rule') return undefined
  if (isClassRule(rule)) return declaration
  const isAlone =
    rule.selector.trim() === '&' &&
    isClassRule(rule.parent) &&
    rule.nodes.every((node) => node === declaration || node.type === 'comment')
  return isAlone ? rule : undefined
}

const isRing = (node: postcss.ChildNode): boolean =>
  node.type === 'rule' &&
  node.selector.trim() === '&:focus-visible' &&
  node.nodes.some(
    (child) => child.type === 'decl' && child.prop === 'outline-style' && child.value === 'solid',
  )

/**
 * Whether a ring follows the declaration, read after the disable comment is written: the holder is
 * the declaration, or the `&` rule that holds it and comments alone, directly in the atom's class
 * rule; the ring is a later child of that class rule that is exactly `&:focus-visible` and sets
 * `outline-style: solid`. It is not the build's `isPaired` (`scripts/registry/module-css.ts`): it
 * allows comments in the wrapper; asks only `outline-style: solid` of the ring, the counts holding
 * the other three longhands; does not refuse `!important`; and needs an `@layer` parent.
 */
export const hasRingAfter = (declaration: Declaration): boolean => {
  const holder = holderOf(declaration)
  const classRule = holder?.parent as Rule | undefined
  if (holder === undefined || classRule === undefined || !isClassRule(classRule)) return false
  return classRule.nodes.slice(classRule.nodes.indexOf(holder) + 1).some((node) => isRing(node))
}

const ringProblems = (module: ModuleText): string[] =>
  outlineNoneDeclarations(module.text)
    .filter((declaration) => !hasRingAfter(declaration))
    .map(
      (declaration) =>
        `${module.label}:${declaration.source?.start?.line}: outline: none with no &:focus-visible ring after it`,
    )

const countProblems = (module: ModuleText): string[] => {
  const comments = disableCommentLines(module.text).length
  const declarations = outlineNoneDeclarations(module.text).length
  const focusable = focusableAtomsOf(module.atomNames).length
  const zeros = outlineZeroDeclarations(module.text).length
  return [
    ...(comments === declarations
      ? []
      : [`${module.label}: ${comments} disable comments, ${declarations} outline: none`]),
    ...(declarations === focusable
      ? []
      : [`${module.label}: ${declarations} outline: none, ${focusable} focusable atoms`]),
    ...(zeros === 0 ? [] : [`${module.label}: ${zeros} outline: 0`]),
  ]
}

/**
 * Where the disable comment sits, what it covers, and whether the counts agree.
 */
export const disableProblems = (modules: readonly ModuleText[]): string[] =>
  modules.flatMap((module) => [
    ...commentProblems(module),
    ...ringProblems(module),
    ...countProblems(module),
  ])

/**
 * What stylelint reports once the disable comments are gone: the problems that are not an
 * `outline: none` of a module, and the declarations that were not reported.
 */
export const strippedProblems = async (modules: readonly ModuleText[]): Promise<string[]> => {
  const problems: string[] = []
  for (const module of modules) {
    const stripped = withoutDisableComments(module.text)
    const declared = new Set(
      outlineNoneDeclarations(stripped).map((item) => item.source?.start?.line),
    )
    const reports = await lintModule(module.label, stripped)
    const reported = new Set(reports.map((report) => report.line))
    for (const report of reports) {
      if (report.rule !== GUARD_RULE || !declared.has(report.line)) {
        problems.push(
          `${module.label}:${report.line}: ${report.rule} is not an outline: none report`,
        )
      }
    }
    for (const line of declared) {
      if (!reported.has(line ?? 0))
        problems.push(`${module.label}:${line}: outline: none not reported`)
    }
    if (reports.length !== declared.size) {
      problems.push(`${module.label}: ${reports.length} reports for ${declared.size} declarations`)
    }
  }
  return problems
}

/**
 * The module with `outline: 0` on a line of its own inside its first `:focus-visible` rule.
 */
export const withOutlineZeroInRing = (text: string): string => {
  const root = postcss.parse(text)
  let isPlanted = false
  root.walkRules((rule) => {
    if (isPlanted || rule.selector.trim() !== '&:focus-visible') return
    rule.prepend({ prop: 'outline', value: '0' })
    isPlanted = true
  })
  if (!isPlanted) throw new Error('no :focus-visible rule to plant in')
  return root.toString()
}
