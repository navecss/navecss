---
'@navecss/core': patch
---

`@nave` now knows six more CSS properties, read from mdn-data 2.37.2: `flex-line-count`,
`link-parameters`, `path-length`, `scroll-axis-lock`, `text-fit` and `window-drag`. A marker on a
directive that names one of them is no longer reported as "not a CSS property", and `all` counts as
resetting each of them, as it does every other property it resets. No property was removed or
changed, and none of Nave's atoms sets one of the six, so no warning about a later declaration
overriding an atom changes.
