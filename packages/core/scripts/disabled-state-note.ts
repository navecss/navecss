/**
 * `disabledState`'s aria-disabled sentence, read from its own docblock in `src/atoms.ts` at
 * generation time — never hand-transcribed (R1) and never retyped a second time as a test
 * literal (R23): the span from "On the aria-disabled branch" through "keyboard activation." in
 * the docblock directly above `disabledState: {`, its lines joined with a single space each.
 *
 * Split out of `generate-atoms-doc.ts` on its own when that file passed this repository's
 * per-file line budget — the same split `generate-skill.ts`/`generate-skill-sources.ts` already
 * model. Shared by `generate-atoms-doc.ts` (`ATOMS.md`) and `generate-skill-sources.ts`
 * (`SKILL.md`), so neither re-derives the extraction.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ATOMS_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/atoms.ts')

const DISABLED_STATE_KEY_LINE = '  disabledState: {'
const DISABLED_STATE_NOTE_START = 'On the aria-disabled branch'
const DISABLED_STATE_NOTE_END = 'keyboard activation.'

/**
 * The line index of the last line before `beforeIndex` whose trimmed text equals `target`, or
 * `-1` when none exists.
 */
function findLastMatchingLine(
  lines: readonly string[],
  beforeIndex: number,
  target: string,
): number {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (lines[i]!.trim() === target) return i
  }
  return -1
}

/**
 * The `[start, end)` line range of the docblock (the lines between its opening and closing
 * comment markers, exclusive of both) that sits directly above `keyLine` in `lines`. Throws,
 * naming what is missing, when the key line or its docblock cannot be found — a reader that
 * returned an empty range on a reworded docblock would drop the sentence with no signal.
 */
function findDocblockAbove(
  lines: readonly string[],
  keyLine: string,
): { end: number; start: number } {
  const keyIndex = lines.indexOf(keyLine)
  if (keyIndex === -1) {
    throw new Error(`generate-atoms-doc: could not find "${keyLine}" in atoms.ts`)
  }
  const blockEnd = findLastMatchingLine(lines, keyIndex, '*/')
  const blockStart = blockEnd === -1 ? -1 : findLastMatchingLine(lines, blockEnd, '/**')
  if (blockStart === -1 || blockEnd === -1) {
    throw new Error(`generate-atoms-doc: could not find the docblock above "${keyLine}"`)
  }
  return { end: blockEnd, start: blockStart }
}

/**
 * Fails loud: throws, naming what is missing, when the key line, the docblock around it, or
 * either anchor is not found — a reader that returned an empty string on a reworded docblock
 * would drop the sentence with no signal (steward's gant §8's condition exists to prevent
 * exactly that).
 */
export function readDisabledStateNote(
  sourceText: string = readFileSync(ATOMS_SRC, 'utf8'),
): string {
  const lines = sourceText.split('\n')
  const { start, end } = findDocblockAbove(lines, DISABLED_STATE_KEY_LINE)
  const text = lines
    .slice(start + 1, end)
    .map((line) => line.trim().replace(/^\*\s?/, ''))
    .join(' ')
  const startAt = text.indexOf(DISABLED_STATE_NOTE_START)
  const endAt = text.indexOf(DISABLED_STATE_NOTE_END)
  if (startAt === -1 || endAt === -1) {
    throw new Error(
      'generate-atoms-doc: could not find the aria-disabled sentence anchors in the ' +
        'disabledState docblock',
    )
  }
  return text.slice(startAt, endAt + DISABLED_STATE_NOTE_END.length)
}
