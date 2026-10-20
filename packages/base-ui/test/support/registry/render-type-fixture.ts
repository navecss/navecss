/**
 * The type fixture of the copies' criterion: every value and type export of `@navecss/base-ui/<s>`
 * for each styled subpath, named as a reader would write it, and the mutual-assignability assertions
 * between a wrapped part's props in the package and in its copy. The exports are read from the
 * package's declarations with the compiler's own view of each module, in the run's Base UI.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { SINGLE_COMPONENT, topName } from '../subpaths.ts'
import { type BaseUiVersion, buildProgram } from './render-types.ts'

const PACKAGE = '@navecss/base-ui'

// Deep enough for `Combobox.Root.Props`; the walk also stops at a module it has already entered.
const MAX_DEPTH = 4

const identifier = (subpath: string): string => subpath.replaceAll('-', '_')

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

interface Reference {
  readonly chain: readonly string[]
  readonly parameters: number
}

const isModule = (symbol: ts.Symbol): boolean =>
  (symbol.flags & (ts.SymbolFlags.Module | ts.SymbolFlags.Namespace)) !== 0

interface Walk {
  readonly chain: readonly string[]
  readonly seen: ReadonlySet<ts.Symbol>
}

/**
 * Every name below a symbol that has a meaning as `kind` (a value, or a type), at any depth.
 */
const referencesBelow = (
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  kind: ts.SymbolFlags,
  { chain, seen }: Walk,
): Reference[] => {
  const target = resolved(checker, symbol)
  const own: Reference[] =
    chain.length > 0 && target.flags & kind
      ? [{ chain, parameters: kind === ts.SymbolFlags.Type ? parametersOf(target) : 0 }]
      : []
  if (chain.length > MAX_DEPTH || seen.has(target) || !isModule(target)) return own
  const inside = new Set(seen).add(target)
  return [
    ...own,
    ...checker
      .getExportsOfModule(target)
      .flatMap((member) =>
        referencesBelow(checker, member, kind, { chain: [...chain, member.name], seen: inside }),
      ),
  ]
}

const spelling = ({ chain, parameters }: Reference): string =>
  `${chain.join('.')}${parameters === 0 ? '' : `<${Array.from({ length: parameters }, () => 'any').join(', ')}>`}`

export interface SubpathReferences {
  readonly subpath: string
  readonly types: readonly Reference[]
  readonly values: readonly Reference[]
}

const importLine = (subpath: string): string =>
  `import * as M_${identifier(subpath)} from '${PACKAGE}/${subpath}'`

/**
 * Every value and type reference each subpath's module reaches, in the run's Base UI. The probe is
 * compiled for its symbols only; nothing reads its errors.
 */
export const referencesOf = (
  directory: string,
  version: BaseUiVersion,
  subpaths: readonly string[],
): SubpathReferences[] => {
  const program = buildProgram(directory, version, {
    'probe.ts': `${subpaths.map((subpath) => importLine(subpath)).join('\n')}\nexport {}\n`,
  })
  const checker = program.getTypeChecker()
  const probe = program.getSourceFiles().find((file) => path.basename(file.fileName) === 'probe.ts')
  const imports = probe?.statements.filter((statement) => ts.isImportDeclaration(statement)) ?? []
  return subpaths.map((subpath, index) => {
    const specifier = imports[index]?.moduleSpecifier
    const module = specifier === undefined ? undefined : checker.getSymbolAtLocation(specifier)
    if (module === undefined) throw new Error(`no declarations for ${PACKAGE}/${subpath}`)
    return {
      subpath,
      types: referencesBelow(checker, module, ts.SymbolFlags.Type, { chain: [], seen: new Set() }),
      values: valuesOf(checker, module, valueExportNames(program, subpath)),
    }
  })
}

/**
 * The names a subpath's declaration file exports as values: the exports that are not `export type`
 * (`export * as Dialog from ...`, `export { Button } from ...`). A type-only re-export of Base UI's
 * flat names also lists as a property of the module's type, so the file is the authority.
 */
const valueExportNames = (program: ts.Program, subpath: string): Set<string> => {
  const file = program.getSourceFile(path.join(PACKAGE_DIR, 'dist', subpath, 'index.d.ts'))
  if (file === undefined) throw new Error(`no dist/${subpath}/index.d.ts`)
  const names = file.statements
    .filter((statement) => ts.isExportDeclaration(statement) && !statement.isTypeOnly)
    .flatMap((statement) => {
      const { exportClause } = statement as ts.ExportDeclaration
      if (exportClause === undefined) return []
      return ts.isNamespaceExport(exportClause)
        ? [exportClause.name.text]
        : exportClause.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => element.name.text)
    })
  return new Set(names)
}

/**
 * Each value export and, inside a namespace object among them, its values.
 */
