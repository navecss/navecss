/**
 * The type instruments for the seven subpaths of the feedback and navigation spec (Toast,
 * Navigation Menu, Scroll Area, Meter, Progress, Avatar, Separator): what the installed Base UI
 * (the devDependency, or the 1.3.0 floor) declares for each one, read from its declaration files
 * with the TypeScript compiler API and not from the package under test, and the fixtures for the
 * import swap and for the part-by-part equality. They are compiled with `compile` from
 * `type-fixtures.ts` against the built package, so a missing subpath, a missing member and a
 * mistyped part are all compile errors of the fixture.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import path from 'node:path'
import ts from 'typescript'

import type { BaseUiVersion } from '../../scripts/wrappers/read-types.ts'

import { declarationEntry } from '../../scripts/wrappers/read-types.ts'
import { FEEDBACK_SUBPATHS, FEEDBACK_TOP } from './feedback-subpaths.ts'
import { PACKAGE_DIR } from './stylesheet.ts'
import { BASE, EQUAL, identifier, NAVE } from './type-fixtures.ts'

export interface FeedbackPart {
  /**
  The type parameters of the part's call signature, empty when it is not generic.
   */
  readonly callTypeParameters: readonly string[]
  /**
  The members of the part's type namespace that the spec names (`Props`, `State`), each with the
  number of type parameters it declares.
   */
  readonly members: readonly { readonly name: string; readonly parameters: number }[]
  /**
  `.` for a component that is not a namespace.
   */
  readonly name: string
}

export interface FeedbackSubpathTypes {
  /**
  Every type-only name the subpath exports besides its component (Base UI's flat type exports),
  with the number of type parameters each declares. A name that is also a value or a namespace
  (`ToastRoot`, the part itself) is not a type-only export and is left out.
   */
  readonly flatTypes: readonly { readonly name: string; readonly parameters: number }[]
  readonly parts: readonly FeedbackPart[]
  readonly subpath: string
  /**
  The members of the namespace that are only a type (`Progress.Status`).
   */
  readonly typeMembers: readonly string[]
}

const hasFlag = (symbol: ts.Symbol, flag: ts.SymbolFlags): boolean => (symbol.flags & flag) !== 0

