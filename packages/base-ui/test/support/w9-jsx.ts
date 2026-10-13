/**
 * Reading JSX the way the README instruments need it: which element sits inside which. A source is
 * parsed as TSX, so the answer comes from the syntax tree and not from a pattern over text, and a
 * misplaced element is reported with the file and line it is written on.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  createSourceFile,
  forEachChild,
  isImportDeclaration,
  isJsxElement,
  isJsxSelfClosingElement,
  isNamedImports,
  type JsxElement,
  type JsxSelfClosingElement,
  type Node,
  ScriptKind,
  ScriptTarget,
  type SourceFile,
} from 'typescript'

import { PACKAGE_DIR } from './stylesheet.ts'

const ROOT = path.join(PACKAGE_DIR, '../..')

const FAMILIES: readonly string[] = ['Autocomplete', 'Combobox']

const POPUP_PARTS = new Set(['Popup', 'Positioner'])

export interface Placement {
  /**
  The tags of the elements the input is inside, outermost first.
   */
  readonly ancestors: readonly string[]
  readonly file: string
  readonly line: number
  readonly tag: string
}

const tagOf = (element: JsxElement | JsxSelfClosingElement): string =>
  (isJsxElement(element) ? element.openingElement.tagName : element.tagName).getText()

/**
Local names a source gives the Combobox and Autocomplete namespaces, by the name they are known by:
`import { Combobox as C } from '@navecss/base-ui/combobox'` makes `C` stand for `Combobox`.
 */
const aliasesIn = (source: SourceFile): ReadonlyMap<string, string> =>
  new Map(
    source.statements.filter(isImportDeclaration).flatMap((declaration) => {
      const bindings = declaration.importClause?.namedBindings
      return bindings !== undefined && isNamedImports(bindings)
        ? bindings.elements
            .filter((element) => FAMILIES.includes((element.propertyName ?? element.name).text))
            .map((element) => [element.name.text, (element.propertyName ?? element.name).text])
        : []
    }),
  )

const canonical = (tag: string, aliases: ReadonlyMap<string, string>): string => {
  const [head = '', ...rest] = tag.split('.')
  return [aliases.get(head) ?? head, ...rest].join('.')
}

const elementAncestors = (node: Node, aliases: ReadonlyMap<string, string>): readonly string[] => {
  const tags: string[] = []
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (isJsxElement(parent) || isJsxSelfClosingElement(parent)) {
      tags.unshift(canonical(tagOf(parent), aliases))
    }
  }
  return tags
}

/**
Every `Combobox.Input` and `Autocomplete.Input` element in a source, with the elements around it.
`firstLine` is the line of the source's first line in its file.
 */
export const inputPlacements = (
  text: string,
  file: string,
  firstLine = 1,
): readonly Placement[] => {
  const source = createSourceFile(file, text, ScriptTarget.Latest, true, ScriptKind.TSX)
  const aliases = aliasesIn(source)
  const found: Placement[] = []
  const visit = (node: Node): void => {
    if (isJsxElement(node) || isJsxSelfClosingElement(node)) {
      const tag = canonical(tagOf(node), aliases)
      if (FAMILIES.some((family) => tag === `${family}.Input`)) {
        found.push({
          ancestors: elementAncestors(node, aliases),
          file,
          line: firstLine + source.getLineAndCharacterOfPosition(node.getStart()).line,
          tag,
        })
      }
    }
    forEachChild(node, visit)
  }
  visit(source)
  return found
}

/**
Whether a placement is inside a Combobox or Autocomplete popup or positioner.
 */
export const isInsidePopup = ({ ancestors }: Placement): boolean =>
  ancestors.some((tag) => {
    const [family = '', part = ''] = tag.split('.', 2)
    return FAMILIES.includes(family) && POPUP_PARTS.has(part)
  })

/**
The inputs of a source that sit inside a popup or positioner, as `file:line`.
 */
export const misplacedInputs = (text: string, file: string, firstLine = 1): string[] =>
  inputPlacements(text, file, firstLine)
    .filter((placement) => isInsidePopup(placement))
    .map(({ file: name, line }) => `${name}:${line}`)

export interface LocatedFence {
  readonly body: string
  /**
  The line of the fence's first line of code.
   */
  readonly line: number
  readonly language: string
}

/**
Every fenced block of a markdown text with the line its code starts on.
 */
export const fencesWithLines = (markdown: string): LocatedFence[] =>
  markdown
    .matchAll(/^```([\w-]*)\n([\s\S]*?)\n```$/gm)
    .map((match) => ({
      body: match[2] ?? '',
      language: match[1] ?? '',
      line: markdown.slice(0, match.index).split('\n').length + 1,
    }))
    .toArray()

const SCRIPT_LANGUAGES = new Set(['javascript', 'js', 'jsx', 'ts', 'tsx', 'typescript'])

/**
The misplaced inputs of a file: every TSX or JSX file whole, every script fence of a markdown file.
 */
export const misplacedInputsInFile = (file: string, text: string): string[] =>
  /\.(?:jsx|tsx)$/.test(file)
    ? misplacedInputs(text, file)
    : fencesWithLines(text)
        .filter(({ language }) => SCRIPT_LANGUAGES.has(language))
        .flatMap(({ body, line }) => misplacedInputs(body, file, line))

const SKIPPED = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules'])

// The render test writes the README's examples here; they are copies of fences the README scan reads.
const GENERATED = path.join(PACKAGE_DIR, 'test/fixtures/readme-examples')

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (full === GENERATED || SKIPPED.has(entry.name)) {
      return []
    }
    return entry.isDirectory() ? walk(full) : [full]
  })

/**
Every markdown, TSX and JSX file under the package and under `docs/`, by path.
 */
export const documentFiles = (): string[] =>
  [path.join(ROOT, 'docs'), PACKAGE_DIR]
    .flatMap((directory) => walk(directory))
    .filter((file) => /\.(?:jsx|md|mdx|tsx)$/.test(file))

/**
The inputs that sit inside a popup anywhere in the package or `docs/`, as `file:line` relative to the
repository root.
 */
export const misplacedInputsInRepository = (): string[] =>
  documentFiles().flatMap((file) =>
    misplacedInputsInFile(path.relative(ROOT, file), readFileSync(file, 'utf8')),
  )