const valuesOf = (
  checker: ts.TypeChecker,
  module: ts.Symbol,
  names: ReadonlySet<string>,
): Reference[] =>
  checker
    .getExportsOfModule(module)
    .filter((member) => names.has(member.name))
    .flatMap((member) =>
      referencesBelow(checker, member, ts.SymbolFlags.Value, {
        chain: [member.name],
        seen: new Set([module]),
      }),
    )

/**
 * The fixture as a file: one namespace import for each subpath, then a value reference and a type
 * reference for everything it exports, with every type parameter written as `any`.
 */
export const fixtureText = (references: readonly SubpathReferences[]): string => {
  let index = 0
  const lines = references.flatMap(({ subpath, types, values }) => {
    const id = `M_${identifier(subpath)}`
    return [
      ...values.map((reference) => `export const V${(index += 1)} = ${id}.${spelling(reference)}`),
      ...types.map((reference) => `export type T${(index += 1)} = ${id}.${spelling(reference)}`),
    ]
  })
  return [...references.map(({ subpath }) => importLine(subpath)), ...lines, ''].join('\n')
}

/**
 * The same fixture with each specifier read as the copy's entry.
 */
export const rewrittenToCopies = (fixture: string): string =>
  fixture.replaceAll(new RegExp(String.raw`from '${PACKAGE}/([\w-]+)'`, 'g'), "from './nave-$1'")

const TYPE_NAMESPACE = /^export declare namespace (\w+) \{\n([\s\S]*?)^\}/gm
const DECLARED_TYPE = /export type (\w+)/g
const WRAPPER_CALL = /export const (\w+)\b[^\n]*\bwrap(?:Variant|Size|Avatar)?Part\(/g

export interface GeneratedModule {
  /**
  The type names each part's type namespace declares, by part.
   */
  readonly typeNames: ReadonlyMap<string, readonly string[]>
  /**
  The parts the module wraps.
   */
  readonly wrapped: readonly string[]
}

/**
 * Reads `src/<subpath>/parts.generated.ts`: the parts it wraps, and the type names each part's type
 * namespace declares.
 */
export const generatedModuleOf = (subpath: string): GeneratedModule => {
  const text = readFileSync(path.join(PACKAGE_DIR, 'src', subpath, 'parts.generated.ts'), 'utf8')
  return {
    typeNames: new Map(
      text.matchAll(TYPE_NAMESPACE).map(
        ([, part = '', body = '']) =>
          [
            part,
            body
              .matchAll(DECLARED_TYPE)
              .map((match) => match[1] ?? '')
              .toArray(),
          ] as const,
      ),
    ),
    wrapped: text
      .matchAll(WRAPPER_CALL)
      .map((match) => match[1] ?? '')
      .toArray(),
  }
}

/**
 * How a part's type is reached from a subpath's module: `Dialog.Popup.Props`, or `Button.Props` for
 * a subpath that is a single component.
 */
export const typeChain = (subpath: string, part: string, name: string): string[] =>
  SINGLE_COMPONENT.has(subpath) ? [topName(subpath), name] : [topName(subpath), part, name]

const ASSERTIONS =
  'type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false\n' +
  'type Assert<T extends true> = T\n'

const typeOfChain = (
  references: readonly SubpathReferences[],
  subpath: string,
  chain: readonly string[],
): Reference => {
  const reference = references
    .find((entry) => entry.subpath === subpath)
    ?.types.find((candidate) => candidate.chain.join('.') === chain.join('.'))
  if (reference === undefined) {
    throw new Error(`${PACKAGE}/${subpath} declares no ${chain.join('.')}`)
  }
  return reference
}

/**
 * For every wrapped part of the given subpaths: its props type in the package and in the copy are
 * assignable to each other, as one assertion each. The package side imports the subpath and the
 * copy side its entry.
 */
export const assignabilityText = (references: readonly SubpathReferences[]): string => {
  const subpaths = references.map(({ subpath }) => subpath)
  const imports = subpaths.flatMap((subpath) => [
    `import * as P_${identifier(subpath)} from '${PACKAGE}/${subpath}'`,
    `import * as C_${identifier(subpath)} from './nave-${subpath}'`,
  ])
  let index = 0
  const assertions = subpaths.flatMap((subpath) =>
    generatedModuleOf(subpath).wrapped.map((part) => {
      const reference = typeOfChain(references, subpath, typeChain(subpath, part, 'Props'))
      const id = identifier(subpath)
      const [packageSide, copySide] = [
        `P_${id}.${spelling(reference)}`,
        `C_${id}.${spelling(reference)}`,
      ]
      return `export type A${(index += 1)}_${id}_${part} = Assert<Same<${packageSide}, ${copySide}>>`
    }),
  )
  return [...imports, ASSERTIONS, ...assertions, ''].join('\n')
}
