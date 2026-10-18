/**
 * The facts `expandText()`'s walk carries down into each block it enters, and how a block's own
 * kind (a rule, an at-rule) decides what its children are told about their parent.
 */
import type { Item } from './block-reader.ts'
import type { Token } from './tokenizer.ts'

import { atKeywordName } from './block-reader.ts'
import { WORKAROUND_GROUP_AT_RULE_NAMES } from './group-at-rules.ts'

export interface WalkContext {
  readonly isStyleRuleParent: boolean
  readonly isInsideKeyframes: boolean
  /**
  Whether a style rule sits somewhere above this block, at any depth.
   */
  readonly hasStyleRuleAncestor: boolean
  /**
  Whether this block is a group at-rule the `& { }` workaround sentence applies to: one of `WORKAROUND_GROUP_AT_RULE_NAMES`, outside `@keyframes`, with a style rule above it.
   */
  readonly isWorkaroundGroup: boolean
  /**
  The selector list of the style rule this block belongs to, or `''` when it belongs to no style rule.
   */
  readonly selector: string
}

/**
True for any at-rule named `keyframes`, vendor-prefixed or not.
 */
function isKeyframesName(name: string): boolean {
  return /keyframes$/i.test(name)
}

/**
The child context a `rule`/`at-rule` item's own block is walked under.
 */
export function childContext(
  source: { readonly css: string; readonly tokens: readonly Token[] },
  item: Item,
  context: WalkContext,
): WalkContext {
  const { isInsideKeyframes, hasStyleRuleAncestor } = context
  const { css, tokens } = source
  if (item.kind === 'rule') {
    const selectorEnd = tokens[item.blockStart! - 1]!.startIndex
    return {
      isStyleRuleParent: true,
      isInsideKeyframes,
      hasStyleRuleAncestor: true,
      isWorkaroundGroup: false,
      selector: css.slice(tokens[item.start]!.startIndex, selectorEnd).trim(),
    }
  }
  const name = atKeywordName(tokens[item.start]!)
  const isKeyframes = isInsideKeyframes || isKeyframesName(name)
  return {
    isStyleRuleParent: false,
    isInsideKeyframes: isKeyframes,
    hasStyleRuleAncestor,
    isWorkaroundGroup:
      WORKAROUND_GROUP_AT_RULE_NAMES.has(name) && !isKeyframes && hasStyleRuleAncestor,
    selector: '',
  }
}
