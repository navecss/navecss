/**
 * The register tripwire: the cleared list of regular expressions, run over every registry-facing
 * string after the exemptions are replaced by a space. Also the readers of those strings: an
 * item's and the index's string values, the text of the comments in the copied files, the
 * README section and the CLI's printed lines.
 */
import postcss from 'postcss'
import {
  type CommentRange,
  createSourceFile,
  forEachChild,
  getLeadingCommentRanges,
  getTrailingCommentRanges,
  type Node,
  ScriptTarget,
} from 'typescript'

import type { LoadedRegistry } from './load.ts'

import { FIXED_SENTENCES } from '../readme.ts'
import { cleared, HEADER } from './cleared.ts'
import { itemsOf, readHead } from './strings-text.ts'

export interface LabeledString {
  readonly label: string
  readonly text: string
}

/**
 * The tripwire's lines, each a regular-expression source.
 */
export const tripwireLines = (): string[] => cleared('W-list').split('\n')

const PHRASES_FROM_SOURCE = ["consumer's own value", "Base UI's own"]

const nonAffiliationLine = (): string => {
  const line = FIXED_SENTENCES.find((sentence) => sentence.name === 'non-affiliation')?.text
  if (line === undefined)
    throw new Error('the non-affiliation line is not among the fixed sentences')
  return line
}

/**
 * The strings replaced by a space before the lines run: the licence file's name, the README's
 * non-affiliation line and the two phrases copied from the package's source.
 */
export const exemptions = (): string[] => [
  'NAVECSS-LICENSE',
  nonAffiliationLine(),
  ...PHRASES_FROM_SOURCE,
]

export const withoutExemptions = (text: string): string =>
  exemptions().reduce((rest, exempt) => rest.replaceAll(exempt, ' '), text)

/**
 * Problems found in the strings: one per string and line that matches, naming both.
 */
export const tripwireProblems = (
  strings: readonly LabeledString[],
  lines: readonly string[] = tripwireLines(),
): string[] => {
  const expressions = lines.map((line) => ({ line, expression: new RegExp(line, 'i') }))
  return strings.flatMap(({ label, text }) => {
    const rest = withoutExemptions(text)
    return expressions
      .filter(({ expression }) => expression.test(rest))
      .map(({ line }) => `${label} matches /${line}/i`)
  })
}

const stringValuesOf = (value: unknown, label: string): LabeledString[] => {
  if (typeof value === 'string') return [{ label, text: value }]
  if (Array.isArray(value)) {
    return value.flatMap((entry, position) => stringValuesOf(entry, `${label}[${position}]`))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      key === 'content' ? [] : stringValuesOf(entry, `${label}.${key}`),
    )
  }
  return []
}

/**
 * Every string value of a parsed JSON value, labelled by its path, `content` fields excluded.
 */
export const stringsOf = (value: unknown, label: string): LabeledString[] =>
  stringValuesOf(value, label)

const commentText = (source: string, range: CommentRange): string =>
  source
    .slice(range.pos, range.end)
    .replaceAll(/^\/\/|^\/\*+|\*+\/$/g, '')
    .replaceAll(/^\s*\*\s?/gm, '')
    .trim()

/**
 * The text of every comment of a TypeScript source, line and block, in source order.
 */
export const tsCommentTexts = (source: string): string[] => {
  const file = createSourceFile('copied.ts', source, ScriptTarget.Latest, true)
  const found = new Map<number, string>()
  const note = (ranges: CommentRange[] | undefined): void => {
    const list = ranges ?? []
    for (const range of list) found.set(range.pos, commentText(source, range))
  }
  const visit = (node: Node): void => {
    note(getLeadingCommentRanges(source, node.getFullStart()))
    note(getTrailingCommentRanges(source, node.getEnd()))
    forEachChild(node, visit)
  }
  visit(file)
  return found
    .entries()
    .toArray()
    .toSorted(([a], [b]) => a - b)
    .map(([, text]) => text)
}

/**
 * The text of every comment of a stylesheet.
 */
export const cssCommentTexts = (source: string): string[] => {
  const texts: string[] = []
  postcss.parse(source).walkComments((comment) => {
    texts.push(comment.text)
  })
  return texts
}

/**
 * The year and holder `LICENSE` states, read the way the header is built.
 */
