/**
 * R10: what `navecss-core check` counts as a surviving directive. Finds
 * every at-keyword whose unescaped, ASCII-lowercased name is `nave`,
 * outside comments and strings, declaration values included (R5f) — the
 * one place `expandText()` deliberately never looks, because a directive
 * inside a value is not a directive there, but IS a bug if it reaches
 * built CSS unexpanded.
 */
import { isNaveAtKeyword, type Item, readItem } from './block-reader.ts'
import { type Token, tokenize } from './tokenizer.ts'

export interface Survivor {
  readonly offset: number
  readonly text: string
  readonly selector?: string | undefined
}

const NATURAL_STOP_CHARS = new Set(['\n', ';', '}'])

/**
 * A readable snippet for a survivor's report: from its `@` to the earliest
 * natural stop (`;`, `}`, a line break, or end of input). Not token-aware —
 * display text only, never used for placement.
 */
function naturalTextAfter(css: string, offset: number): string {
  let end = css.length
  for (let i = offset; i < css.length; i++) {
    if (NATURAL_STOP_CHARS.has(css[i]!)) {
      end = i
      break
    }
  }
  return css.slice(offset, end).trim()
}

/**
Not whitespace, not a comment: a candidate item-start token.
 */
function isStructural(token: Token): boolean {
  return token.type !== 'whitespace-token' && token.type !== 'comment'
}

/**
The next structural token index at or after `i`, within `[i, limit)`.
 */
function skipInert(tokens: readonly Token[], i: number, limit: number): number {
  let j = i
  while (j < limit && !isStructural(tokens[j]!)) j++
  return j
}

/**
The shared, read-only state one `findSurvivors()` call threads through every recursive block walk.
 */
class Scan {
  readonly css: string
  readonly survivors: Survivor[] = []
  readonly tokens: readonly Token[]

  constructor(css: string) {
    this.css = css
    this.tokens = tokenize(css)
  }
}

/**
Every `nave`-named at-keyword token in `[start, end)` — a declaration's value may carry one (R5f).
 */
function scanForNaveTokens(scan: Scan, start: number, end: number, selector: string | undefined): void {
  for (let i = start; i < end; i++) {
    const token = scan.tokens[i]!
    if (isNaveAtKeyword(token)) scan.survivors.push({ offset: token.startIndex, text: naturalTextAfter(scan.css, token.startIndex), selector })
  }
}

/**
The literal text of a `rule` item's own selector, from its start to its `{`.
 */
function ruleSelector(scan: Scan, item: Item): string {
  const braceIndex = (item.blockStart!) - 1
  return scan.css.slice(scan.tokens[item.start]!.startIndex, scan.tokens[braceIndex]!.startIndex).trim()
}

/**
Recurses into `item`'s own `{}` content, if it has one.
 */
function walkChildBlock(scan: Scan, item: Item, selector: string | undefined): void {
  if (item.blockStart === undefined || item.blockEnd === undefined) return
  const childSelector = item.kind === 'rule' ? ruleSelector(scan, item) : selector
  walkBlock(scan, skipInert(scan.tokens, item.blockStart, item.blockEnd), item.blockEnd, childSelector)
}

/**
One item's contribution: a survivor when it's a `nave` at-rule, a scan of its value when it's a declaration, a recursion when it carries a block.
 */
function visitItem(scan: Scan, item: Item, selector: string | undefined): void {
  switch (item.kind) {
    case 'at-rule': {
      if (isNaveAtKeyword(scan.tokens[item.start]!)) {
        const atToken = scan.tokens[item.start]!
        scan.survivors.push({ offset: atToken.startIndex, text: naturalTextAfter(scan.css, atToken.startIndex), selector })
      }
      walkChildBlock(scan, item, selector)
      return
    }
    case 'declaration': {
      scanForNaveTokens(scan, item.start, item.end, selector)
      return
    }
    case 'invalid': {
      return
    }
    case 'rule': {
      walkChildBlock(scan, item, selector)
      return
    }
  }
}

/**
Walks one block's items, in `[start, limit)`, reporting every surviving directive under `selector`.
 */
function walkBlock(scan: Scan, start: number, limit: number, selector: string | undefined): void {
  let i = skipInert(scan.tokens, start, limit)
  while (i < limit) {
    const item = readItem(scan.tokens, i, limit)
    visitItem(scan, item, selector)
    i = skipInert(scan.tokens, item.end, limit)
  }
}

/**
Every surviving `@nave` directive in `css`, each with the enclosing rule's own selector text (`undefined` at the top level).
 */
export function findSurvivors(css: string): Survivor[] {
  const scan = new Scan(css)
  walkBlock(scan, 0, scan.tokens.length, undefined)
  return scan.survivors
}
