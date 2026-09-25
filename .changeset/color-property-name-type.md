---
'@navecss/tokens': minor
---

`@navecss/tokens` (and `@navecss/tokens/js`) now exports a type, `ColorPropertyName`: the union of every `--nave-color-*` custom-property name the stylesheet defines, the `--nave-color-tint` seed included. Use it to type-check a colour property name you pass to `element.style.setProperty()`, `getPropertyValue()` or your own override tooling, so a typo or a name the stylesheet no longer defines fails at compile time instead of silently doing nothing. It is a type only: nothing is added to `tokens` or to any runtime export, and colour values stay in `@navecss/tokens/css`, where the browser resolves them for the active colour scheme. `TokenName` and `TokenValue` are unchanged, and no name belongs to both `TokenName` and `ColorPropertyName`; write `TokenName | ColorPropertyName` for every typed Nave name.
