/**
 * Under `css.transformer: 'lightningcss'`, Vite hands every stylesheet to Lightning CSS before
 * any plugin's transform runs, and Lightning CSS warns `Unknown at rule: @nave` for each directive
 * it meets. Vite prints those warnings through `logger.warn` directly (a plugin's `onLog` never
 * sees them), so the one way to drop them is to wrap the resolved logger. The wrapper drops that
 * one warning and passes everything else through; it fails open, so a Vite that changes its
 * prefix or its logging path brings the warnings back and loses nothing, since the end-of-build
 * scan still fails a build that holds a surviving directive.
 */
import type { LoggerLike } from './vite-types.ts'

const ANSI_ESCAPE = new RegExp(String.raw`\u001B\[[\d;]*m`, 'g')

/**
 * Lightning CSS's own wording, matched ASCII case-insensitively and not as a prefix of another
 * at-rule's name (`@nave-x`, `@navex`). An escaped spelling may still warn.
 */
const UNKNOWN_NAVE_RULE = /Unknown at rule: @nave(?![\w-]|[^\p{ASCII}])/iu

/**
 * Whether `message` is Lightning CSS's warning about an unknown `@nave` at-rule.
 */
function isUnknownNaveRuleWarning(message: unknown): boolean {
  return typeof message === 'string' && UNKNOWN_NAVE_RULE.test(message.replaceAll(ANSI_ESCAPE, ''))
}

/**
 * The wrapper each logger was given, so a second call on a logger that still has it leaves it
 * alone, and a logger whose `warn` was replaced since is wrapped again.
 */
const wrappers = new WeakMap<LoggerLike, LoggerLike['warn']>()

/**
 * Replaces `logger.warn` with a function that drops the Lightning CSS `@nave` warning. It edits
 * the logger Vite owns in place, which is the consumer's own object when they pass a
 * `customLogger`. A logger whose `warn` is still the wrapper from an earlier call is left as it
 * is; one whose `warn` was replaced after that is wrapped again.
 */
export function dropLightningNaveWarning(logger: LoggerLike): void {
  if (wrappers.get(logger) === logger.warn) return
  const original = logger.warn.bind(logger)
  const wrapper: LoggerLike['warn'] = function warn(message, options) {
    if (isUnknownNaveRuleWarning(message)) return
    original(message, options)
  }
  logger.warn = wrapper
  wrappers.set(logger, wrapper)
}
