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
   * Whether the file calls a function named `nextCommand`, on its own or as a property.
   */
  readonly isCallingNextCommand: boolean
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
 * Whether `callee` is `name`, or a property of that name read off an object.
 */
function isCalling(callee: Expression, name: string): boolean {
  if (callee.type === 'Identifier') return callee.name === name
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === name
  )
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
  let isCallingNextCommand = false
  const note = (specifier: string | undefined): void => {
    if (specifier !== undefined) specifiers.push(specifier)
  }
  new Visitor({
    ImportDeclaration: (node) => note(node.source.value),
    ExportAllDeclaration: (node) => note(node.source.value),
    ExportNamedDeclaration: (node) => note(node.source?.value),
    ImportExpression: (node) => note(textOf(node.source)),
    TSExternalModuleReference: (node) => note(textOf(node.expression)),
    CallExpression: (node) => {
      if (isCalling(node.callee, 'require')) {
        const [argument] = node.arguments
        if (argument !== undefined && argument.type !== 'SpreadElement') note(textOf(argument))
      }
      if (isCalling(node.callee, 'nextCommand')) isCallingNextCommand = true
    },
  }).visit(parsed.program)
  return { isCallingNextCommand, specifiers }
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
 * Whether `file` reaches one of `targets` through the modules it loads, however it loads them.
 */
export function isReaching(
  file: string,
  targets: readonly string[],
  seen = new Set<string>(),
): boolean {
  if (targets.includes(file)) return true
  if (seen.has(file) || !EXTENSIONS.includes(path.extname(file))) return false
  seen.add(file)
  return referencesOf(file)
    .specifiers.map((specifier) => resolveRelative(file, specifier))
    .some((reached) => reached !== undefined && isReaching(reached, targets, seen))
}
