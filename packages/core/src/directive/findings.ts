/**
 * What a surviving `@nave` in built CSS looks like once found: the shared shape and text behind
 * `navecss-core check` and the Vite plugin's end-of-build scan, so the two print the same line for
 * the same content.
 */
import { createPositionFinder } from './expand-text-diagnostics.ts'
import { findSurvivors } from './find-survivors.ts'

export interface Finding {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly text: string
  readonly selector?: string
}

/**
 * Every surviving directive in `raw`, the stylesheet's own text, reported against `file`. A
 * leading BOM (Node's utf8 decoding keeps it as a literal U+FEFF, unlike a `TextDecoder` set to
 * strip one) is not part of the stylesheet's content: left in, it shifts every reported column by
 * one relative to what the file looks like once opened in an editor that hides it.
 */
export function findingsInText(file: string, raw: string): Finding[] {
  const css = raw.startsWith('\u{FEFF}') ? raw.slice(1) : raw
  // Built once per file, not once per query: a fresh linear scan per
  // query made a large stylesheet with many directives quadratic in its
  // own size.
  const positionAt = createPositionFinder(css)
  return findSurvivors(css).map((survivor) => {
    const position = positionAt(survivor.offset)
    return {
      file,
      line: position.line,
      column: position.column + 1,
      text: survivor.text,
      ...(survivor.selector !== undefined && { selector: survivor.selector }),
    }
  })
}

/**
 * One line per finding: file, position, the directive as written, and its enclosing selector.
 */
export function formatFinding(finding: Finding): string {
  // A selector can span lines (and carry runs of whitespace); one finding stays one line.
  const where =
    finding.selector === undefined ? '' : ` (in ${finding.selector.replaceAll(/\s+/g, ' ')})`
  return `${finding.file}:${finding.line}:${finding.column}: ${finding.text}${where}`
}
