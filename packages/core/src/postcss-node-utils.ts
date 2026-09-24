/**
 * Small postcss AST helpers used by the @nave plugin (`postcss.ts`), split out
 * to keep that file under the project's file-length lint.
 */
import type {
  AtRule as PostCSSAtRule,
  Container as PostCSSContainer,
  Document as PostCSSDocument,
  Rule,
} from 'postcss'

/**
 * True when `rule` sits inside a @keyframes block, at any depth. A keyframe
 * step (`to`, `from`, `50%`) parses as a Rule, so a plain parent-is-a-rule
 * check does not catch this; `&` has no meaning inside @keyframes, and the
 * browser drops nesting generated there with no other symptom.
 */
export function isInsideKeyframes(rule: Rule): boolean {
  let node: PostCSSContainer | PostCSSDocument | undefined = rule.parent
  while (node) {
    if (node.type === 'atrule' && /keyframes$/i.test((node as PostCSSAtRule).name)) return true
    node = node.parent
  }
  return false
}

/**
 * Stamps `source` onto `node` and everything it contains, so source maps and
 * devtools can trace generated CSS back to the directive that produced it
 * (also what silences a bundler's "plugin did not pass `from`" warning on a
 * sourceless node). A programmatically-built directive with no `source` of
 * its own leaves the created nodes unstamped, same as before this helper.
 */
export function stampSource(node: Rule | PostCSSAtRule, source: PostCSSAtRule['source']): void {
  if (!source) return
  node.source = source
  node.walk((child) => {
    child.source = source
  })
}
