/**
 * Turns `expandText()`'s diagnostics into what Vite prints: one `this.warn` per problem under
 * `'warn'`, one `this.error` for the whole stylesheet under `'error'` (the fold, shared with every
 * other host in `directive/fold.ts`), nothing under `'ignore'`. The host adds only its frame: the
 * `file:line:column:` the problem sits at, ahead of the core's own text. The position is the
 * authored file's when Vite supplied a source map, mapped back through it, and otherwise the file
 * Vite passed, with a closing line that says so. `loc.column` is 0-based, as Rollup reports one;
 * the message states the 1-based column itself.
 */
import type { ExpandedDiagnostic } from './directive/expand-text-diagnostics.ts'
import type { ExtendMap } from './directive/resolve.ts'
import type { IncomingMap } from './directive/source-map.ts'
import type { PluginLog, TransformContext } from './vite-types.ts'

import { formatDiagnostic } from './directive/diagnostics-format.ts'
import { foldLocated, type LocatedText } from './directive/fold.ts'

export interface ReportInput {
  readonly ctx: TransformContext
  readonly diagnostics: readonly ExpandedDiagnostic[]
  readonly extend: ExtendMap
  /**
  The module id Vite passed.
   */
  readonly id: string
  /**
  `id`'s path, without its query: what a message names when nothing maps back.
   */
  readonly file: string
  /**
  The incoming source map, decoded, when Vite supplied a real one.
   */
  readonly incoming: IncomingMap | undefined
  readonly onUnknown: 'warn' | 'error' | 'ignore'
}

interface Located extends LocatedText {
  readonly file: string
}

/**
 * A diagnostic's text and position, mapped back through the incoming map when there is one.
 */
function locate(diagnostic: ExpandedDiagnostic, input: ReportInput): Located {
  const text = formatDiagnostic(diagnostic, { extend: input.extend })
  const origin = input.incoming?.originalPositionFor({
    line: diagnostic.line,
    column: diagnostic.column - 1,
  })
  if (origin === undefined) {
    return { text, file: input.file, line: diagnostic.line, column: diagnostic.column }
  }
  return { text, file: origin.source, line: origin.line, column: origin.column + 1 }
}

/**
 * `body` with, when Vite supplied no source map, a line saying the position is the processed
 * file's own, kept ahead of a closing `Available:` line so that line stays last.
 */
function withNoMapNote(body: string, input: ReportInput): string {
  if (input.incoming !== undefined) return body
  const note = `(position in ${input.file} as processed; no source map)`
  const lines = body.split('\n')
  const hasAvailable = lines.at(-1)?.startsWith('Available: ') === true
  lines.splice(hasAvailable ? -1 : lines.length, 0, note)
  return lines.join('\n')
}

/**
 * The log object Rollup takes: `message`, the module id, and the position (0-based column).
 */
function logFor(message: string, input: ReportInput, at: Located): PluginLog {
  return {
    message,
    id: input.id,
    loc: { file: at.file, line: at.line, column: at.column - 1 },
  }
}

/**
 * The `file:line:column: ` frame the host puts ahead of the core's text.
 */
function frame(at: Located): string {
  return `${at.file}:${at.line}:${at.column}: `
}

/**
 * Reports `input.diagnostics` per `input.onUnknown`; under `'error'` this throws.
 */
export function reportDiagnostics(input: ReportInput): void {
  if (input.onUnknown === 'ignore' || input.diagnostics.length === 0) return
  const inSourceOrder = input.diagnostics.toSorted((a, b) => a.offset - b.offset)
  const located = inSourceOrder.map((diagnostic) => locate(diagnostic, input))
  if (input.onUnknown === 'warn') {
    for (const at of located) {
      const message = withNoMapNote(`${frame(at)}${at.text}`, input)
      input.ctx.warn(logFor(message, input, at))
    }
    return
  }
  const first = located[0]!
  const message = withNoMapNote(`${frame(first)}${foldLocated(located)}`, input)
  input.ctx.error(logFor(message, input, first))
}
