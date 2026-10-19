---
'@navecss/base-ui': patch
---

Base UI 1.9.0 is now tested, alongside every minor from 1.3.0 to 1.8.0. The wrappers do not change:
everything Base UI 1.9.0 adds is left out, because this package supports Base UI from 1.3 and an app
on an older Base UI would fail to build on a name it does not export. The README lists what that
leaves out:

- The Menu's filtering parts, `Menu.FilterProvider`, `Menu.Input`, `Menu.List`, `Menu.Empty`,
  `Menu.Clear` and `Menu.useFilter`, which Base UI marks as a preview. Import them from
  `@base-ui/react/menu`; Nave does not style them.
- The objects that name each part's data attributes and CSS variables, such as
  `DialogPopupDataAttributes`. They come through as types only; import their values from Base UI.
- Five types under a part: `OpenChangeEventDetails` under the roots of Select, Combobox and
  Autocomplete, and `Menu.Root.HighlightEventDetails` and `Menu.Root.HighlightEventReason`. Their
  flat names, such as `SelectRootOpenChangeEventDetails` and `MenuRootHighlightEventDetails`, work
  from this package.
