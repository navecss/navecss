/**
 * What a test file reaches, read from its code and not from its text: the modules it imports,
 * re-exports, `import()`s or `require()`s by a relative path, and whether it calls `nextCommand`.
 * A string, a template or a comment that only names one of these reaches nothing.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { type Expression, parseSync, Visitor } from 'oxc-parser'

import { isFatalParseError } from '../../src/graph-parts.ts'

type Language = NonNullable<NonNullable<Parameters<typeof parseSync>[2]>['lang']>

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
const LANGUAGES: Record<string, Language> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
}
/**
 * The TypeScript file that a specifier written with a JavaScript extension names.
 */
const SOURCE_OF: Record<string, string> = { '.js': '.ts', '.mjs': '.mts', '.cjs': '.cts' }

interface References {
  /**
   * Whether the file loads a module by a path it computes: a call of `import()` or `require()`
   * with an argument that is not a plain string. The guard cannot know where that leads.
   */
  readonly hasComputedLoad: boolean
  /**
   * Whether the file names `nextCommand` in its code, other than in the import that brings it in:
   * calling it, calling it under another name, or passing it on as a value.
   */
  readonly isUsingNextCommand: boolean
  /**
   * The relative paths the file imports, re-exports, `import()`s or `require()`s, as written.
   */
  readonly specifiers: readonly string[]
}

/**
 * The text of a string literal, or of a template literal with nothing in it to compute, and
 * `undefined` for any other expression.
 */
function textOf(node: Expression | null | undefined): string | undefined {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined
  }
  return undefined
}

/**
 * Whether `callee` is the plain name `name`.
 */
function isNamed(callee: Expression, name: string): boolean {
  return callee.type === 'Identifier' && callee.name === name
}

interface Names {
  /**
   * The places that name `nextCommand` without using it: an import's specifier, a declaration.
   */
  readonly namedAt: ReadonlySet<number>
  /**
   * The names `nextCommand` goes by: itself, and each name an import gives it.
   */
  readonly nextNames: ReadonlySet<string>
  /**
   * The names `require` goes by: itself, and each name a `createRequire(...)` is kept in.
   */
  readonly requires: ReadonlySet<string>
}

/**
 * The names a later pass checks calls and uses against, found wherever in the program they are
 * made: a function above `const load = createRequire(...)` may call `load`.
 */
function namesIn(program: Parameters<Visitor['visit']>[0]): Names {
  const requires = new Set(['require'])
  const nextNames = new Set(['nextCommand'])
  const namedAt = new Set<number>()
  new Visitor({
    ImportSpecifier: (node) => {
      namedAt.add(node.imported.start)
      namedAt.add(node.local.start)
      const imported =
        node.imported.type === 'Identifier' ? node.imported.name : node.imported.value
      if (imported === 'nextCommand') nextNames.add(node.local.name)
    },
    FunctionDeclaration: (node) => {
      if (node.id !== null) namedAt.add(node.id.start)
    },
    VariableDeclarator: (node) => {
      const { id, init } = node
      if (
        id.type === 'Identifier' &&
        init?.type === 'CallExpression' &&
        isNamed(init.callee, 'createRequire')
      ) {
        requires.add(id.name)
      }
    },
  }).visit(program)
  return { namedAt, nextNames, requires }
}

const readings = new Map<string, References>()

/**
 * What the code `code` of the file `file` reaches. Throws when it does not parse: a file the guard
 * cannot read would otherwise be taken for one that starts nothing.
 */
function referencesIn(file: string, code: string): References {
  const extension = path.extname(file)
  const parsed = parseSync(file, code, {
    lang: LANGUAGES[extension] ?? 'js',
    sourceType: 'unambiguous',
  })
  const failure = parsed.errors.find((error) => isFatalParseError(error))
  if (failure !== undefined) throw new Error(`${file} does not parse: ${failure.message}`)
  const specifiers: string[] = []
  let hasComputedLoad = false
  let isUsingNextCommand = false
  const { namedAt, nextNames, requires } = namesIn(parsed.program)
  const note = (specifier: string | undefined): void => {
    if (specifier === undefined) hasComputedLoad = true
    else specifiers.push(specifier)
  }
  new Visitor({
    ImportDeclaration: (node) => note(node.source.value),
    ExportAllDeclaration: (node) => note(node.source.value),
    ExportNamedDeclaration: (node) => {
      if (node.source) note(node.source.value)
    },
    ImportExpression: (node) => note(textOf(node.source)),
    TSExternalModuleReference: (node) => note(textOf(node.expression)),
    CallExpression: (node) => {
      const { callee } = node
      const isRequiring =
        (callee.type === 'Identifier' && requires.has(callee.name)) ||
        (callee.type === 'CallExpression' && isNamed(callee.callee, 'createRequire'))
      if (!isRequiring) return
      const [argument] = node.arguments
      note(
        argument === undefined || argument.type === 'SpreadElement' ? undefined : textOf(argument),
      )
    },
    Identifier: (node) => {
      if (nextNames.has(node.name) && !namedAt.has(node.start)) isUsingNextCommand = true
    },
  }).visit(parsed.program)
  return { hasComputedLoad, isUsingNextCommand, specifiers }
}

/**
 * What the file at `file` reaches. A file with the same name and text is read once.
 */
export function referencesOf(file: string): References {
  const code = readFileSync(file, 'utf8')
  const key = `${file}\0${code}`
  const known = readings.get(key)
  if (known !== undefined) return known
  const reading = referencesIn(file, code)
  readings.set(key, reading)
  return reading
}

/**
 * Whether `file` is a file.
 */
function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true
}

/**
 * The file a relative specifier written in `from` names: the path itself, the path with an
 * extension, a directory's `index`, or the TypeScript file a JavaScript extension stands for.
 * `undefined` for a specifier that is not relative, or names no file.
 */
function resolveRelative(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = path.resolve(path.dirname(from), specifier)
  const extension = path.extname(base)
  const source = SOURCE_OF[extension]
  const candidates = [
    base,
    ...EXTENSIONS.map((added) => base + added),
    ...EXTENSIONS.map((added) => path.join(base, `index${added}`)),
    ...(source === undefined ? [] : [base.slice(0, base.length - extension.length) + source]),
  ]
  return candidates.find((candidate) => isFile(candidate))
}

/**
 * Whether `file` starts Next.js: it, or a module it reaches through relative imports that lie
 * under `within`, is one of `targets`, uses `nextCommand`, or loads a module by a path it computes.
 */
export function isStartingNext(
  file: string,
  targets: readonly string[],
  within: string,
  seen = new Set<string>(),
): boolean {
  if (targets.includes(file)) return true
  if (seen.has(file) || !EXTENSIONS.includes(path.extname(file))) return false
  seen.add(file)
  const { hasComputedLoad, isUsingNextCommand, specifiers } = referencesOf(file)
  if (hasComputedLoad || isUsingNextCommand) return true
  return specifiers
    .map((specifier) => resolveRelative(file, specifier))
    .some(
      (reached) =>
        reached !== undefined &&
        !path.relative(within, reached).startsWith('..') &&
        isStartingNext(reached, targets, within, seen),
    )
}
