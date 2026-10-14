/**
 * The decisions that ship only while they are signed off, each as the atoms it adds. A build with a
 * draft unsigned leaves those atoms out of the stylesheet and nothing else: the shipping build has
 * none unsigned. Not shipped: `styles/` is build input.
 */
export const DRAFTS = [
  'combobox',
  'highlight-fill',
  'open-ghost',
  'popup-fade',
  'tooltip-fade',
  'scrim',
  'toast-placement',
  'toast-fade',
  'toast-limit',
  'navigation-menu-fade',
] as const

export type Draft = (typeof DRAFTS)[number]

/**
The atoms each draft owns. Unsigned `combobox` takes the Combobox and Autocomplete atoms with it.
 */
export const draftAtoms: Readonly<Record<Draft, readonly string[]>> = {
  combobox: [
    'baseUiActiveOption',
    'baseUiInputGroup',
    'baseUiComboboxTrigger',
    'baseUiChips',
    'baseUiChip',
    'baseUiChipRemove',
    'baseUiListEmpty',
  ],
  'highlight-fill': ['baseUiItemHighlight'],
  // Its one key sits inside `baseUiButton`, see `openGhostKey`.
  'open-ghost': [],
  'popup-fade': ['baseUiPopupMotion', 'baseUiPopupFade'],
  'tooltip-fade': ['baseUiTooltipMotion'],
  scrim: ['baseUiBackdrop'],
  'toast-placement': ['baseUiToastPlacement'],
  'toast-fade': ['baseUiToastFade'],
  'toast-limit': ['baseUiToastLimit'],
  'navigation-menu-fade': ['baseUiNavigationMenuFade'],
}

/**
The key of `baseUiButton` that unsigned `open-ghost` takes out.
 */
export const openGhostKey =
  '&[data-nave-variant="ghost"][aria-expanded="true"]:not(:disabled, [aria-disabled="true"])'
