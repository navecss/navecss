import type { AtRule, Declaration, Root } from 'postcss'
import type { Plugin } from 'stylelint'

/**
 * This rule's id: `@navecss/declared-custom-properties`. Re-exported from `index.d.ts` too, so a
 * consuming module can read it rather than retype it.
 */
export declare const ruleName: string

/**
 * Every custom property whose name begins `--nave-`, declared anywhere in `source` (a raw CSS
 * string, or an already-parsed postcss `Root`).
 */
export declare function collectDeclaredCustomProperties(source: string | Root): Set<string>

/**
 * Every `var(--nave-*)` reference in `source` (a raw CSS string, or an already-parsed postcss
 * `Root`), one `{ decl, name }` pair per reference: `decl` is the declaration a reference in a
 * value was found in, or the at-rule a reference in a prelude (`@supports (...)`) was found in.
 */
export declare function findNaveVarReferences(
  source: string | Root,
): { decl: Declaration | AtRule; name: string }[]

/** A stable SHA-256 hex digest of `content`. */
export declare function computeStylesheetDigest(content: string): string

/**
 * Reads and parses the stylesheet at `absolutePath`, through this rule's own process-lifetime
 * memoisation by path, modification time and size: the same entry object for a repeat call
 * against an unchanged file, a new one once its modification time or size changes.
 */
export declare function readStylesheet(absolutePath: string): {
  mtimeMs: number
  size: number
  content: string
  names: Set<string>
}

/** This rule's default secondary options: a digest of the default stylesheet's content. */
export declare const defaultRuleOptions: { digest: string }

/** The stylelint plugin object this module ships: `{ ruleName, rule }`. */
export declare const declaredCustomPropertiesPlugin: Plugin
