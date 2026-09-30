/**
 * Token shapes for the first-party CSS Syntax Level 3 tokenizer (§4.3). The
 * `type`/`structured` vocabulary matches `@rmenke/css-tokenizer-tests`'
 * corpus format directly (AC-directive-core-08), which is the tokenizer's
 * own conformance oracle.
 *
 * The per-token-kind `*Structured` shapes below (and `NumberType`/`HashType`)
 * are `@public`: real, load-bearing parts of `TokenStructured`'s union and
 * this tokenizer's documented vocabulary, kept exported for a consumer
 * narrowing on `Token['type']` even though no in-tree caller currently names
 * one directly — `@public` tells the dead-export check that on purpose,
 * rather than something to prune.
 */

/**
@public
 */
export type NumberType = 'integer' | 'number'
/**
@public
 */
export type HashType = 'id' | 'unrestricted'

/**
@public
 */
export interface AtKeywordStructured {
  readonly value: string
}
/**
@public
 */
export interface HashStructured {
  readonly value: string
  readonly type: HashType
}
/**
@public
 */
export interface StringStructured {
  readonly value: string
}
/**
@public
 */
export interface DelimStructured {
  readonly value: string
}
/**
@public
 */
export interface NumberStructured {
  readonly value: number
  readonly type: NumberType
  readonly signCharacter?: '+' | '-'
}
/**
@public
 */
export interface DimensionStructured {
  readonly value: number
  readonly type: NumberType
  readonly unit: string
  readonly signCharacter?: '+' | '-'
}
/**
@public
 */
export interface PercentageStructured {
  readonly value: number
  readonly signCharacter?: '+' | '-'
}
/**
@public
 */
export interface IdentStructured {
  readonly value: string
}
/**
@public
 */
export interface UrlStructured {
  readonly value: string
}

export type TokenType =
  | 'whitespace-token'
  | 'string-token'
  | 'bad-string-token'
  | 'hash-token'
  | 'delim-token'
  | 'number-token'
  | 'dimension-token'
  | 'percentage-token'
  | 'CDO-token'
  | 'CDC-token'
  | 'colon-token'
  | 'semicolon-token'
  | 'comma-token'
  | '[-token'
  | ']-token'
  | '(-token'
  | ')-token'
  | '{-token'
  | '}-token'
  | 'at-keyword-token'
  | 'ident-token'
  | 'function-token'
  | 'url-token'
  | 'bad-url-token'
  | 'comment'

/**
@public
 */
export type TokenStructured =
  | AtKeywordStructured
  | HashStructured
  | StringStructured
  | DelimStructured
  | NumberStructured
  | DimensionStructured
  | PercentageStructured
  | IdentStructured
  | UrlStructured
  | null

export interface Token {
  readonly type: TokenType
  readonly raw: string
  readonly startIndex: number
  readonly endIndex: number
  readonly structured: TokenStructured
}
