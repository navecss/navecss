/**
 * The reader on authored TypeScript (AC-nextjs-used-atoms-09). A host that reads a project's own
 * source rather than its compiled output hands the reader a syntax tree that still holds types, so
 * the reader learns a closed list: `as`, `satisfies`, the non-null `!` and the angle-bracket
 * assertion are transparent around an argument or an initialiser, a name in a type position is
 * no reference, and an `import type` binds nothing. Each correct form must read as the same
 * module with its types stripped; the values under a wrapper are still judged as before.
 */
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { childrenOf } from '../src/vite-ast.ts'
import { CX_SOURCE, type ModuleReading, readModule, type ReadOptions } from '../src/vite-collect.ts'

const IMPORT = `import { cx } from '${CX_SOURCE}'\nimport type { AtomName } from '@navecss/core/atoms'\n`

interface Verdict {
  readonly atoms: readonly string[]
  readonly problems: readonly string[]
}

const OPTIONS: ReadOptions = {
  cxSources: new Set([CX_SOURCE]),
  ownAtoms: new Set(),
  isDependency: false,
}

/**
 * Reads `code` through `tree`, its parse.
 */
function readTree(code: string, tree: AstNode, options: ReadOptions = OPTIONS): ModuleReading {
  return readModule(code, tree, options)
}

/**
 * Reads `code` as the language `lang` names.
 */
function read(code: string, lang: 'js' | 'ts', options: ReadOptions = OPTIONS): ModuleReading {
  return readTree(code, parseAst(code, { lang }) as unknown as AstNode, options)
}

/**
 * What a reading found: the atoms it collected and the kind of each problem it reported.
 */
function verdictOf(reading: ModuleReading): Verdict {
  return {
    atoms: [...new Set([...reading.atoms, ...reading.classes])].toSorted((first, second) =>
      first.localeCompare(second),
    ),
    problems: reading.problems.map((problem) => problem.kind),
  }
}

/**
 * What the authored file gives.
 */
function authoredVerdict(code: string): Verdict {
  return verdictOf(read(code, 'ts'))
}

/**
 * `code` with its types stripped, as the compiler a host runs before the reader would leave it.
 */
function stripCode(code: string): string {
  return transpileModule(code, {
    compilerOptions: {
      target: ScriptTarget.ESNext,
      module: ModuleKind.ESNext,
      verbatimModuleSyntax: true,
    },
  }).outputText
}

/**
 * What the file gives once its types are stripped.
 */
function strippedVerdict(code: string): Verdict {
  return verdictOf(read(stripCode(code), 'js'))
}

/**
 * Whether any node of the parse of `code` is one `isWanted` accepts.
 */
function hasNode(code: string, isWanted: (node: AstNode) => boolean): boolean {
  const stack = [parseAst(code, { lang: 'ts' }) as unknown as AstNode]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (isWanted(node)) return true
    stack.push(...childrenOf(node))
  }
  return false
}

const none: Verdict = { atoms: [], problems: [] }
const flex: Verdict = { atoms: ['flex'], problems: [] }
const grid: Verdict = { atoms: ['grid'], problems: [] }
const argument: Verdict = { atoms: [], problems: ['argument'] }

interface Row {
  readonly form: string
  readonly code: string
  /**
   * The syntax node the row is about, so a row that stops reaching it is named.
   */
  readonly reaches: (node: AstNode) => boolean
  /**
   * What reading the file with its types stripped gives.
   */
  readonly column: Verdict
  /**
   * What the authored file gives, when it differs from the stripped one on purpose.
   */
  readonly authored?: Verdict
}

const ofType =
  (type: string): ((node: AstNode) => boolean) =>
  (node) =>
    node.type === type
const isTypeImport = (node: AstNode): boolean =>
  node.type === 'ImportDeclaration' && node.importKind === 'type'

