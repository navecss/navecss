---
'@navecss/base-ui': patch
---

A disabled `Accordion.Trigger` or `Collapsible.Trigger` now takes the disabled colour and the
`not-allowed` cursor on Base UI 1.9.0. From 1.9.0 a trigger that renders a native `<button>`, as it
does by default, is disabled with the `disabled` attribute and no longer carries
`aria-disabled="true"`, so the stylesheet's rule, which only matched `aria-disabled`, left it with
the enabled colour and a pointer cursor. The rule now matches `:disabled` as well. Nothing changes
on Base UI 1.3.0 to 1.8.0, or for a trigger rendered as another element.
