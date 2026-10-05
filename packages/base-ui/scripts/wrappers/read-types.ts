/**
 * Reading the declarations of an installed Base UI: for each v1 subpath, the type-only names the
 * subpath exports and, for each part of its component, what kind of thing the part is, whether its
 * call signature is generic and what its type namespace holds. The generator writes the wrappers
 * from the current version; the type tests read both versions, so a fixture only names what the
 * installed version declares.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import { SUBPATHS, topName } from './subpaths.ts'

export type BaseUiVersion = 'current' | 'floor'

/**
One member of a part's type namespace, with the type parameters it declares as written and the
names to pass them on by.
 */
export interface MemberTypes {
  readonly arguments: readonly string[]
  /**
  The parameters without their defaults, as a function would declare them.
   */
  readonly bare: readonly string[]
  readonly name: string
  readonly parameters: readonly string[]
}

export interface PartTypes {
  /**
  The type parameters of the part's call signature, empty when it is not generic.
   */
  readonly callTypeParameters: readonly string[]
  /**
  A class (a handle), a function (`createHandle`), or a component.
   */
  readonly kind: 'class' | 'component' | 'function'
  /**
  The type parameters of a class, as written.
   */
  readonly classParameters: readonly string[]
  readonly members: readonly MemberTypes[]
  readonly name: string
  /**
  The element the part's `ref` is typed with (`HTMLButtonElement`), when it declares one.
   */
  readonly refElement: string | undefined
}

export interface SubpathTypes {
  /**
  Names the subpath exports besides its component: Base UI's flat type exports.
   */
  readonly flatTypes: readonly string[]
  /**
  Parts of the namespace, or `.` for a component that is not a namespace.
   */
  readonly parts: readonly PartTypes[]
  readonly subpath: string
}

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const NODE_MODULES = path.join(PACKAGE_DIR, 'node_modules')

/**
Where an installed Base UI keeps a subpath's declaration entry.
 */
export const declarationEntry = (version: BaseUiVersion, subpath: string): string =>
  version === 'current'
    ? path.join(NODE_MODULES, '@base-ui/react', subpath, 'index.d.mts')
    : path.join(NODE_MODULES, 'base-ui-react-floor/esm', subpath, 'index.d.ts')

const hasFlag = (symbol: ts.Symbol, flag: ts.SymbolFlags): boolean => (symbol.flags & flag) !== 0

const resolved = (checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol =>
  hasFlag(symbol, ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol

const typeParametersOf = (
  symbol: ts.Symbol | undefined,
): readonly ts.TypeParameterDeclaration[] => {
  const declaration = symbol?.declarations?.[0]
  return declaration !== undefined && 'typeParameters' in declaration
    ? ((declaration.typeParameters as ts.NodeArray<ts.TypeParameterDeclaration> | undefined) ?? [])
    : []
}

const memberTypes = (symbol: ts.Symbol, name: string): MemberTypes => {
  const parameters = typeParametersOf(symbol.exports?.get(name as ts.__String))
  return {
    arguments: parameters.map((parameter) => parameter.name.text),
    bare: parameters.map((parameter) =>
      parameter.constraint === undefined
        ? parameter.name.text
        : `${parameter.name.text} extends ${parameter.constraint.getText()}`,
    ),
    name,
    parameters: parameters.map((parameter) => parameter.getText()),
  }
}

const kindOf = (symbol: ts.Symbol): PartTypes['kind'] => {
  if (hasFlag(symbol, ts.SymbolFlags.Class)) {
    return 'class'
  }
  return hasFlag(symbol, ts.SymbolFlags.Function) &&
    !hasFlag(symbol, ts.SymbolFlags.NamespaceModule)
    ? 'function'
    : 'component'
}

/**
 * The element type a part's `ref` prop is declared with: the argument of the `RefAttributes` its
 * props carry.
 */
const refElementOf = (
  checker: ts.TypeChecker,
  file: ts.SourceFile,
  signature: ts.Signature | undefined,
): string | undefined => {
  const parameter = signature?.parameters[0]
  if (parameter === undefined) {
    return undefined
  }
  const type = checker.getTypeOfSymbolAtLocation(parameter, file)
  const constituents = type.isIntersection() ? type.types : [type]
  const attributes = constituents.find(
    (constituent) => constituent.symbol?.name === 'RefAttributes',
  )
  const argument =
    attributes === undefined
      ? undefined
      : checker.getTypeArguments(attributes as ts.TypeReference)[0]
  return argument === undefined ? undefined : checker.typeToString(argument)
}

const partTypes = (
  checker: ts.TypeChecker,
  file: ts.SourceFile,
  name: string,
  symbol: ts.Symbol,
): PartTypes => {
  const type = checker.getTypeOfSymbolAtLocation(symbol, file)
  const [signature] = type.getCallSignatures()
  const names = [...(symbol.exports?.keys() ?? [])]
    .map(String)
    .filter((key) => key !== 'default' && key !== 'prototype')
  const kind = kindOf(symbol)
  return {
    callTypeParameters: signature?.typeParameters?.map((parameter) => parameter.symbol.name) ?? [],
    classParameters:
      kind === 'class' ? typeParametersOf(symbol).map((parameter) => parameter.getText()) : [],
    kind,
    members: names.map((member) => memberTypes(symbol, member)),
    name,
    refElement: refElementOf(checker, file, signature),
  }
}

/**
Reads every v1 subpath of the Base UI the version names.
 */
export const readBaseUiTypes = (version: BaseUiVersion): SubpathTypes[] => {
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
      typeRoots: [path.join(NODE_MODULES, '@types')],
    },
  )
  const checker = program.getTypeChecker()
  return SUBPATHS.map((subpath) => {
    const file = program.getSourceFile(declarationEntry(version, subpath))
    const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    if (file === undefined || module === undefined) {
      throw new Error(`no declarations for ${subpath} at the ${version} Base UI`)
    }
    const exports = checker.getExportsOfModule(module)
    const top = exports.find((symbol) => symbol.name === topName(subpath))
    if (top === undefined) {
      throw new Error(`${subpath} exports no ${topName(subpath)}`)
    }
    const component = resolved(checker, top)
    // A component is a namespace of parts when its exports are themselves components.
    const members = checker.getExportsOfModule(component)
    const isNamespace = members.length > 0 && !component.exports?.has('Props' as ts.__String)
    const parts = isNamespace
      ? members
          .map((member) => ({ member, symbol: resolved(checker, member) }))
          .filter(({ symbol }) => hasFlag(symbol, ts.SymbolFlags.Value))
          .map(({ member, symbol }) => partTypes(checker, file, member.name, symbol))
      : [partTypes(checker, file, '.', component)]
    return {
      flatTypes: exports.map((symbol) => symbol.name).filter((name) => name !== topName(subpath)),
      parts,
      subpath,
    }
  })
}
