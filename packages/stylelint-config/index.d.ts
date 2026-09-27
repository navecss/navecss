import type { Config } from 'stylelint'

/**
 * The `outline: none` / `outline: 0` pattern the default export's `outline` check uses,
 * exported so a consuming module can read it rather than copy it.
 */
export declare const OUTLINE_GUARD_PATTERN: string[]

/**
 * The consumer-facing message the default export's `outline` check prints, exported so a
 * consuming module can assert against it rather than duplicate it.
 */
export declare const OUTLINE_GUARD_CONSUMER_MESSAGE: string

declare const config: Config
export default config
