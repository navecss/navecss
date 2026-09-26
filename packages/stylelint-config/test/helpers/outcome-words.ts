/**
 * One scan for the "described by what it flags, never by its outcome" checks: a shipped surface
 * is cut into passages, every passage that mentions the subject is read, and any listed word in
 * it is a hit. The planted-sentence controls run through this same function, so a control that
 * passes proves the scan itself reports, not only that the word list contains a word.
 *
 * Whitespace is folded before the text is cut, so a sentence wrapped across lines is read as one
 * sentence and a phrase wrapped mid-way ("keyboard\nusers") still matches.
 */

/**
 * One shipped text, named for the failure message.
 */
export interface Surface {
  readonly name: string
  readonly text: string
}

/**
 * One listed word found in one passage that mentions the subject.
 */
export interface OutcomeWordHit {
  readonly surface: string
  readonly passage: string
  readonly word: string
}

/**
 * What one scan reads, and what it looks for.
 */
export interface OutcomeWordScan {
  /**
   * Which passages are read: those this pattern matches.
   */
  readonly mentions: RegExp
  /**
   * Matched case-insensitively as substrings.
   */
  readonly words: readonly string[]
  /**
   * `sentence` reads each sentence on its own. `paragraph` reads a whole paragraph (text between
   * blank lines) once any sentence in it mentions the subject, so a sentence that refers back to
   * it ("It protects ...") is read too.
   */
  readonly unit: 'paragraph' | 'sentence'
}

/**
 * `text` with every run of whitespace, line breaks included, folded to one space.
 */
function fold(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}

/**
 * The passages of `text` a scan reads: its paragraphs, or the sentences of its paragraphs.
 */
function passagesOf(text: string, unit: OutcomeWordScan['unit']): string[] {
  const paragraphs = text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => fold(paragraph))
    .filter((paragraph) => paragraph.length > 0)
  if (unit === 'paragraph') return paragraphs
  return paragraphs.flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
}

/**
 * Every hit of `scan` across `surfaces`; an empty list means every passage that mentions the
 * subject is free of the listed words.
 */
export function findOutcomeWords(
  surfaces: readonly Surface[],
  scan: OutcomeWordScan,
): OutcomeWordHit[] {
  return surfaces.flatMap(({ name, text }) =>
    passagesOf(text, scan.unit)
      .filter((passage) => scan.mentions.test(passage))
      .flatMap((passage) =>
        scan.words
          .filter((word) => passage.toLowerCase().includes(word.toLowerCase()))
          .map((word) => ({ surface: name, passage, word })),
      ),
  )
}

/**
 * The comment text of a JavaScript or declaration source, the part of a no-build package's
 * shipped file a reader sees as prose. Each comment becomes its own paragraph; consecutive `//`
 * lines form one comment, and an empty `//` line inside them starts a new paragraph. Only
 * whole-line comments are read; this package's sources carry no trailing ones.
 */
export function commentText(source: string): string {
  const blocks: string[] = []
  let lineRun: string[] = []
  const flushLineRun = (): void => {
    if (lineRun.length > 0) blocks.push(lineRun.join('\n'))
    lineRun = []
  }
  for (const match of source.matchAll(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$|^.*$/gm)) {
    const token = match[0]
    if (token.startsWith('/*')) {
      flushLineRun()
      blocks.push(
        token
          .replace(/^\/\*+/, '')
          .replace(/\*\/$/, '')
          .split('\n')
          .map((line) => line.replace(/^\s*\* ?/, ''))
          .join('\n'),
      )
    } else if (/^\s*\/\//.test(token)) {
      lineRun.push(token.replace(/^\s*\/\/ ?/, ''))
    } else {
      flushLineRun()
    }
  }
  flushLineRun()
  return blocks.join('\n\n')
}
