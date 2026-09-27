import type { Declaration, Root } from 'postcss'
import type { Plugin } from 'stylelint'

/**
 * Rule 3's id: `@navecss/declared-custom-properties`. Re-exported from `index.d.ts` too, so a
 * consuming module can read it rather than retype it.
 */
export declare const ruleName: string

/** The rule's messages, keyed the way `stylelint.utils.ruleMessages` returns them. */
export declare const messages: {
  undeclared: (name: string) => string
}

/**
 * Every custom property whose name begins `--nave-`, declared anywhere in `source` (a raw CSS
 * string, or an already-parsed postcss `Root`).
 */
export declare function collectDeclaredCustomProperties(source: string | Root): Set<string>

/**
 * Every `var(--nave-*)` reference in `source` (a raw CSS string, or an already-parsed postcss
 * `Root`), one `{ decl, name }` pair per reference.
 */
export declare function findNaveVarReferences(
  source: string | Root,
): { decl: Declaration; name: string }[]

/** A stable SHA-256 hex digest of `content`. */
export declare function computeStylesheetDigest(content: string): string

/** The specifier this rule resolves its default stylesheet from: `@navecss/tokens/css`. */
export declare const DEFAULT_STYLESHEET_SPECIFIER: string

/** This rule's default secondary options: a digest of the default stylesheet's content. */
export declare const defaultRuleOptions: { digest: string }

/** The stylelint plugin object this module ships: `{ ruleName, rule }`. */
export declare const declaredCustomPropertiesPlugin: Plugin
