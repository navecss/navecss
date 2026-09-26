/**
 * Token shapes for the first-party CSS Syntax Level 3 tokenizer (§4.3). The
 * `type`/`structured` vocabulary matches `@rmenke/css-tokenizer-tests`'
 * corpus format directly (AC-directive-core-08), which is the tokenizer's
 * own conformance oracle.
 */

export type NumberType = 'integer' | 'number'
export type HashType = 'id' | 'unrestricted'

export interface AtKeywordStructured {
  readonly value: string
}
export interface HashStructured {
  readonly value: string
  readonly type: HashType
}
export interface StringStructured {
  readonly value: string
}
export interface DelimStructured {
  readonly value: string
}
export interface NumberStructured {
  readonly value: number
  readonly type: NumberType
  readonly signCharacter?: '+' | '-'
}
export interface DimensionStructured {
  readonly value: number
  readonly type: NumberType
  readonly unit: string
  readonly signCharacter?: '+' | '-'
}
export interface PercentageStructured {
  readonly value: number
  readonly signCharacter?: '+' | '-'
}
export interface IdentStructured {
  readonly value: string
}
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
