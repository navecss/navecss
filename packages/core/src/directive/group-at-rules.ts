/**
 * The group at-rules the `& { @nave ...; }` workaround sentence names: the ones a directive can be
 * moved out of and into a nested rule for, per CSS's own nesting rules. Never `@keyframes` (no `&`
 * use there) nor any other at-rule such as `@font-face`, which cannot itself nest inside a style
 * rule the way these can. Shared by the PostCSS adapter (which reads its own AST) and
 * `expandText()` (which reads tokens), so the two name the same set.
 */
export const WORKAROUND_GROUP_AT_RULE_NAMES: ReadonlySet<string> = new Set([
  'container',
  'layer',
  'media',
  'scope',
  'starting-style',
  'supports',
])
