/**
 * The unstyled part each of the six components is checked with where a test needs one part that
 * the wrapper leaves as Base UI has it: a part that renders an element (one that renders none
 * has no ref to reach and no class to carry). The Menubar has none: the part it is, is styled.
 */
export const COMPLETION_PASS_THROUGHS: Readonly<Record<string, string>> = {
  'alert-dialog': 'AlertDialog.Viewport',
  autocomplete: 'Autocomplete.List',
  combobox: 'Combobox.List',
  'context-menu': 'ContextMenu.Positioner',
  'preview-card': 'PreviewCard.Positioner',
}