export const licenseYearAndHolder = (): { holder: string; year: string } => {
  const licence = readHead('packages/base-ui/LICENSE')
  const match = /^Copyright \(c\) (\d{4}) (.+)$/m.exec(licence)
  if (match === null) throw new Error('packages/base-ui/LICENSE has no copyright line')
  return { holder: match[2] ?? '', year: match[1] ?? '' }
}

/**
 * Comments of a copied file other than its two cleared header lines, which are described in
 * licence words by design. A header that is not the cleared one stays in, and is read as text.
 */
export const commentsBesideHeader = (texts: readonly string[]): string[] => {
  const { holder, year } = licenseYearAndHolder()
  const header = [HEADER.line1, HEADER.line2(year, holder)]
  const leading = texts.slice(0, 2)
  const isHeader = leading.length === 2 && leading.every((text, index) => text === header[index])
  return isHeader ? texts.slice(2) : [...texts]
}

const LICENSE_FILE = 'NAVECSS-LICENSE'

const commentsOfFile = (target: string, content: string): string[] => {
  if (target.endsWith(LICENSE_FILE)) return []
  if (target.endsWith('.css')) return commentsBesideHeader(cssCommentTexts(content))
  if (target.endsWith('.ts')) return commentsBesideHeader(tsCommentTexts(content))
  return []
}

/**
 * The comments of every copied file of the registry, labelled by item and target.
 */
export const copiedCommentStrings = (registry: LoadedRegistry): LabeledString[] =>
  itemsOf(registry).flatMap((item) =>
    item.files.flatMap((file) =>
      commentsOfFile(file.target, file.content ?? '').map((text, index) => ({
        label: `${item.name} ${file.target} comment ${index + 1}`,
        text,
      })),
    ),
  )

/**
 * Every string R8 binds that the registry holds: each item's `title`, `description`, `docs` and
 * `meta` values, the index's strings, and the comments of the copied files.
 */
export const registryStrings = (registry: LoadedRegistry): LabeledString[] => [
  ...itemsOf(registry).flatMap((item) => [
    { label: `${item.name} title`, text: item.title },
    { label: `${item.name} description`, text: item.description },
    { label: `${item.name} docs`, text: item.docs },
    ...stringsOf(item.meta ?? {}, `${item.name} meta`),
  ]),
  ...stringsOf(registry.index, 'registry.json'),
  ...copiedCommentStrings(registry),
]

/**
 * Problems with names: a "shadcn" in an item name, a file's path or target, the index name or the
 * names it lists. Prose and `$schema` URLs are not names.
 */
export const shadcnNameProblems = (registry: LoadedRegistry): string[] => {
  const names: LabeledString[] = [
    { label: 'registry.json name', text: registry.index.name },
    ...registry.index.items.flatMap((entry) => [
      { label: `registry.json item ${entry.name}`, text: entry.name },
      ...entry.files.flatMap((file) => [
        { label: `registry.json ${entry.name} path`, text: file.path },
        { label: `registry.json ${entry.name} target`, text: file.target },
      ]),
    ]),
    ...itemsOf(registry).flatMap((item) => [
      { label: `${item.name} name`, text: item.name },
      ...item.files.flatMap((file) => [
        { label: `${item.name} path`, text: file.path },
        { label: `${item.name} target`, text: file.target },
      ]),
    ]),
  ]
  return names
    .filter(({ text }) => /shadcn/i.test(text))
    .map(({ label, text }) => `${label}: ${text}`)
}

const IMAGE_REFERENCE = /\.svg|\.png|data:image|<svg/i

/**
 * Problems with images: any item, index or `meta` string that is an image or names one.
 */
export const imageProblems = (registry: LoadedRegistry): string[] => {
  const strings = [
    ...stringsOf(registry.index, 'registry.json'),
    ...itemsOf(registry).flatMap((item) => [
      ...stringsOf({ ...item, files: [] }, item.name),
      ...item.files.flatMap((file) => [
        { label: `${item.name} ${file.target}`, text: file.path },
        { label: `${item.name} ${file.target} target`, text: file.target },
        { label: `${item.name} ${file.target} content`, text: file.content ?? '' },
      ]),
    ]),
  ]
  return strings.filter(({ text }) => IMAGE_REFERENCE.test(text)).map(({ label }) => label)
}
