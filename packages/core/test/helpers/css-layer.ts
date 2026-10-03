/**
 * A CSS reader of the tests' own, independent of the plugin's: the rules of a stylesheet's
 * `@layer atomic` blocks as a normalised tree, and the same tree pruned by the tests' own rule
 * (a selector-list member stays when every built-in atom class in it is kept). Comparing a
 * `'used'` build's layer with an `'all'` build's layer pruned this way shows that an emitted atom
 * keeps every rule the full layer gives it.
 */
import { atomClassMap } from '../../src/atoms.ts'

export interface Node {
  readonly prelude: string
  /**
   * The rules inside an at-rule.
   */
  readonly children?: Node[]
  /**
   * The text inside a rule's braces.
   */
  readonly body?: string
}

const ATOM_CLASSES = new Set(Object.values(atomClassMap))

/**
 * `text` with runs of whitespace collapsed and the space around punctuation removed.
 */
function normalise(text: string, isSelector = false): string {
  // In a selector the space before a pseudo-class is a descendant combinator (`.a :hover` is not
  // `.a:hover`), so `:` keeps its spaces there.
  const punctuation = isSelector ? /\s*([{};,>+~()])\s*/g : /\s*([{}:;,>+~()])\s*/g
  return text
    .replaceAll(/\/\*.*?\*\//gs, '')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(punctuation, '$1')
    .replaceAll(';}', '}')
    .trim()
}

/**
 * The index of the `}` that closes the block opened just before `from`.
 */
function closeOf(text: string, from: number): number {
  let depth = 1
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    else if (text[index] === '}') depth -= 1
    if (depth === 0) return index
  }
  return text.length
}

/**
 * The nodes of the rules in `text`.
 */
function nodesOf(text: string): Node[] {
  const nodes: Node[] = []
  let index = 0
  while (index < text.length) {
    const open = text.indexOf('{', index)
    if (open === -1) break
    const close = closeOf(text, open + 1)
    const prelude = normalise(text.slice(index, open), true)
    const inner = text.slice(open + 1, close)
    nodes.push(
      prelude.startsWith('@')
        ? { prelude, children: nodesOf(inner) }
        : { prelude, body: normalise(inner) },
    )
    index = close + 1
  }
  return nodes
}

/**
 * The rules of every `@layer atomic { ... }` block in `css`, in order.
 */
export function parseAtomicLayer(css: string): Node[] {
  const nodes: Node[] = []
  const opener = /@layer\s+atomic\s*\{/g
  for (let match = opener.exec(css); match; match = opener.exec(css)) {
    const start = match.index + match[0].length
    const close = closeOf(css, start)
    nodes.push(...nodesOf(css.slice(start, close)))
    opener.lastIndex = close
  }
  return nodes
}

/**
 * The comma-separated members of a selector list, outside parentheses.
 */
function membersOf(selector: string): string[] {
  const members: string[] = []
  let depth = 0
  let start = 0
  for (const [index, char] of [...selector].entries()) {
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      members.push(selector.slice(start, index))
      start = index + 1
    }
  }
  members.push(selector.slice(start))
  return members
}

/**
 * The tree with every selector-list member naming a built-in atom class outside `kept` removed,
 * and every rule or at-rule left with nothing removed with it.
 */
export function keepOnly(nodes: readonly Node[], kept: ReadonlySet<string>): Node[] {
  const result: Node[] = []
  for (const node of nodes) {
    if (node.children) {
      const children = keepOnly(node.children, kept)
      if (children.length > 0) result.push({ prelude: node.prelude, children })
      continue
    }
    const members = membersOf(node.prelude).filter((member) =>
      [...member.matchAll(/\.(nave-[\w-]+)/g)].every(
        (match) => !ATOM_CLASSES.has(match[1]!) || kept.has(match[1]!),
      ),
    )
    if (members.length > 0) result.push({ prelude: members.join(','), body: node.body! })
  }
  return result
}

/**
 * The class names (`nave-flex`) of the atoms `names`.
 */
export function classesOf(...names: string[]): Set<string> {
  return new Set(names.map((name) => atomClassMap[name as keyof typeof atomClassMap]))
}

/**
 * Every CSS text outside `@layer atomic` blocks, for comparing what the substitution must not touch.
 */
export function withoutAtomicLayer(css: string): string {
  let out = ''
  let cursor = 0
  const opener = /@layer\s+atomic\s*\{/g
  for (let match = opener.exec(css); match; match = opener.exec(css)) {
    out += css.slice(cursor, match.index)
    cursor = closeOf(css, match.index + match[0].length) + 1
    opener.lastIndex = cursor
  }
  return out + css.slice(cursor)
}
