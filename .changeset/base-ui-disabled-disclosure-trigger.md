---
'@navecss/base-ui': patch
---

A disabled `Accordion.Trigger` or `Collapsible.Trigger` now takes the disabled colour and the
`not-allowed` cursor on Base UI 1.9.0. From 1.9.0 a trigger that renders a native `<button>`, as it
does by default, is disabled with the `disabled` attribute and no longer carries
`aria-disabled="true"`, so the stylesheet's rule, which only matched `aria-disabled`, left it with
the enabled colour and a pointer cursor. The rule now matches `:disabled` as well.

For a trigger that Base UI disables, nothing changes on Base UI 1.3.0 to 1.8.0, which mark it with
`aria-disabled`, and nothing changes for a trigger rendered as another element
(`nativeButton={false}`), which carries `aria-disabled` at every version. One case changes on every
version: an enabled trigger that renders its default native `<button>` inside a
`<fieldset disabled>`. The browser disables that button even though Base UI does not, so it now
takes the disabled colour and the `not-allowed` cursor where it used to keep the enabled colour and
a pointer cursor, which is how Nave's `Button` already looks inside a disabled fieldset. A trigger
in the fieldset's first `<legend>` is not disabled by the browser and keeps the enabled colour and
pointer cursor.
