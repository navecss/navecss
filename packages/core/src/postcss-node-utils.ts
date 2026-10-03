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

import { WORKAROUND_GROUP_AT_RULE_NAMES } from './directive/group-at-rules.ts'

/**
 * True when `container` itself, or any of its ancestors, is a @keyframes
 * at-rule. A keyframe step (`to`, `from`, `50%`) parses as a Rule, so a
 * plain parent-is-a-rule check does not catch this; `&` has no meaning
 * inside @keyframes, and the browser drops nesting generated there with
 * no other symptom. Checking `container` itself (never true for a Rule,
 * which is the only type the original caller ever passed) is what lets a
 * directive whose immediate parent IS the @keyframes at-rule — no step
 * wrapper between them — be caught too.
 */
export function isInsideKeyframes(container: PostCSSContainer | PostCSSDocument): boolean {
  let node: PostCSSContainer | PostCSSDocument | undefined = container
  while (node) {
    if (node.type === 'atrule' && /keyframes$/i.test((node as PostCSSAtRule).name)) return true
    node = node.parent
  }
  return false
}

/**
 * Whether `refusedParent` — a group at-rule refused as `@nave`'s parent —
 * is one the `& { }` workaround sentence applies to: one of the group
 * at-rules above, with a style rule ancestor at any depth, not only as its
 * own direct parent, however many further group rules sit between it and
 * that style rule. Never inside `@keyframes`: a keyframe step (`from`,
 * `to`, a percentage) parses as a Rule, so the ancestor walk below would
 * otherwise read it as the style rule the sentence is about — but `&` has
 * no meaning inside `@keyframes`, so the advice would be wrong there.
 */
export function hasWorkaroundSentence(refusedParent: PostCSSContainer | PostCSSDocument): boolean {
  if (refusedParent.type !== 'atrule') return false
  if (!WORKAROUND_GROUP_AT_RULE_NAMES.has((refusedParent as PostCSSAtRule).name.toLowerCase())) {
    return false
  }
  if (isInsideKeyframes(refusedParent)) return false
  let current = refusedParent.parent
  while (current) {
    if (current.type === 'rule') return true
    current = current.parent
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
