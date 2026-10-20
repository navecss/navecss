/**
 * Turns `expandText()`'s diagnostics into what Vite prints: one `this.warn` per problem under
 * `'warn'`, one `this.error` for the whole stylesheet under `'error'` (the fold, shared with every
 * other host in `directive/fold.ts`), nothing under `'ignore'`. The host adds only its frame: the
 * `file:line:column:` the problem sits at, ahead of the core's own text. The position is the
 * authored file's when Vite supplied a source map, mapped back through it, and otherwise the file
 * Vite passed, with a closing line that says so. `loc.column` is 0-based, as Rollup reports one;
 * the message states the 1-based column itself.
 */
import type { ExpandedDiagnostic, ExpandedWarning } from './directive/expand-text-diagnostics.ts'
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
  /**
  Whether the position is the processed text's own: no incoming map, or one that does not cover this line.
   */
  readonly isProcessed: boolean
}

/**
 * `source` resolved against the map's `sourceRoot`, when it has one and `source` is a relative
 * path (a URL or an absolute path is already complete).
 */
function withSourceRoot(source: string, sourceRoot: string | undefined): string {
  if (!sourceRoot || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(source)) return source
  return `${sourceRoot.replace(/\/$/, '')}/${source}`
}

/**
 * A text and the position it sits at in the processed stylesheet, mapped back through the incoming
 * map when there is one.
 */
function locateAt(
  position: { readonly column: number; readonly line: number },
  text: string,
  input: Pick<ReportInput, 'file' | 'incoming'>,
): Located {
  const origin = input.incoming?.originalPositionFor({
    line: position.line,
    column: position.column - 1,
  })
  if (origin === undefined) {
    return {
      text,
      file: input.file,
      isProcessed: true,
      line: position.line,
      column: position.column,
    }
  }
  return {
    text,
    file: withSourceRoot(origin.source, input.incoming?.sourceRoot),
    isProcessed: false,
    line: origin.line,
    column: origin.column + 1,
  }
}

/**
 * A diagnostic's text and position, mapped back through the incoming map when there is one.
 */
function locate(diagnostic: ExpandedDiagnostic, input: ReportInput): Located {
  return locateAt(diagnostic, formatDiagnostic(diagnostic, { extend: input.extend }), input)
}

/**
 * `body` with, when the position is the processed file's own, a line saying so, kept ahead of a
 * closing `Available:` line so that line stays last. The line says why: Vite supplied no map, or
 * its map does not reach this line.
 */
function withNoMapNote(
  body: string,
  input: Pick<ReportInput, 'file' | 'incoming'>,
  at: Located,
): string {
  if (!at.isProcessed) return body
  const reason = input.incoming === undefined ? 'no source map' : 'the source map does not cover it'
  const note = `(position in ${input.file} as processed; ${reason})`
  const lines = body.split('\n')
  const hasAvailable = lines.at(-1)?.startsWith('Available: ') === true
  lines.splice(hasAvailable ? -1 : lines.length, 0, note)
  return lines.join('\n')
}

/**
 * The log object Rollup takes: `message`, the module id, and the position (0-based column).
 */
function logFor(message: string, input: Pick<ReportInput, 'id'>, at: Located): PluginLog {
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
      const message = withNoMapNote(`${frame(at)}${at.text}`, input, at)
      input.ctx.warn(logFor(message, input, at))
    }
    return
  }
  const first = located[0]!
  const message = withNoMapNote(`${frame(first)}${foldLocated(located)}`, input, first)
  input.ctx.error(logFor(message, input, first))
}

export interface OrderWarningInput {
  readonly ctx: TransformContext
  readonly file: string
  readonly id: string
  readonly incoming: IncomingMap | undefined
  readonly warnings: readonly ExpandedWarning[]
}

export interface PlacedWarning {
  /**
   * What identifies the warning across environments: the file, the position and the text.
   */
  readonly key: string
  readonly print: () => void
}

/**
 * Each order warning as Vite prints a problem: positioned through the incoming map, with the
 * note that says so when it could not be.
 */
export function placeOrderWarnings(input: OrderWarningInput): PlacedWarning[] {
  return input.warnings.map((warning) => {
    const at = locateAt(warning, warning.text, input)
    const message = withNoMapNote(`${frame(at)}${at.text}`, input, at)
    return {
      key: `${at.file}\0${at.line}\0${at.column}\0${at.text}`,
      print: () => {
        input.ctx.warn(logFor(message, input, at))
      },
    }
  })
}
