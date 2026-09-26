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
const DISABLED_STATE_HEADER = 'disabledState — visual + behavioural disabled treatment.'
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
 * Fails loud: throws, naming what is missing, when the key line, the docblock around it, either
 * anchor, or the docblock's own header line is not found — a reader that returned an empty
 * string on a reworded docblock would drop the accessibility caveat below with no signal at
 * all, and a keyboard-activation warning that silently disappears is worse than one that never
 * shipped.
 *
 * `findDocblockAbove` only ever returns the NEAREST docblock before the key line, so a decoy
 * docblock inserted between the real one and `disabledState: {` — one that happens to also carry
 * both sentence anchors — would otherwise be accepted silently. Requiring the located docblock
 * to open with `disabledState`'s own header line ties the extraction to the atom's identifying
 * comment, not to mere proximity to the key line.
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
  if (!text.startsWith(DISABLED_STATE_HEADER)) {
    throw new Error(
      'generate-atoms-doc: the docblock directly above "disabledState: {" does not open with ' +
        `its own header line ("${DISABLED_STATE_HEADER}") — a nearer, unrelated docblock may ` +
        'have been matched instead of the one that belongs to disabledState',
    )
  }
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
