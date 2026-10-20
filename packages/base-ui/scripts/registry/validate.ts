/**
 * What the build refuses before it writes anything: an item that is not a universal item, a target
 * that is not a plain relative path under `components/nave/`, a file of another type, and any
 * lint-suppression comment other than the one Nave's own stylelint rule needs. Each refusal names
 * the item and the file.
 */
import type { RegistryItem } from './items.ts'

import { RegistryBuildError } from './errors.ts'
import { TARGET_DIRECTORY } from './items.ts'
import { OUTLINE_COMMENT } from './module-css.ts'
import { typesComment } from './sources.ts'

const PLAIN_TARGET = new RegExp(`^${TARGET_DIRECTORY}/[A-Za-z0-9][A-Za-z0-9._-]*$`)
const SUPPRESSION = /eslint-disable|@ts-|stylelint-disable/

export const validateItem = (item: RegistryItem): void => {
  if (item.type !== 'registry:item') {
    throw new RegistryBuildError(`type is ${item.type}, not registry:item`, { item: item.name })
  }
  for (const file of item.files) {
    const where = { file: file.path, item: item.name }
    if (file.type !== 'registry:file') {
      throw new RegistryBuildError(`type is ${file.type}, not registry:file`, where)
    }
    if (!PLAIN_TARGET.test(file.target) || file.target.includes('..')) {
      throw new RegistryBuildError(
        `target ${file.target} is not a plain relative path under ${TARGET_DIRECTORY}/`,
        where,
      )
    }
    const text = [
      typesComment(['@typescript-eslint/no-namespace']),
      typesComment(['@typescript-eslint/no-namespace', '@typescript-eslint/no-explicit-any']),
    ].reduce(
      (rest, comment) => rest.replaceAll(comment, ''),
      (file.content ?? '').replaceAll(OUTLINE_COMMENT, ''),
    )
    if (SUPPRESSION.test(text)) {
      throw new RegistryBuildError('carries a lint-suppression comment', where)
    }
  }
}