const ROWS: readonly Row[] = [
  {
    form: "cx('flex' as const)",
    code: `${IMPORT}export const a = cx('flex' as const)`,
    reaches: ofType('TSAsExpression'),
    column: flex,
  },
  {
    form: "cx('flex' satisfies AtomName)",
    code: `${IMPORT}export const a = cx('flex' satisfies AtomName)`,
    reaches: ofType('TSSatisfiesExpression'),
    column: flex,
  },
  {
    form: 'cx(c!), c a resolvable const',
    code: `${IMPORT}const c = 'flex'\nexport const a = cx(c!)`,
    reaches: ofType('TSNonNullExpression'),
    column: flex,
  },
  {
    form: "cx(<AtomName>'flex')",
    code: `${IMPORT}export const a = cx(<AtomName>'flex')`,
    reaches: ofType('TSTypeAssertion'),
    column: flex,
  },
  {
    form: "const v = 'grid' as AtomName; cx(v)",
    code: `${IMPORT}const v = 'grid' as AtomName\nexport const a = cx(v)`,
    reaches: ofType('TSAsExpression'),
    column: grid,
  },
  {
    form: "cx(on ? 'flex' : ('grid' as const))",
    code: `${IMPORT}export function Row({ on }: { on: boolean }) {\n  return cx(on ? 'flex' : ('grid' as const))\n}`,
    reaches: ofType('TSAsExpression'),
    column: { atoms: ['flex', 'grid'], problems: [] },
  },
  {
    form: "const v: AtomName = 'grid'; cx(v)",
    code: `${IMPORT}const v: AtomName = 'grid'\nexport const a = cx(v)`,
    reaches: ofType('TSTypeAnnotation'),
    column: grid,
  },
  {
    form: 'type Cx = typeof cx',
    code: `${IMPORT}type Cx = typeof cx`,
    reaches: ofType('TSTypeQuery'),
    column: none,
  },
  {
    form: 'Parameters<typeof cx>[0]',
    code: `${IMPORT}type First = Parameters<typeof cx>[0]`,
    reaches: ofType('TSTypeQuery'),
    column: none,
  },
  {
    form: 'import type { cx as t }, then typeof t',
    code: `import type { cx as t } from '${CX_SOURCE}'\ntype T = typeof t`,
    reaches: isTypeImport,
    column: none,
  },
  {
    // A call of the import in the same file would collect `flex`, so the alias is used as a
    // type here and the next describe block reads a call beside it.
    form: 'type cx = string in a function',
    code: `${IMPORT}export function f() {\n  type cx = string\n  const s: cx = 'a'\n  return s\n}`,
    reaches: ofType('TSTypeAliasDeclaration'),
    column: none,
  },
  {
    form: 'interface P { cx: string }',
    code: `${IMPORT}interface P {\n  cx: string\n}`,
    reaches: ofType('TSPropertySignature'),
    column: none,
  },
  {
    form: 'type Cls = `nave-${string}`',
    code: `${IMPORT}type Cls = \`nave-\${string}\``,
    reaches: ofType('TSTemplateLiteralType'),
    column: none,
  },
  {
    form: "type Cls = 'nave-grid' | 'nave-block'",
    code: `${IMPORT}type Cls = 'nave-grid' | 'nave-block'`,
    reaches: ofType('TSUnionType'),
    column: none,
    // Over-inclusion, which is safe: a literal class is found in the text, type or not.
    authored: { atoms: ['block', 'grid'], problems: [] },
  },
  {
    form: "enum Tone { A = 'flex' }; cx(Tone.A)",
    code: `${IMPORT}enum Tone {\n  A = 'flex',\n}\nexport const a = cx(Tone.A)`,
    reaches: ofType('TSEnumDeclaration'),
    column: { atoms: [], problems: ['argument'] },
  },
  {
    form: 'cx<string>',
    code: `${IMPORT}export const a = cx<string>`,
    reaches: ofType('TSInstantiationExpression'),
    column: { atoms: [], problems: ['reference'] },
  },
  {
    form: 'declare const o: typeof cx',
    code: `${IMPORT}declare const o: typeof cx\ntype O = typeof o`,
    reaches: ofType('TSTypeQuery'),
    column: none,
  },
  {
    form: '{ row: cx(flex) } satisfies Record<...>',
    code: `${IMPORT}export const m = { row: cx('flex') } satisfies Record<string, string>`,
    reaches: ofType('TSSatisfiesExpression'),
    column: flex,
  },
]

