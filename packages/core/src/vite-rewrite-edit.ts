/**
 * A text edit, and the module text with a list of them applied, with the source map from the
 * result back to the text it came from.
 */
import { MappingsBuilder } from './directive/source-map.ts'
import { positionIn } from './vite-source-map.ts'

/**
 * Replaces the text from `start` up to `end` of the module with `text`.
 */
export interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}

export interface Rewritten {
  readonly code: string
  /**
   * The version 3 source map from the rewritten text to the module's own text, as JSON.
   */
  readonly map: string
}

/**
 * A run of word characters, or one character of anything else: where a token of the unedited text
 * starts, so a position after an edit maps to the same token in the authored text.
 */
const TOKEN = /\w+|[\s\S]/gu

/**
 * `text` as the mappings builder counts it, which ends a line at a form feed and not at the two
 * separators JavaScript ends one at; a character for a character, so no column moves.
 */
function countable(text: string): string {
  return text.replaceAll('\f', ' ').replaceAll(/[\u{2028}\u{2029}]/gu, '\n')
}

/**
 * `code` with every edit applied, and the source map back to `code`, in which each token of
 * the text an edit leaves alone maps to where it was written. The edits do not overlap.
 */
export function applyEdits(code: string, id: string, edits: readonly Edit[]): Rewritten {
  const position = positionIn(code)
  const mappings = new MappingsBuilder()
  const mark = (offset: number): void => {
    const { line, column } = position(offset)
    mappings.mark({ line, column: column - 1 })
  }
  let out = ''
  const keep = (from: number, to: number): void => {
    const text = code.slice(from, to)
    for (const token of text.matchAll(TOKEN)) {
      if (token[0].trim() !== '') mark(from + token.index)
      mappings.advance(countable(token[0]))
    }
    out += text
  }
  const ordered = edits.toSorted((a, b) => a.start - b.start || a.end - b.end)
  let cursor = 0
  for (const edit of ordered) {
    keep(cursor, edit.start)
    if (edit.text !== '') {
      mark(edit.start)
      mappings.advance(countable(edit.text))
      out += edit.text
    }
    cursor = edit.end
  }
  keep(cursor, code.length)
  const map = { version: 3, sources: [id], names: [], mappings: mappings.toMappings() }
  return { code: out, map: JSON.stringify(map) }
}
