/**
 * The two hand-rolled scanners behind `doc-fences.ts`: finding fenced code blocks in a doc, and
 * reading tsup's `entry` map out of its config text. Split out of that file so it stays within
 * the repository's file-length limit. Not a test file and registers no tests.
 */

export interface Fence {
  readonly body: string
  readonly doc: string
  readonly lang: string
}

interface FenceRun {
  /**
   * The fence character and the run's length, so `3` backticks and `4` backticks differ.
   */
  readonly signature: string
  /**
   * Everything on the line after the run.
   */
  readonly rest: string
}

/**
 * The run of 3+ backticks or 3+ tildes a line starts with, or `undefined` when it does not start with one.
 */
function leadingFenceRun(line: string): FenceRun | undefined {
  const char = line[0]
  if (char !== '`' && char !== '~') return undefined
  let length = 1
  while (line[length] === char) length++
  if (length < 3) return undefined
  return { rest: line.slice(length), signature: `${char}${length}` }
}

/**
 * Whether the text after a fence run leaves a closing line: only spaces or tabs, and a `\r` when the doc has CRLF line endings.
 */
function isClosingRest(rest: string): boolean {
  return /^[ \t]*$/.test(rest.endsWith('\r') ? rest.slice(0, -1) : rest)
}

interface CloserQueue {
  /**
   * Ascending line indexes of the lines that can close a fence of one signature.
   */
  readonly lines: number[]
  /**
   * First entry of `lines` not yet passed by the walk.
   */
  next: number
}

/**
 * Every line that can close a fence, grouped by signature: a bare run of the fence character and nothing else.
 */
function collectClosers(runs: readonly (FenceRun | undefined)[]): Map<string, CloserQueue> {
  const closers = new Map<string, CloserQueue>()
  for (const [index, run] of runs.entries()) {
    if (!run || !isClosingRest(run.rest)) continue
    const queue = closers.get(run.signature) ?? { lines: [], next: 0 }
    queue.lines.push(index)
    closers.set(run.signature, queue)
  }
  return closers
}

/**
 * The first closing line after `openerIndex` in `queue`, or `undefined` when none is left. The walk only moves forward, so `next` never steps back over an entry.
 */
function nextCloser(queue: CloserQueue | undefined, openerIndex: number): number | undefined {
  if (!queue) return undefined
  while (queue.next < queue.lines.length && queue.lines[queue.next]! <= openerIndex) queue.next++
  return queue.lines[queue.next]
}

/**
 * Every fenced block in `text`, tagged with which doc it came from: a line
 * starting with a run of 3+ backticks or 3+ tildes (CommonMark allows
 * either), a language tag, then anything else on that line (an info string
 * carries more than the bare language, e.g. `` ```ts title="a" ``), closed
 * by the next line holding only the same fence character, the same number
 * of times, and nothing else but spaces or tabs.
 *
 * A line scan, linear in the size of `text` by construction: the text is
 * split into lines once, each line is classified once, and every closing
 * line is filed under its signature (character and run length) in that same
 * pass. Finding the closer for an opener is then a step along a list that
 * only moves forward, so no line is looked at twice however many openers
 * never close. An opener with no closer left yields no fence and the walk
 * goes on with the next line; a fence's lines are never opener candidates.
 */
export function extractFences(doc: string, text: string): Fence[] {
  const lines = text.split('\n')
  const runs = lines.map((line) => leadingFenceRun(line))
  const closers = collectClosers(runs)

  const fences: Fence[] = []
  let index = 0
  while (index < lines.length) {
    const run = runs[index]
    const closerIndex = run && nextCloser(closers.get(run.signature), index)
    if (!run || closerIndex === undefined) {
      index++
      continue
    }
    fences.push({
      body: lines
        .slice(index + 1, closerIndex)
        .map((line) => `${line}\n`)
        .join(''),
      doc,
      lang: /^[\w-]*/.exec(run.rest)![0],
    })
    index = closerIndex + 1
  }
  return fences
}

const WORD_OR_DOLLAR = /[\w$]/

/**
 * The index of the first non-whitespace character at or after `index`, or `text.length`.
 */
function skipWhitespace(text: string, index: number): number {
  let next = index
  while (next < text.length && /\s/.test(text[next]!)) next++
  return next
}

/**
One bare `key: 'value'` pair (tsup's own `entry` shape — unquoted keys) at or after `from` in
`text`, or `undefined` past the last usable colon. A hand-rolled scan, not
`/([\w$]+):\s*['"]([^'"]+)['"]/g`: that regex's `[\w$]+` has nothing to stop it trying every
length before giving up and moving on when a colon is missing nearby, which is O(n) wasted work
at every scanned position and O(n²) overall on a `tsup.config.ts` with few or no `entry` colons —
the exact shape `cssTrim`'s own regex was replaced for. `indexOf` for the colon and for the
closing quote, and the backward walk over the key's own word-character run, each advance the
scan position monotonically and never revisit the same character twice across iterations, so the
whole function is O(n) regardless of content.
 */
function nextEntryPair(
  text: string,
  from: number,
): { key: string; nextFrom: number; value: string } | undefined {
  let searchFrom = from
  for (;;) {
    const colonIndex = text.indexOf(':', searchFrom)
    if (colonIndex === -1) return undefined

    let keyStart = colonIndex
    while (keyStart > searchFrom && WORD_OR_DOLLAR.test(text[keyStart - 1]!)) keyStart--
    if (keyStart === colonIndex) {
      searchFrom = colonIndex + 1
      continue
    }

    const valueStart = skipWhitespace(text, colonIndex + 1)
    const quote = text[valueStart]
    if (quote !== '"' && quote !== "'") {
      searchFrom = colonIndex + 1
      continue
    }
    const closeIndex = text.indexOf(quote, valueStart + 1)
    if (closeIndex === -1) return undefined

    return {
      key: text.slice(keyStart, colonIndex),
      nextFrom: closeIndex + 1,
      value: text.slice(valueStart + 1, closeIndex),
    }
  }
}

/**
 * tsup's `entry` map (subpath name -> src file), read from the object literal in `tsup.config.ts` rather than by importing it, so this needs no tsup runtime behaviour.
 */
export function loadEntryMap(tsupConfigText: string): Record<string, string> {
  const block = /entry:\s*\{([\s\S]*?)\}/.exec(tsupConfigText)
  if (!block) return {}
  const content = block[1]!

  const entries: Record<string, string> = {}
  let from = 0
  for (;;) {
    const pair = nextEntryPair(content, from)
    if (!pair) break
    if (pair.key) entries[pair.key] = pair.value
    from = pair.nextFrom
  }
  return entries
}