describe('AC-nextjs-used-atoms-09 — the closed TypeScript list: each correct form reads as its types-stripped copy', () => {
  it.each(ROWS)('$form', ({ code, column, authored, reaches }) => {
    // The row reaches the construct it is about, and the stripped copy gives the row's column.
    expect(hasNode(code, reaches)).toBe(true)
    expect(strippedVerdict(code)).toEqual(column)
    // The authored file gives the verdict the stripped one does.
    expect(authoredVerdict(code)).toEqual(authored ?? column)
  })

  it.each([
    [
      'cx(variant as AtomName), variant a parameter',
      'variant: string',
      'variant as AtomName',
      'cx(variant)',
    ],
    ['cx(props.v!), props a parameter', 'props: { v: string }', 'props.v!', 'cx(props.v)'],
    ['cx(x satisfies AtomName), x a parameter', 'x: string', 'x satisfies AtomName', 'cx(x)'],
    [
      'cx((prefix + v) as AtomName), a parenthesised sum',
      'prefix: string, v: string',
      '(prefix + v) as AtomName',
      'cx((prefix + v))',
    ],
    ['cx((v as AtomName)!), a cast inside parentheses', 'v: string', '(v as AtomName)!', 'cx((v))'],
    ['cx(<AtomName>(v)), a parenthesised operand', 'v: string', '<AtomName>(v)', 'cx((v))'],
    [
      "cx((on ? v : 'flex') as AtomName), a parenthesised conditional",
      'on: boolean, v: string',
      "(on ? v : 'flex') as AtomName",
      "cx((on ? v : 'flex'))",
    ],
    [
      'cx((v /* note */) as AtomName), a comment before the closing parenthesis',
      'v: string',
      '(v /* note */) as AtomName',
      'cx((v /* note */))',
    ],
  ])(
    '%s is one argument problem, quoted without the assertion',
    (_name, parameter, argument, quote) => {
      const code = `${IMPORT}export function f(${parameter}) {\n  return cx(${argument})\n}`
      const reading = read(code, 'ts')
      expect(verdictOf(reading)).toEqual({ atoms: [], problems: ['argument'] })
      expect(reading.problems[0]?.construct).toBe(quote)
      expect(strippedVerdict(code)).toEqual({ atoms: [], problems: ['argument'] })
    },
  )

  it('quotes a call with every assertion in it removed, not only the outermost', () => {
    const code = `${IMPORT}export function f(on: boolean, v: string) {\n  return cx('flex' as const, on ? (v as AtomName) : 'grid')\n}`
    expect(read(code, 'ts').problems[0]?.construct).toBe("cx('flex', on ? (v) : 'grid')")
  })

  it('quotes each of the four assertions removed, the angle-bracket one from its front', () => {
    const code = `${IMPORT}export function f(a: string, b: string, c: string, d: string) {\n  return cx(<string>a, b!, c satisfies string, d as string)\n}`
    const problems = read(code, 'ts').problems
    // One problem for each argument, each quoting the whole call.
    expect(problems.map((problem) => problem.construct)).toEqual(
      Array.from({ length: 4 }, () => 'cx(a, b, c, d)'),
    )
  })

  it('still judges the value under a wrapper by the rules of a plain argument', () => {
    const reading = read(`${IMPORT}export const a = cx('interactve' as const)`, 'ts')
    expect(reading.atoms.size).toBe(0)
    expect(reading.problems.map((problem) => problem.kind)).toEqual(['unknown'])
  })
})

