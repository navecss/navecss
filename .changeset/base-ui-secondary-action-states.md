---
'@navecss/base-ui': minor
---

The Button's default variant and the Toggle gain a hover and press fill. Until now only the `primary` and `ghost` variants changed under the pointer; a button with no `variant`, or `variant="secondary"`, did nothing. It now takes `--nave-color-action-secondary-hover` under the pointer and `--nave-color-action-secondary-active` while pressed, on the fill only, so the text stays `--nave-color-content-primary` and the border stays `--nave-color-border-control`. This reaches the twelve parts that carry the button's class (`Button`, `Toolbar.Button`, `Dialog.Trigger`, `Dialog.Close`, `AlertDialog.Trigger`, `AlertDialog.Close`, `Popover.Trigger`, `Popover.Close`, `Menu.Trigger`, `Tooltip.Trigger`, `Toast.Action` and `Toast.Close`) and the Toggle, which takes the same fills pressed or not. A disabled part takes neither, and the `primary` and `ghost` variants are untouched. The shadcn registry's copies of these components carry the same rules; a file you copied with an earlier release keeps its own.

The peer range of `@navecss/tokens` is raised from `>=0.4.0 <1.0.0` to `>=0.5.0 <1.0.0`, because the two colours exist from `@navecss/tokens` 0.5.0. On 0.4.x the fill would go transparent under the pointer.

After upgrading, re-run `navecss-tokens build` and commit what it writes, or a committed tokens file renders the secondary button with a transparent fill under the pointer and while pressed.

If you supply your own full colour set (the fifth rung of the theming ladder), it must now supply `--nave-color-action-secondary-hover` and `--nave-color-action-secondary-active` as well. If you override `--nave-color-action-secondary`, override these two with it, or the states keep Nave's colours over yours.
