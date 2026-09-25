/**
 * Fence-aware markdown section parsing shared by the scripts that assert against the
 * repository-root `README.md`'s rendered text. Extracted from `readme-theming-ladder.test.mjs`
 * (round 4 of that review) when a second and third script needed the same parsing
 * rather than re-deriving it: the review that hardened this parsing
 * spent three rounds getting it right, and shipping a second fence parser was named there as a
 * defect class this repo has already hit twice.
 *
 * ONE CODE-BLOCK KIND IS RECOGNISED: THE BACKTICK FENCE (see the docblock in
 * `readme-theming-ladder.test.mjs` for why tilde fences and indented blocks were deliberately
 * dropped).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Reads the repository-root README.md and returns its raw text.
 */
export function readReadme() {
  return readFileSync(path.join(ROOT, 'README.md'), 'utf8')
}

/**
 * Every backtick fence in `body`, the set of line indexes any fence occupies (delimiters
 * included), and the set of line indexes any HTML comment block occupies. Both are tracked in
 * ONE pass, in document order, because they suppress each other: while a comment is open, a line
 * that looks like a fence marker is not one (so a stray ``` inside a comment cannot swallow the
 * rest of the document into a phantom fence, and a real fence inside a comment is not a fence a
 * reader ever sees rendered); while a fence is open, `<!--` is literal fence content, not the
 * start of a comment. A second, independent scan of either kind over the same text could not
 * honour this, because each one's state depends on the other's.
 *
 * FENCES: CommonMark's own rule, not a ``` toggle: a toggle closes on the first ``` it meets, so
 * a four-backtick fence nesting a three-backtick one would invert the fence state for the rest of
 * the document and move every section boundary below it. `content` keeps each line's own
 * indentation, so `contentStart` / `contentEnd` are exact offsets into `body` and a command can be
 * located in the artifact it was found in.
 *
 * COMMENTS: CommonMark's type-2 HTML block. Outside a fence and outside an already-open comment,
 * a line whose content opens with `<!--` (indented no more than three spaces) starts one; it ends
 * on the first line containing `-->` (which may be the opening line itself, after the `<!--`), or
 * otherwise runs to the end of the document.
 */
export function scanFences(body) {
  const lines = body.split('\n')
  const offset = []
  let cursor = 0
  for (const line of lines) {
    offset.push(cursor)
    cursor += line.length + 1
  }

  // At least three backticks, indented no more than three spaces; a backtick fence's info
  // string may not itself contain a backtick. A closer is a run at least as long as its
  // opener carrying no info string.
  const marker = (line) => {
    const match = /^ {0,3}(`{3,})([^`]*)$/.exec(line)
    return match === null ? null : { length: match[1].length, info: match[2].trim() }
  }

  const fences = []
  const fenceLines = new Set()
  const commentLines = new Set()
  const close = (open, to) => {
    const content = lines.slice(open.from, to).join('\n')
    const contentStart = offset[open.from] ?? body.length
    fences.push({
      info: open.info,
      lang: open.info.split(/\s+/, 1)[0].toLowerCase(),
      content,
      contentStart,
      contentEnd: contentStart + content.length,
      from: open.from,
      to: to - 1,
    })
  }

  let open = null
  let commentOpen = false
  for (const [i, line] of lines.entries()) {
    if (open !== null) {
      // Inside a fence: `<!--` is literal content, so only a closer is ever looked for.
      fenceLines.add(i)
      const found = marker(line)
      if (found !== null && found.info === '' && found.length >= open.length) {
        close(open, i)
        open = null
      }
      continue
    }
    if (commentOpen) {
      // Inside a comment: a fence marker is not recognised, so only the closer is looked for.
      commentLines.add(i)
      if (line.includes('-->')) commentOpen = false
      continue
    }
    const found = marker(line)
    if (found !== null) {
      open = { ...found, from: i + 1 }
      fenceLines.add(i)
      continue
    }
    if (/^ {0,3}<!--/.test(line)) {
      commentLines.add(i)
      commentOpen = !line.slice(line.indexOf('<!--') + 4).includes('-->')
    }
  }
  // An unclosed fence runs to the end of the document (CommonMark); so does an unclosed comment.
  if (open !== null) close(open, lines.length)

  return { fences, fenceLines, commentLines }
}

/**
 * The fence list from `scanFences(body)`, dropping its line-index sets for callers that only
 * need the fences themselves.
 */
export function fences(body) {
  return scanFences(body).fences
}

/**
 * The line indexes that are REAL markdown headings: `#`-prefixed and outside every fence. A
 * `#` line inside a fence is a shell comment, and reading it as a heading truncates the
 * section that contains it.
 */
export function headingLines(lines) {
  const { fenceLines } = scanFences(lines.join('\n'))
  const headings = new Set()
  for (const [i, line] of lines.entries()) {
    if (!fenceLines.has(i) && /^#{1,6}\s/.test(line)) headings.add(i)
  }
  return headings
}

/**
 * The line range of the section a heading opens: from that heading to the next REAL heading
 * of the same or shallower depth. `depth` is the boundary depth, so a deeper sub-heading stays
 * INSIDE the section it belongs to.
 */
export function sectionRange(lines, headings, headingPattern, depth) {
  const start = lines.findIndex((line, i) => headings.has(i) && headingPattern.test(line))
  assert.ok(start !== -1, `expected to find a heading matching ${headingPattern} in README.md`)
  const boundary = new RegExp(String.raw`^#{1,${depth}}\s`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (headings.has(i) && boundary.test(lines[i])) {
      end = i
      break
    }
  }
  return { start, end }
}

/**
 * The lines strictly inside `range`, excluding its heading line and its end boundary.
 */
export function bodyOf(lines, range) {
  return lines.slice(range.start + 1, range.end).join('\n')
}