/**
 * A module whose function `pick` makes `statement` and whose arrow calls `cx(v)` on the `let` the
 * statement writes: a write the reader misses leaves `cx(v)` reading the initialiser.
 */
function writeModule(parameter: string, statement: string): string {
  return `${IMPORT}let v: AtomName = 'flex'\nexport function pick(${parameter}) {\n  ${statement}\n}\nexport const a = () => cx(v)`
}

/**
 * A module that joins the `nave-flex` class to a separator and to `x`, with `declaration` before.
 */
function joinedModule(declaration: string, joined: string): string {
  return `${IMPORT}declare const x: string\n${declaration}export const a = ${joined}`
}

const isTypeExportFrom = (node: AstNode): boolean =>
  (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
  node.exportKind === 'type'

const WALKED_ROWS: readonly Row[] = [
  {
    form: 'a separator under as const, in a class joined from pieces',
    code: joinedModule("const SEP = ' ' as const\n", "'nave-flex' + SEP + x"),
    reaches: ofType('TSAsExpression'),
    column: flex,
  },
  {
    form: 'a separator under satisfies, in a class joined from pieces',
    code: joinedModule("const SEP = ' ' satisfies string\n", "'nave-flex' + SEP + x"),
    reaches: ofType('TSSatisfiesExpression'),
    column: flex,
  },
  {
    form: 'a separator under the non-null assertion, in a class joined from pieces',
    code: joinedModule("const SEP = ' '\n", "'nave-flex' + SEP! + x"),
    reaches: ofType('TSNonNullExpression'),
    column: flex,
  },
  {
    form: 'a separator under as inside parentheses, in a class joined from pieces',
    code: joinedModule('', "'nave-flex' + (' ' as string) + x"),
    reaches: ofType('TSAsExpression'),
    column: flex,
  },
  {
    form: 'a sum under as inside parentheses, in a class joined from pieces',
    code: joinedModule('', "'nave-flex' + ((' ' + x) as string)"),
    reaches: ofType('TSAsExpression'),
    column: flex,
  },
  {
    form: 'a parenthesised sum under the non-null assertion, in a class joined from pieces',
    code: joinedModule('', "'nave-flex' + (' ' + x)!"),
    reaches: ofType('TSNonNullExpression'),
    column: flex,
  },
  {
    form: 'a write through a non-null assertion',
    code: writeModule('n: AtomName', 'v! = n'),
    reaches: ofType('TSNonNullExpression'),
    column: argument,
  },
  {
    form: 'a write through an as assertion',
    code: writeModule('n: AtomName', '(v as AtomName) = n'),
    reaches: ofType('TSAsExpression'),
    column: argument,
  },
  {
    form: 'a write through an angle-bracket assertion',
    code: writeModule('n: AtomName', '(<AtomName>v) = n'),
    reaches: ofType('TSTypeAssertion'),
    column: argument,
  },
  {
    form: 'a write through satisfies',
    code: writeModule('n: AtomName', '(v satisfies AtomName) = n'),
    reaches: ofType('TSSatisfiesExpression'),
    column: argument,
  },
  {
    form: 'a write to an array pattern element under the non-null assertion',
    code: writeModule('n: AtomName', '[v!] = [n]'),
    reaches: ofType('TSNonNullExpression'),
    column: argument,
  },
  {
    form: 'a write to an object pattern value under the non-null assertion',
    code: writeModule('o: { k: AtomName }', '({ k: v! } = o)'),
    reaches: ofType('TSNonNullExpression'),
    column: argument,
  },
  {
    form: 'a for-of head that writes under the non-null assertion',
    code: writeModule('xs: AtomName[]', 'for (v! of xs) {}'),
    reaches: ofType('TSNonNullExpression'),
    column: argument,
  },
  {
    form: 'a constructor parameter property whose default is a literal call',
    code: `${IMPORT}export class K {\n  constructor(public c = cx('flex')) {}\n}`,
    reaches: ofType('TSParameterProperty'),
    column: flex,
  },
  {
    form: 'a constructor parameter property whose default calls cx on a parameter',
    code: `${IMPORT}export class K {\n  constructor(t: AtomName, public c = cx(t)) {}\n}`,
    reaches: ofType('TSParameterProperty'),
    column: argument,
  },
  {
    form: 'a private readonly parameter property with a typed default',
    code: `${IMPORT}export class K {\n  constructor(private readonly c: string = cx('grid')) {}\n}`,
    reaches: ofType('TSParameterProperty'),
    column: grid,
  },
  {
    form: 'a namespace constant named like a global, read outside the namespace',
    code: `${IMPORT}namespace N {\n  export const origin = 'flex'\n}\nexport const a = cx(origin as AtomName)`,
    reaches: ofType('TSModuleDeclaration'),
    column: argument,
  },
  {
    form: 'a namespace let that shadows nothing outside it',
    code: `${IMPORT}let v: AtomName = 'flex'\nnamespace N {\n  let v = 'x'\n}\nexport const a = cx(v)`,
    reaches: ofType('TSModuleDeclaration'),
    column: flex,
  },
  {
    form: 'a declare function with a type parameter constrained by typeof cx',
    code: `${IMPORT}declare function h<T extends typeof cx>(): void\nexport const a = cx('flex')`,
    reaches: ofType('TSDeclareFunction'),
    column: flex,
  },
  {
    form: 'a function overload with a type parameter constrained by typeof cx',
    code: `${IMPORT}export function g<T extends typeof cx>(): void\nexport function g() {}\nexport const a = cx('flex')`,
    reaches: ofType('TSDeclareFunction'),
    column: flex,
  },
  {
    form: 'a function overload with a parameter named cx',
    code: `${IMPORT}export function circle(cx: number, cy: number): string\nexport function circle(x: number, y: number) {\n  return \`\${x},\${y}\`\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSDeclareFunction'),
    column: flex,
  },
  {
    form: 'a method overload with a parameter named cx',
    code: `${IMPORT}export class A {\n  m(cx: number): void\n  m(x: number) {}\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSEmptyBodyFunctionExpression'),
    column: flex,
  },
  {
    form: 'a constructor overload with a parameter named cx',
    code: `${IMPORT}export class A {\n  constructor(cx: number)\n  constructor(x: number) {}\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSEmptyBodyFunctionExpression'),
    column: flex,
  },
  {
    form: 'an abstract method with a parameter named cx',
    code: `${IMPORT}export abstract class A {\n  abstract m(cx: string): void\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSAbstractMethodDefinition'),
    column: flex,
  },
  {
    form: 'an abstract property named cx',
    code: `${IMPORT}export abstract class A {\n  abstract cx: string\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSAbstractPropertyDefinition'),
    column: flex,
  },
  {
    form: 'an abstract accessor named cx',
    code: `${IMPORT}export abstract class A {\n  abstract accessor cx: string\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSAbstractAccessorProperty'),
    column: flex,
  },
  {
    form: 'an index signature with a parameter named cx',
    code: `${IMPORT}export class A {\n  [cx: string]: unknown\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSIndexSignature'),
    column: flex,
  },
  {
    form: 'a type-only re-export of a type from the cx source',
    code: `${IMPORT}export type { AtomName as N } from '${CX_SOURCE}'\nexport const a = cx('flex')`,
    reaches: isTypeExportFrom,
    column: flex,
  },
  {
    form: 'a type-only re-export of cx from the cx source',
    code: `${IMPORT}export type { cx } from '${CX_SOURCE}'\nexport const a = cx('flex')`,
    reaches: isTypeExportFrom,
    column: flex,
  },
  {
    form: 'a type-only star re-export of the cx source',
    code: `${IMPORT}export type * from '${CX_SOURCE}'\nexport const a = cx('flex')`,
    reaches: isTypeExportFrom,
    column: flex,
  },
  {
    form: 'a type-only namespace re-export of the cx source',
    code: `${IMPORT}export type * as T from '${CX_SOURCE}'\nexport const a = cx('flex')`,
    reaches: isTypeExportFrom,
    column: flex,
  },
  {
    form: 'a class decorator whose argument calls cx',
    code: `${IMPORT}declare function dec(value: unknown): any\n@dec(cx('flex'))\nexport class A {}`,
    reaches: ofType('Decorator'),
    column: flex,
  },
  {
    form: 'a method decorator whose argument calls cx',
    code: `${IMPORT}declare function dec(value: unknown): any\nexport class A {\n  @dec(cx('grid')) m() {}\n}`,
    reaches: ofType('Decorator'),
    column: grid,
  },
  {
    form: 'a property decorator whose argument calls cx',
    code: `${IMPORT}declare function dec(value: unknown): any\nexport class A {\n  @dec(cx('grid')) p = 1\n}`,
    reaches: ofType('Decorator'),
    column: grid,
  },
  {
    form: 'an accessor decorator whose argument calls cx',
    code: `${IMPORT}declare function dec(value: unknown): any\nexport class A {\n  @dec(cx('grid')) accessor p = 1\n}`,
    reaches: ofType('Decorator'),
    column: grid,
  },
  {
    form: 'a decorator that passes cx on without calling it',
    code: `${IMPORT}declare function dec(value: unknown): any\n@dec(cx)\nexport class A {}`,
    reaches: ofType('Decorator'),
    column: { atoms: [], problems: ['reference'] },
  },
  {
    form: 'a decorator argument that is written elsewhere',
    code: `${IMPORT}declare function dec(value: unknown): any\nlet x: AtomName = 'flex'\nexport function set(value: AtomName) {\n  x = value\n}\n@dec(cx(x))\nexport class A {}`,
    reaches: ofType('Decorator'),
    column: argument,
  },
  {
    form: 'an enum member named cx',
    code: `${IMPORT}export enum E {\n  cx = 1,\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSEnumMember'),
    column: flex,
  },
  {
    form: 'an enum member named cx, written as a string',
    code: `${IMPORT}enum E {\n  'cx' = 1,\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSEnumMember'),
    column: flex,
  },
  {
    form: 'an enum member named cx, read by a later member',
    code: `${IMPORT}export enum E {\n  cx = 1,\n  B = cx,\n}\nexport const a = cx('flex')`,
    reaches: ofType('TSEnumMember'),
    column: flex,
  },
  {
    form: 'an enum member that reads a constant outside the enum',
    code: `${IMPORT}const tone = 'grid'\nenum E {\n  A = cx(tone).length,\n}`,
    reaches: ofType('TSEnumMember'),
    column: grid,
  },
  {
    form: 'an enum member whose initialiser calls cx',
    code: `${IMPORT}enum E {\n  A = cx('flex').length,\n}`,
    reaches: ofType('TSEnumMember'),
    column: flex,
  },
  {
    // A type named cx in the function that calls cx declares no value there.
    form: 'a type alias named cx beside a cx call in the same function',
    code: `${IMPORT}export function f() {\n  type cx = string\n  const s: cx = 'a'\n  return cx('flex') + s\n}`,
    reaches: ofType('TSTypeAliasDeclaration'),
    column: flex,
  },
]

describe('AC-nextjs-used-atoms-09: beyond the list, each form reads as its types-stripped copy', () => {
  it.each(WALKED_ROWS)('$form', ({ code, column, reaches }) => {
    expect(hasNode(code, reaches)).toBe(true)
    expect(strippedVerdict(code)).toEqual(column)
    expect(authoredVerdict(code)).toEqual(column)
  })
})

describe('AC-nextjs-used-atoms-09: a module listed in cxModules', () => {
  it.each(['export type { AtomName } from', 'export type * as T from'])(
    'reads %s the cx source as no export of cx, beside the re-export of cx',
    (statement) => {
      const listed: ReadOptions = { ...OPTIONS, isDeclared: true }
      const code = `export { cx } from '${CX_SOURCE}'\n${statement} '${CX_SOURCE}'`
      expect(read(code, 'ts', listed).problems).toEqual([])
      expect(read(stripCode(code), 'js', listed).problems).toEqual([])
    },
  )
})

describe('AC-nextjs-used-atoms-09: a parameter decorator is read', () => {
  // The stripped copy of a parameter decorator needs the legacy decorator option, which the strip
  // helper does not set, so these rows read the authored file only.
  const block: Verdict = { atoms: ['block'], problems: [] }
  const reference: Verdict = { atoms: [], problems: ['reference'] }

  it.each([
    ['a parameter', "@dec(cx('block')) a: string", block],
    ['a parameter property', "@dec(cx('block')) public a: string", block],
    ['a parameter that passes cx on', '@dec(cx) a: string', reference],
  ])('reads a decorator on %s', (_name, parameter, verdict) => {
    const code = `${IMPORT}declare function dec(value: unknown): any\nexport class A {\n  constructor(${parameter}) {}\n}`
    expect(authoredVerdict(code)).toEqual(verdict)
  })
})

describe('AC-nextjs-used-atoms-09: a type-only specifier exports no value from a cx source', () => {
  const listed: ReadOptions = { ...OPTIONS, isDeclared: true }
  const application: ReadOptions = {
    ...OPTIONS,
    cxSources: new Set(['./ui', CX_SOURCE]),
    declaredSources: new Set(['./ui']),
  }

  it.each([
    [
      'a listed module: cx beside a type in one statement',
      listed,
      `export { cx, type AtomName } from '${CX_SOURCE}'`,
    ],
    [
      'a listed module: a type in a statement of its own',
      listed,
      `export { cx } from '${CX_SOURCE}'\nexport { type AtomName } from '${CX_SOURCE}'`,
    ],
    [
      'an application module: cx of a listed module, type-only',
      application,
      "export { type cx } from './ui'\nimport { cx } from './ui'\nexport const a = cx('flex')",
    ],
    [
      'an application module: cx of a listed module, type-only, beside another name',
      application,
      "export { type cx, other } from './ui'\nimport { cx } from './ui'\nexport const a = cx('flex')",
    ],
  ])('reads %s as no problem', (_name, options, code) => {
    expect(read(code, 'ts', options).problems).toEqual([])
    expect(read(stripCode(code), 'js', options).problems).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-09 — what the list also settles', () => {
  it('does not let a type named cx shadow the import', () => {
    const code = `${IMPORT}export function f() {\n  type cx = string\n  return 'a' as cx\n}\nexport const b = cx('block')`
    expect(authoredVerdict(code)).toEqual({ atoms: ['block'], problems: [] })
  })

  it('binds nothing by an import type, whole or by specifier, as in the stripped copy', () => {
    // A call of a name that only a type import brought in is a call of no Nave binding.
    const rows = [
      `import type { cx } from '${CX_SOURCE}'\nexport const a = cx('flex')`,
      `import { type cx } from '${CX_SOURCE}'\nexport const a = cx('flex')`,
    ]
    for (const code of rows) {
      expect(strippedVerdict(code)).toEqual(none)
      expect(authoredVerdict(code)).toEqual(none)
    }
  })

  it('reads a type-only export of the binding as no reference, whole or by specifier', () => {
    const rows = [
      `${IMPORT}export type { cx }\nexport const a = cx('flex')`,
      `${IMPORT}export { type cx }\nexport const a = cx('flex')`,
    ]
    for (const code of rows) expect(authoredVerdict(code)).toEqual(flex)
  })

  it('reads an exported type declaration as no reference', () => {
    const code = `${IMPORT}export type Cx = typeof cx\nexport interface P {\n  cx: string\n}\nexport const a = cx('block')`
    expect(authoredVerdict(code)).toEqual({ atoms: ['block'], problems: [] })
  })

  it('reads the type arguments of a call, a new and a tagged template as no reference', () => {
    const code = [
      IMPORT,
      'declare function use<T>(value?: T): T\n',
      'declare class Box<T> { constructor(value?: T) }\n',
      'declare function tag<T>(strings: TemplateStringsArray): T\n',
      'export const x = use<typeof cx>()\n',
      'export const y = new Box<typeof cx>()\n',
      'export const z = tag<typeof cx>`a`\n',
      "export const a = cx('flex')",
    ].join('')
    expect(authoredVerdict(code)).toEqual(flex)
  })

  it('does not take an import type of the cx source for an import of it', () => {
    const typeOnly = `import type { cx } from '${CX_SOURCE}'\nexport type Cx = typeof cx`
    expect(read(typeOnly, 'ts').usesCx).toBe(false)
    expect(read(`${IMPORT}export const a = cx('flex')`, 'ts').usesCx).toBe(true)
  })

  it('keeps refusing a class built from pieces when an assertion sits on a piece', () => {
    const rows = [
      "export const a = ('nave-' as string) + tone",
      "export const a = ('nave-' satisfies string) + tone",
      "export const a = ('nave-'!) + tone",
      "export const a = (<string>'nave-') + tone",
      "export const a = ('nave-' as string) + 'fl' + 'ex'",
    ]
    for (const row of rows) {
      const code = `${IMPORT}declare const tone: string\n${row}`
      const stripped = strippedVerdict(code)
      expect(stripped.problems).toEqual(['concatenation'])
      expect(authoredVerdict(code)).toEqual(stripped)
    }
  })

  it('keeps refusing a use of the binding that is no call, under a wrapper or beside one', () => {
    const rows = [
      `${IMPORT}export const a = (cx as AtomName)`,
      `${IMPORT}export const a = [cx!]`,
      `${IMPORT}export const a = ['flex' as const].map(cx)`,
    ]
    for (const code of rows) {
      expect(read(code, 'ts').problems.map((problem) => problem.kind)).toEqual(['reference'])
    }
  })
})

describe('AC-nextjs-used-atoms-09: a tree that keeps a node for a pair of parentheses is refused', () => {
  const REFUSAL =
    "readModule reads a syntax tree with no node for a pair of parentheses, as Vite's parser returns it. This tree keeps one (a ParenthesizedExpression): parse with the parentheses dropped, for example oxc-parser with preserveParens: false."

  it.each([
    ['a piece under as, in parentheses', "export const a = ('nave-' as string) + tone"],
    ['a piece in parentheses', "export const a = ('nave-') + tone"],
    ['a piece in a class decorator', "@dec(('nave-') + tone)\nexport class A {}"],
    ['a piece in a method decorator', "export class A {\n  @dec(('nave-') + tone) m() {}\n}"],
    [
      'a piece in a parameter decorator',
      "export class A {\n  constructor(@dec(('nave-') + tone) public c: string) {}\n}",
    ],
  ])('throws on %s, and reads the tree without the parentheses', (_name, body) => {
    const code = `${IMPORT}declare function dec(x: unknown): any\ndeclare const tone: string\n${body}`
    const kept = parseAst(code, { lang: 'ts', preserveParens: true }) as unknown as AstNode
    expect(hasNode(code, ofType('ParenthesizedExpression'))).toBe(false)
    expect(() => readTree(code, kept)).toThrow(new TypeError(REFUSAL))
    expect(authoredVerdict(code)).toEqual({ atoms: [], problems: ['concatenation'] })
  })

  it('walks the root of the tree at most 3 times, so the refusal adds no walk (a pass that adds a walk changes this bound on purpose)', () => {
    const code = `${IMPORT}export const a = (on: boolean) => cx(on ? 'flex' : 'grid')\n`
    let enumerations = 0
    const root = new Proxy(parseAst(code, { lang: 'ts' }) as unknown as AstNode, {
      ownKeys(target) {
        enumerations += 1
        return Reflect.ownKeys(target)
      },
    })
    readTree(code, root)
    expect(enumerations).toBeLessThanOrEqual(3)
  })
})
