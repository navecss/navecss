/**
 * Linting the copies the way a consumer's ESLint would: the Node API with no config file, a flat
 * config built here, unused disable directives reported as errors, over the `.ts` files of a
 * directory the items were written to.
 */
import js from '@eslint/js'
import naveEslint from '@navecss/eslint-plugin'
import { ESLint, type Linter } from 'eslint'
import path from 'node:path'
import { configs as typescriptConfigs } from 'typescript-eslint'

import type { RegistryItem } from './load.ts'

const REPORT_UNUSED: Linter.Config = { linterOptions: { reportUnusedDisableDirectives: 'error' } }

/**
 * `@eslint/js` and `typescript-eslint` recommended, as a consumer sets them up.
 */
export const consumerConfig = (): Linter.Config[] => [
  js.configs.recommended,
  ...(typescriptConfigs.recommended as Linter.Config[]),
  REPORT_UNUSED,
]

/**
 * The same, and the config `@navecss/eslint-plugin` ships.
 */
export const naveConfig = (): Linter.Config[] => {
  const recommended = naveEslint.configs?.recommended
  if (recommended === undefined || Array.isArray(recommended)) {
    throw new Error('@navecss/eslint-plugin has no single recommended config to extend')
  }
  return [...consumerConfig(), recommended as Linter.Config]
}

/**
 * Every message of a lint of the `.ts` files in a directory, as `<file>:<line>:<column>
 * <severity> <rule> <message>`, with the number of files linted.
 */
export const lintDirectory = async (
  directory: string,
  config: Linter.Config[],
): Promise<{ files: number; messages: string[] }> => {
  const eslint = new ESLint({ cwd: directory, overrideConfig: config, overrideConfigFile: true })
  const results = await eslint.lintFiles(['*.ts'])
  return {
    files: results.length,
    messages: results.flatMap((result) =>
      result.messages.map(
        (message) =>
          `${path.basename(result.filePath)}:${message.line}:${message.column} ${message.severity === 2 ? 'error' : 'warning'} ${message.ruleId ?? '(no rule)'} ${message.message}`,
      ),
    ),
  }
}

/**
 * The item with a lint comment put on the first line of its entry (`nave-<subpath>.ts`).
 */
export const withDisableComment = (item: RegistryItem, comment: string): RegistryItem => {
  const planted = structuredClone(item)
  const entryName = `nave-${item.name.replace(/^base-ui-/, '')}.ts`
  const entry = planted.files.find((file) => path.posix.basename(file.target) === entryName)
  if (entry?.content === undefined) throw new Error(`${item.name}: the item has no ${entryName}`)
  entry.content = `${comment}\n${entry.content}`
  return planted
}

/**
 * The item with its parts file's content changed by `change`.
 */
export const withPartsFile = (
  item: RegistryItem,
  change: (text: string) => string,
): RegistryItem => {
  const planted = structuredClone(item)
  const parts = planted.files.find((file) => file.target.endsWith('.parts.ts'))
  if (parts?.content === undefined) throw new Error(`${item.name}: the item has no parts file`)
  const changed = change(parts.content)
  if (changed === parts.content)
    throw new Error(`${item.name}: the change left the parts file as it was`)
  parts.content = changed
  return planted
}

export const REASON =
  'the types keep the names and generic defaults @navecss/base-ui exports, so code typed against the package compiles here unchanged'
export const REASON_SHA256 = '539ec6e43ca57e876d824733050da0cd7acf4511facef012011c326ac6a5a2c1'
export const TYPES_RULES = ['@typescript-eslint/no-namespace', '@typescript-eslint/no-explicit-any']
const TYPES_COMMENT = /^\/\* eslint-disable (\S+(?:, \S+)*) -- (.*) \*\/$/

const countOf = (text: string | undefined): number => (text?.match(/eslint-disable/g) ?? []).length

const commentLineProblems = (item: RegistryItem, lines: readonly string[]): string[] => {
  const at = lines.indexOf("'use client'")
  const match = TYPES_COMMENT.exec(lines[at + 1] ?? '')
  if (at === -1 || match === null) return [`${item.name}: no lint comment after 'use client'`]
  const rules = match[1]?.split(', ') ?? []
  return [
    ...(match[2] === REASON ? [] : [`${item.name}: the reason differs`]),
    ...(rules[0] === TYPES_RULES[0] && rules.every((rule) => TYPES_RULES.includes(rule))
      ? []
      : [`${item.name}: rules are ${rules.join(', ')}`]),
    ...(new Set(rules).size === rules.length ? [] : [`${item.name}: a rule is named twice`]),
  ]
}

/**
 * What is wrong with an item's lint comments: the parts file's comment must follow `'use client'`
 * directly, name only the two rules (no-namespace first, none twice) with the reason, and be the only
 * `eslint-disable` of the item's files.
 */
export const typesCommentProblems = (item: RegistryItem): string[] => {
  const parts = item.files.find((file) => file.target.endsWith('.parts.ts'))
  return [
    ...commentLineProblems(item, (parts?.content ?? '').split('\n')),
    ...item.files.flatMap((file) => {
      const expected = file === parts ? 1 : 0
      const count = countOf(file.content)
      return count === expected
        ? []
        : [`${file.target}: ${count} eslint-disable, expected ${expected}`]
    }),
  ]
}
