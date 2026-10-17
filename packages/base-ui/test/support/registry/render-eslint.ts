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