const resolved = (checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol =>
  hasFlag(symbol, ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol

const parameterCount = (symbol: ts.Symbol | undefined): number => {
  const declaration = symbol?.declarations?.[0]
  return declaration !== undefined && 'typeParameters' in declaration
    ? ((declaration.typeParameters as ts.NodeArray<ts.TypeParameterDeclaration> | undefined)
        ?.length ?? 0)
    : 0
}

/**
A type named with every one of its type parameters, each written as `any`.
 */
const argumentsOf = (parameters: number): string =>
  parameters === 0 ? '' : `<${Array.from({ length: parameters }, () => 'any').join(', ')}>`

const NAMED_MEMBERS = ['Props', 'State'] as const

interface Reading {
  readonly checker: ts.TypeChecker
  readonly file: ts.SourceFile
}

const partOf = ({ checker, file }: Reading, name: string, symbol: ts.Symbol): FeedbackPart => {
  const [signature] = checker.getTypeOfSymbolAtLocation(symbol, file).getCallSignatures()
  return {
    callTypeParameters: signature?.typeParameters?.map((parameter) => parameter.symbol.name) ?? [],
    members: NAMED_MEMBERS.flatMap((member) => {
      const found = symbol.exports?.get(member as ts.__String)
      return found === undefined ? [] : [{ name: member, parameters: parameterCount(found) }]
    }),
    name,
  }
}

const flatTypesOf = (
  checker: ts.TypeChecker,
  exports: readonly ts.Symbol[],
  top: string,
): FeedbackSubpathTypes['flatTypes'] =>
  exports
    .filter((symbol) => symbol.name !== top)
    .map((symbol) => ({ name: symbol.name, target: resolved(checker, symbol) }))
    .filter(
      ({ target }) =>
        hasFlag(target, ts.SymbolFlags.Type) &&
        !hasFlag(target, ts.SymbolFlags.Value | ts.SymbolFlags.Namespace),
    )
    .map(({ name, target }) => ({ name, parameters: parameterCount(target) }))

const readSubpath = (
  reading: Reading,
  subpath: string,
  module: ts.Symbol,
): FeedbackSubpathTypes => {
  const { checker } = reading
  const top = FEEDBACK_TOP[subpath] ?? ''
  const exports = checker.getExportsOfModule(module)
  const component = exports.find((symbol) => symbol.name === top)
  if (component === undefined) {
    throw new Error(`${subpath} exports no ${top}`)
  }
  const target = resolved(checker, component)
  const members = checker.getExportsOfModule(target)
  // A component is a namespace of parts when its exports are themselves components.
  const isNamespace = members.length > 0 && !target.exports?.has('Props' as ts.__String)
  const named = members.map((member) => ({ name: member.name, symbol: resolved(checker, member) }))
  const isValue = ({ symbol }: { symbol: ts.Symbol }): boolean =>
    hasFlag(symbol, ts.SymbolFlags.Value)
  return {
    flatTypes: flatTypesOf(checker, exports, top),
    parts: isNamespace
      ? named
          .filter((entry) => isValue(entry))
          .map(({ name, symbol }) => partOf(reading, name, symbol))
      : [partOf(reading, '.', target)],
    subpath,
    typeMembers: isNamespace
      ? named
          .filter((entry) => hasFlag(entry.symbol, ts.SymbolFlags.Type) && !isValue(entry))
          .map(({ name }) => name)
      : [],
  }
}

/**
What the Base UI the version names declares for the seven subpaths.
 */
export const readFeedbackTypes = (version: BaseUiVersion): FeedbackSubpathTypes[] => {
  const entries = FEEDBACK_SUBPATHS.map((subpath) => declarationEntry(version, subpath))
  const program = ts.createProgram(entries, {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
    typeRoots: [path.join(PACKAGE_DIR, 'node_modules/@types')],
  })
  const checker = program.getTypeChecker()
  return FEEDBACK_SUBPATHS.map((subpath, index) => {
    const file = program.getSourceFile(entries[index] ?? '')
    const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    if (file === undefined || module === undefined) {
      throw new Error(`no declarations for ${subpath} at the ${version} Base UI`)
    }
    return readSubpath({ checker, file }, subpath, module)
  })
}

const accessor = (subpath: string, part: string): string =>
  part === '.' ? (FEEDBACK_TOP[subpath] ?? '') : `${FEEDBACK_TOP[subpath] ?? ''}.${part}`

/**
`typeof` the part, read from the namespace import `side` made of the subpath.
 */
export const feedbackTypeOf = (side: 'B' | 'N', subpath: string, part: string): string =>
  `typeof ${side}_${identifier(subpath)}.${accessor(subpath, part)}`

/**
The props of a part's call signature, a generic part named with a `string` argument.
 */
export const feedbackPropsOf = (
  side: 'B' | 'N',
  info: FeedbackSubpathTypes,
  part: string,
): string => {
  const isGeneric = (info.parts.find((p) => p.name === part)?.callTypeParameters.length ?? 0) > 0
  const type = feedbackTypeOf(side, info.subpath, part)
  return isGeneric ? `Parameters<${type}<string>>[0]` : `Parameters<${type}>[0]`
}

/**
Both sides of a comparison: this package's subpaths and Base UI's, as namespace imports.
 */
export const feedbackImports = (infos: readonly FeedbackSubpathTypes[]): string[] =>
  infos.flatMap(({ subpath }) => [
    `import * as N_${identifier(subpath)} from '${NAVE}/${subpath}'`,
    `import * as B_${identifier(subpath)} from '${BASE}/${subpath}'`,
  ])

// The dotted `NavigationMenu.Root.Props` is the third recorded floor exception (QA's ruling on the
// carrier): a part's types are declared from the floor, which gives the Props no type parameter, so
// at the current run the dotted spelling is not generic. The criterion names the flat
// `NavigationMenuRootProps<string>` and `NavigationMenuRoot.Value<string>` instead, and does not
// assert that the dotted one fails.
const isRecordedException = (subpath: string, part: string): boolean =>
  subpath === 'navigation-menu' && part === 'Root'

const importSwapLines = ({ flatTypes, parts, subpath }: FeedbackSubpathTypes): string[] => {
  const id = identifier(subpath)
  const imported = flatTypes.map(({ name }) => `${name} as T_${id}_${name}`)
  return [
    `import { ${FEEDBACK_TOP[subpath] ?? ''} } from '${BASE}/${subpath}'`,
    ...(imported.length === 0
      ? []
      : [`import type { ${imported.join(', ')} } from '${BASE}/${subpath}'`]),
    ...flatTypes.map(
      ({ name, parameters }) =>
        `export type F_${id}_${name} = T_${id}_${name}${argumentsOf(parameters)}`,
    ),
    ...parts.flatMap((part) =>
      part.members
        .filter(() => !isRecordedException(subpath, part.name))
        .map(
          ({ name, parameters }) =>
            `export type P_${id}_${part.name === '.' ? 'self' : part.name}_${name} = ${accessor(subpath, part.name)}.${name}${argumentsOf(parameters)}`,
        ),
    ),
  ]
}

/**
The import-swap fixture of the spec's type criterion, written against Base UI's specifier: for each
of the seven, every type-only export imported by name, every part's `Props` and `State` named, and
the members the criterion lists by name. `swapSpecifiers` rewrites the specifier to this package's,
so the two compile the same text.
 */
export const importSwapFixture = (
  infos: readonly FeedbackSubpathTypes[],
  options: { readonly navigationMenuRootProps: 'none' | 'string' },
): string =>
  [
    ...infos.flatMap((info) => importSwapLines(info)),
    'export type ProgressStatus = Progress.Status',
    'export type ManagerReturn = ReturnType<typeof Toast.useToastManager<{ id: string }>>',
    ...(options.navigationMenuRootProps === 'string'
      ? [
          `import type { NavigationMenuRoot as NMRoot, NavigationMenuRootProps as NMRootProps } from '${BASE}/navigation-menu'`,
          'export type NavigationMenuRootPropsOfString = NMRootProps<string>',
          'export type NavigationMenuRootValueOfString = NMRoot.Value<string>',
        ]
      : []),
  ].join('\n')

/**
The same fixture against this package: only the specifiers differ.
 */
export const swapSpecifiers = (fixture: string): string =>
  fixture.replaceAll(`${BASE}/`, () => `${NAVE}/`)

// The parts the equality leaves to their own criterion: the Button family's new parts and the
// avatar root, whose props gain `variant` and `size` or `size`.
const TYPED_APART: ReadonlySet<string> = new Set(['avatar.Root', 'toast.Action', 'toast.Close'])

/**
The part-by-part equality of the spec's typing criterion: every part outside the Button family and
outside `Avatar.Root` is typed as the Base UI part of its own namespace, and `Separator` as Base
UI's. `Toast.createToastManager` and `Toast.useToastManager` are parts of the namespace and are
held to the same equality, so their generic stays.
 */
export const feedbackEqualityFixture = (infos: readonly FeedbackSubpathTypes[]): string =>
  [
    ...feedbackImports(infos),
    EQUAL,
    ...infos.flatMap(({ parts, subpath }) =>
      parts
        .filter((part) => !TYPED_APART.has(`${subpath}.${part.name}`))
        .map(
          (part) =>
            `export type E_${identifier(subpath)}_${part.name === '.' ? 'self' : part.name} = Assert<Equal<${feedbackTypeOf('N', subpath, part.name)}, ${feedbackTypeOf('B', subpath, part.name)}>>`,
        ),
    ),
    // The generic `<Data>` of the two Toast functions is kept: Base UI's call with an argument is
    // the wrapper's, and the argument reaches the result (a function typed with `any` or with its
    // argument dropped makes the second assertion false).
    'export type Manager = Assert<Equal<ReturnType<typeof N_toast.Toast.useToastManager<{ id: string }>>, ReturnType<typeof B_toast.Toast.useToastManager<{ id: string }>>>>',
    'export type ManagerKeepsItsArgument = Assert<Equal<Equal<ReturnType<typeof N_toast.Toast.useToastManager<{ id: string }>>, ReturnType<typeof N_toast.Toast.useToastManager<{ name: string }>>>, false>>',
    'export type Created = Assert<Equal<ReturnType<typeof N_toast.Toast.createToastManager<{ id: string }>>, ReturnType<typeof B_toast.Toast.createToastManager<{ id: string }>>>>',
  ].join('\n')
