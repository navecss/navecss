/**
 * The parts younger than the Base UI floor, read from the declarations of the two installed Base UI
 * packages, and the check that a copy reads each of them in the form the floor's types accept.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import ts from 'typescript'

import type { Problem } from './files-problem.ts'
import type { LoadedRegistry } from './load.ts'

import { readBaseUiTypes } from '../../../scripts/wrappers/read-types.ts'
import { foldWhitespace } from './files-sources.ts'

export interface YoungPart {
  readonly key: string
  readonly subpath: string
}

/**
 * The keys of each `@base-ui/react/<s>` namespace that the devDependency version declares and the
 * floor version does not, by subpath.
 */
export const youngParts = (): YoungPart[] => {
  const atFloor = new Map(
    readBaseUiTypes('floor').map((entry) => [
      entry.subpath,
      new Set(entry.parts.map((part) => part.name)),
    ]),
  )
  return readBaseUiTypes('current').flatMap((entry) =>
    entry.parts
      .filter((part) => atFloor.get(entry.subpath)?.has(part.name) !== true)
      .map((part) => ({ key: part.name, subpath: entry.subpath })),
  )
}

/**
 * The line the spec gives for a part younger than the floor, with its whitespace folded.
 */
export const castStatement = (key: string): string =>
  `export const ${key}: PartOf<typeof Base, '${key}'> = /*#__PURE__*/ (() => (Base as Record<string, unknown>).${key} as PartOf<typeof Base, '${key}'>)()`

const statementOf = (source: ts.SourceFile, key: string): string | undefined => {
  const found = source.statements.find(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === key,
      ),
  )
  return found === undefined ? undefined : foldWhitespace(found.getText(source))
}

const directAccess = (key: string): RegExp =>
  new RegExp(String.raw`\bBase(?:\.${key}\b|\[\s*['"]${key}['"]\s*\])`)

const partProblems = (content: string, key: string): string[] => {
  const source = ts.createSourceFile('parts.ts', content, ts.ScriptTarget.ES2022, true)
  const statement = statementOf(source, key)
  if (statement === undefined) return [`has no export ${key}`]
  const problems: string[] = []
  if (!statement.includes(`PartOf<typeof Base, '${key}'>`)) {
    problems.push(`${key} is not read through PartOf<typeof Base, '${key}'>`)
  }
  if (directAccess(key).test(content)) {
    problems.push(`${key} is read by a direct Base.${key} property access`)
  }
  if (statement !== castStatement(key)) {
    problems.push(`${key} is not the cast form the spec gives: ${statement}`)
  }
  return problems
}

/**
 * Each part younger than the floor is read through `PartOf` in the cast form, never by a direct
 * property access the floor's types reject.
 */
export const youngPartProblems = (
  registry: LoadedRegistry,
  young: readonly YoungPart[],
): Problem[] =>
  young.flatMap(({ key, subpath }) => {
    const item = registry.items.get(`base-ui-${subpath}`)
    const target = `components/nave/nave-${subpath}.parts.ts`
    const file = item?.files.find((candidate) => candidate.target === target)
    if (file?.content === undefined) {
      return [{ file: target, item: `base-ui-${subpath}`, message: `has no parts file for ${key}` }]
    }
    return partProblems(file.content, key).map((message) => ({
      file: target,
      item: `base-ui-${subpath}`,
      message,
    }))
  })
