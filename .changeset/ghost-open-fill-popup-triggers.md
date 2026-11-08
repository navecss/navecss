---
'@navecss/base-ui': patch
---

A `ghost` button now keeps its fill while open only when what it opens is a menu, a popover or a dialog. The fill was keyed on `aria-expanded="true"` alone, so a ghost button used as the trigger of a disclosure (a `Collapsible` or `Accordion` trigger, a `NavigationMenu` trigger) or of a `Select` held the same fill for as long as it was open, which reads as a pressed button and leaves a neighbouring focus ring on a fill it was not measured against. The key now also requires `aria-haspopup` to be `menu`, `true` or `dialog`, which Base UI sets on the `Menu`, `Popover`, `Dialog` and `Alert Dialog` triggers and on a Menubar's, so those keep the fill. The other triggers show none while open, and still fill under the pointer and while pressed.
