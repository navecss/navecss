/**
 * `@rmenke/css-tokenizer-tests` ships no types (checked at 1.4.0: no `types`
 * field, no `.d.ts` in its published files). This is the local declaration,
 * scoped to this test directory, not a repository-wide ambient module.
 */
declare module '@rmenke/css-tokenizer-tests' {
  export interface ConformanceToken {
    readonly type: string
    readonly raw: string
    readonly startIndex: number
    readonly endIndex: number
    readonly structured: unknown
  }

  export interface ConformanceCase {
    readonly css: string
    readonly tokens: readonly ConformanceToken[]
  }

  export const testCorpus: Readonly<Record<string, ConformanceCase>>
}
