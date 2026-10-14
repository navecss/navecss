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
import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'

const IMPORT = `import { cx } from '${CX_SOURCE}'\nimport type { AtomName } from '@navecss/core/atoms'\n`

interface Verdict {
  readonly atoms: readonly string[]
  readonly problems: readonly string[]
}

/**
 * Reads `code` as the language `lang` names.
 */
function read(code: string, lang: 'js' | 'ts'): ModuleReading {
  return readModule(code, parseAst(code, { lang }) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: false,
  })
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
