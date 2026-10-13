/**
 * A fixture that names every type a Base UI subpath exports, found by walking TypeScript's own view
 * of each subpath's module and not through the reader the wrappers are generated from: a type the
 * generator never lists is still named here. Every generic is written with all of its type
 * parameters, defaulted ones included.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import path from 'node:path'
import ts from 'typescript'

import type { BaseUiVersion } from '../../scripts/wrappers/read-types.ts'
import type { BASE, NAVE } from './type-fixtures.ts'

import { declarationEntry } from '../../scripts/wrappers/read-types.ts'
import { SUBPATHS } from '../../scripts/wrappers/subpaths.ts'
import { PACKAGE_DIR } from './stylesheet.ts'
import { identifier } from './type-fixtures.ts'

/**
One line of the fixture, and the reference it makes as a reader would write it
(`Combobox.Root.Props<any, any, any>`).
 */
export interface Reference {
  readonly line: string
  readonly spelling: string
}

interface TypeName {
  readonly chain: readonly string[]
  readonly parameters: number
}

// Deep enough for `Combobox.Root.Props`, and the walk stops at a module it has already entered.
const MAX_DEPTH = 4

const resolved = (checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol =>
  symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

const parametersOf = (symbol: ts.Symbol): number =>
  Math.max(
    0,
    ...(symbol.declarations ?? []).map((declaration) =>
      'typeParameters' in declaration
        ? ((declaration.typeParameters as ts.NodeArray<ts.TypeParameterDeclaration> | undefined)
            ?.length ?? 0)
        : 0,
    ),
  )

const typeNamesBelow = (
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  chain: readonly string[],
  seen: ReadonlySet<ts.Symbol>,
): TypeName[] => {
  const target = resolved(checker, symbol)
  const own: TypeName[] =
    chain.length > 0 && target.flags & ts.SymbolFlags.Type
      ? [{ chain, parameters: parametersOf(target) }]
      : []
  if (chain.length > MAX_DEPTH || seen.has(target)) {
    return own
  }
  const inside = new Set(seen).add(target)
  return [
    ...own,
    ...(target.flags & (ts.SymbolFlags.Module | ts.SymbolFlags.Namespace)
      ? checker
          .getExportsOfModule(target)
          .flatMap((member) => typeNamesBelow(checker, member, [...chain, member.name], inside))
      : []),
  ]
}

/**
Every name with a meaning as a type that a subpath's module reaches, at any depth.
 */
const typeNamesOf = (version: BaseUiVersion): Map<string, TypeName[]> => {
  const program = ts.createProgram(
    SUBPATHS.map((subpath) => declarationEntry(version, subpath)),
    {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
      typeRoots: [path.join(PACKAGE_DIR, 'node_modules/@types')],
    },
  )
  const checker = program.getTypeChecker()
  return new Map(
    SUBPATHS.map((subpath) => {
      const file = program.getSourceFile(declarationEntry(version, subpath))
      const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
      if (module === undefined) {
        throw new Error(`no declarations for ${subpath} at the ${version} Base UI`)
      }
      return [subpath, typeNamesBelow(checker, module, [], new Set())]
    }),
  )
}

/**
The references of the fixture: each type name of each subpath, with every type parameter written as
`any`. The spelling leaves out the module's own alias, so it reads as Base UI's documentation does.
 */
export const typeWalkReferences = (version: BaseUiVersion): Reference[] => {
  let index = 0
  return [...typeNamesOf(version)].flatMap(([subpath, names]) =>
    names.map(({ chain, parameters }) => {
      const args =
        parameters === 0 ? '' : `<${Array.from({ length: parameters }, () => 'any').join(', ')}>`
      index += 1
      return {
        line: `export type R${index} = M_${identifier(subpath)}.${chain.join('.')}${args}`,
        spelling: `${chain.join('.')}${args}`,
      }
    }),
  )
}

/**
The fixture as a file: one namespace import for each subpath, from `from`, then the references.
 */
export const typeWalkFixture = (
  references: readonly Reference[],
  from: typeof BASE | typeof NAVE,
): string =>
  [
    ...SUBPATHS.map((subpath) => `import * as M_${identifier(subpath)} from '${from}/${subpath}'`),
    ...references.map(({ line }) => line),
  ].join('\n')
