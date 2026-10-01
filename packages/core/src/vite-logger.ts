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
 * Replaces `logger.warn` with a function that drops the Lightning CSS `@nave` warning. It edits
 * the logger Vite owns in place, which is the consumer's own object when they pass a
 * `customLogger`.
 */
export function dropLightningNaveWarning(logger: LoggerLike): void {
  const original = logger.warn.bind(logger)
  logger.warn = function warn(message, options) {
    if (isUnknownNaveRuleWarning(message)) return
    original(message, options)
  }
}
