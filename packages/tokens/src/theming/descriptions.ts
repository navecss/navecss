/**
 * R18b, R35: the `$description` strings for the taxonomy-corrected slots, kept as one
 * canonical map so the DTCG source, the lint (`copy-lint.ts`) and any generated docs read
 * the same text. R18b: `content.tertiary` is placeholder/hint ONLY, `content.disabled`
 * carries the disabled use, and neither description spans both.
 */
export const SLOT_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  [
    'border.control',
    'Identifying boundary for a control (inputs, form boundaries, and the secondary action control).',
  ],
  ['border.default', 'Decorative dividers and card edges.'],
  ['content.disabled', 'Text inside a disabled interactive component.'],
  ['content.inverse', 'Declared foreground for surface.inverse.'],
  [
    // C2 of the project's signed-off contrast threshold table: a Nave-authored sample must not
    // distinguish a link by colour alone. Phrased to hold under the achromatic branch too
    // (R3(a); content.link aliases content.primary there), where "colour" is not this
    // token's own colour but the one it resolves to — the instruction does not depend on
    // which. Says nothing about consumer stylesheets (R34) and names no specific non-colour
    // cue (the project's accessibility and licensing reviewer's call, not this file's).
    'content.link',
    "Do not distinguish a link by colour alone. Nave's own examples keep a non-colour distinction wherever this token is shown.",
  ],
  ['content.tertiary', 'Placeholder and hint text only.'],
  ['feedback.danger', 'Solid-background role for a destructive control or error state.'],
  ['feedback.danger.foreground', 'Foreground role for danger text and icons.'],
  ['feedback.info', 'Alias of feedback.warning (shared tinted-neutral family).'],
  ['feedback.success', 'Alias of feedback.warning (shared tinted-neutral family).'],
  ['feedback.warning', 'Solid-background role for a warning state (shared tinted-neutral family).'],
  ['feedback.warning.foreground', 'Foreground role for warning text and icons.'],
  ['on-feedback.danger', 'Declared foreground for the solid feedback.danger background.'],
])
